// In-cabin driver monitoring with MediaPipe Face Landmarker, entirely on this device.
// Two questions, every frame:
//   1. Are the eyes on the road? Gaze = head pose + eye direction (see gaze.ts), compared with a
//      calibration taken while the driver looks ahead. A glance under 2 s is normal driving;
//      2 s or more is a warning; looking down that long is called out as a likely phone.
//   2. Is the driver falling asleep? Eye closure (blendshapes), PERCLOS over 20 s, continuous
//      closure (microsleep), yawns (jaw open) and a dropped head.
// Video never leaves the browser. The panel reads a 10 Hz summary from the store; the overlay
// reads the latest frame directly, so drawing does not re-render React.
import { create } from 'zustand'
import type { FaceLandmarker as FL, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { calibrate, classify, gaze, measure, onRoad, smooth, type Attention, type Calibration, type Gaze, type Raw } from './gaze'

export type FatigueLevel = 'awake' | 'drowsy' | 'microsleep'

export interface FatigueState {
  status: 'off' | 'starting' | 'running' | 'error'
  error: string | null
  level: FatigueLevel
  attention: Attention
  eyesClosed: boolean
  perclos: number // share of the last 20 s with eyes mostly closed
  closedFor: number // seconds of the current continuous closure
  offFor: number // seconds the eyes have been off the road, now
  onShare: number // share of the last 30 s with the eyes on the road
  yawns: number // in the last 60 s
  headDown: boolean
  face: boolean
  calibration: number // 0..1 while calibrating
  gaze: Gaze | null
  history: number[] // last 30 s at 4 Hz: 0 on road, 1 glance, 2 off road, 3 closed
}

export const useFatigue = create<FatigueState>(() => ({
  status: 'off',
  error: null,
  level: 'awake',
  attention: 'calibrating',
  eyesClosed: false,
  perclos: 0,
  closedFor: 0,
  offFor: 0,
  onShare: 1,
  yawns: 0,
  headDown: false,
  face: false,
  calibration: 0,
  gaze: null,
  history: [],
}))

/** The latest frame, for the overlay: landmarks it draws and the gaze it points. */
export const frame: { landmarks: NormalizedLandmark[] | null; gaze: Gaze | null; onRoad: boolean; closed: boolean } = {
  landmarks: null,
  gaze: null,
  onRoad: true,
  closed: false,
}

const WASM = '/mediapipe/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const CAL_FRAMES = 45 // about 1.5 s of looking at the road

let landmarker: FL | null = null
let stream: MediaStream | null = null
let raf = 0
const frames: { t: number; closed: boolean }[] = []
const attn: { t: number; v: number }[] = []
const yawnTimes: number[] = []
let closedSince = 0
let offSince = 0
let jawSince = 0
let calSamples: Raw[] = []
let cal: Calibration | null = null
let smoothed: Gaze | null = null
let lastPublish = 0
let lastHist = 0
let history: number[] = []

export async function startMonitor(video: HTMLVideoElement) {
  if (useFatigue.getState().status === 'running') return
  useFatigue.setState({ status: 'starting', error: null })
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
    video.srcObject = stream
    await video.play()
    if (!landmarker) {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM)
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
    }
    recalibrate()
    useFatigue.setState({ status: 'running' })
    loop(video)
  } catch (e) {
    stopMonitor()
    const msg = e instanceof Error ? e.message : String(e)
    useFatigue.setState({ status: 'error', error: msg.includes('Permission') || msg.includes('NotAllowed') ? 'Camera permission was declined.' : msg })
  }
}

/** Look at the road and call this: the next 1.5 s of face becomes "eyes on the road". */
export function recalibrate() {
  calSamples = []
  cal = null
  smoothed = null
  offSince = 0
  useFatigue.setState({ attention: 'calibrating', calibration: 0 })
}

export function stopMonitor() {
  cancelAnimationFrame(raf)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  frames.length = 0
  attn.length = 0
  yawnTimes.length = 0
  history = []
  frame.landmarks = null
  frame.gaze = null
  useFatigue.setState({ status: 'off', level: 'awake', attention: 'calibrating', face: false, closedFor: 0, offFor: 0, perclos: 0, yawns: 0, gaze: null, history: [] })
}

function loop(video: HTMLVideoElement) {
  raf = requestAnimationFrame(() => loop(video))
  if (!landmarker || video.readyState < 2) return
  const now = performance.now()
  const res = landmarker.detectForVideo(video, now)
  const cats = res.faceBlendshapes?.[0]?.categories
  const lm = res.faceLandmarks?.[0]
  if (!cats || !lm) {
    frame.landmarks = null
    if (now - lastPublish > 100) {
      lastPublish = now
      useFatigue.setState({ face: false })
    }
    return
  }
  const blend = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0
  const raw = measure(lm, blend)
  const closed = raw.closed > 0.5
  const jaw = blend('jawOpen')

  // calibration: frames with the eyes open, while the driver looks ahead
  if (!cal) {
    if (!closed) calSamples.push(raw)
    if (calSamples.length >= CAL_FRAMES) cal = calibrate(calSamples)
  }
  const g = cal ? (smoothed = smooth(smoothed, gaze(raw, cal))) : null
  const road = g ? onRoad(g) : true
  const headDown = !!g && g.headPitch < -20

  frames.push({ t: now, closed })
  while (frames.length && now - frames[0].t > 20_000) frames.shift()
  const perclos = frames.filter((f) => f.closed).length / Math.max(1, frames.length)

  if (closed) closedSince ||= now
  else closedSince = 0
  const closedFor = closedSince ? (now - closedSince) / 1000 : 0

  // eyes off the road (closure is counted separately, as drowsiness)
  if (!road && !closed) offSince ||= now
  else if (road) offSince = 0
  const offFor = offSince ? (now - offSince) / 1000 : 0

  attn.push({ t: now, v: road && !closed ? 1 : 0 })
  while (attn.length && now - attn[0].t > 30_000) attn.shift()
  const onShare = attn.reduce((a, b) => a + b.v, 0) / Math.max(1, attn.length)

  if (jaw > 0.55) jawSince ||= now
  else {
    if (jawSince && now - jawSince > 1200) yawnTimes.push(now)
    jawSince = 0
  }
  while (yawnTimes.length && now - yawnTimes[0] > 60_000) yawnTimes.shift()

  const attention = classify({ calibrated: !!cal, onRoad: road, offFor, pitch: g?.pitch ?? 0, closedFor, headDropped: headDown, perclos, yawns: yawnTimes.length })
  const level: FatigueLevel = attention === 'microsleep' ? 'microsleep' : attention === 'drowsy' ? 'drowsy' : 'awake'

  frame.landmarks = lm
  frame.gaze = g
  frame.onRoad = road
  frame.closed = closed

  if (now - lastHist > 250) {
    lastHist = now
    history = [...history.slice(-119), closed ? 3 : road ? 0 : offFor >= 2 ? 2 : 1]
  }
  if (now - lastPublish < 100) return
  lastPublish = now
  useFatigue.setState({
    face: true,
    eyesClosed: closed,
    perclos,
    closedFor,
    offFor,
    onShare,
    yawns: yawnTimes.length,
    headDown,
    level,
    attention,
    calibration: cal ? 1 : calSamples.length / CAL_FRAMES,
    gaze: g,
    history,
  })
}

// ---------- alerting: a chime and a voice, never a modal ----------

let audio: AudioContext | null = null
/** Two-tone chime; `pan` in -1 (left) .. 1 (right) places it on the side of the threat. */
export function chime(urgent: boolean, pan = 0) {
  try {
    audio ??= new AudioContext()
    const t0 = audio.currentTime
    const notes = urgent ? [880, 660, 880] : [660, 880]
    const panner = audio.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    panner.connect(audio.destination)
    notes.forEach((f, i) => {
      const o = audio!.createOscillator()
      const g = audio!.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16)
      o.connect(g).connect(panner)
      o.start(t0 + i * 0.18)
      o.stop(t0 + i * 0.18 + 0.18)
    })
  } catch {
    /* audio may be blocked until a user gesture */
  }
}

export function speak(text: string) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = speechSynthesis.getVoices().find((v) => v.lang === 'en-IN') ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'))
  if (voice) u.voice = voice
  u.rate = 1.02
  speechSynthesis.speak(u)
}
