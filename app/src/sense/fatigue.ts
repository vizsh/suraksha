// In-cabin driver monitoring with MediaPipe Face Landmarker, entirely on this device.
// Signals: eye closure (blendshapes), PERCLOS over a rolling window, continuous closure
// (microsleep), yawns (jaw open) and head drop. Video never leaves the browser.
import { create } from 'zustand'
import type { FaceLandmarker as FL, NormalizedLandmark } from '@mediapipe/tasks-vision'

export type FatigueLevel = 'awake' | 'drowsy' | 'microsleep'

export interface FatigueState {
  status: 'off' | 'starting' | 'running' | 'error'
  error: string | null
  level: FatigueLevel
  eyesClosed: boolean
  perclos: number // share of the last 20 s with eyes mostly closed
  closedFor: number // seconds of the current continuous closure
  yawns: number // in the last 60 s
  headDown: boolean
  face: boolean
  eyePoints: NormalizedLandmark[]
}

export const useFatigue = create<FatigueState>(() => ({
  status: 'off',
  error: null,
  level: 'awake',
  eyesClosed: false,
  perclos: 0,
  closedFor: 0,
  yawns: 0,
  headDown: false,
  face: false,
  eyePoints: [],
}))

const WASM = '/mediapipe/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
// eye contour landmarks (MediaPipe face mesh indices)
const EYES = [33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380]

let landmarker: FL | null = null
let stream: MediaStream | null = null
let raf = 0
const frames: { t: number; closed: boolean }[] = []
const yawnTimes: number[] = []
let closedSince = 0
let jawSince = 0

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
        outputFacialTransformationMatrixes: true,
      })
    }
    useFatigue.setState({ status: 'running' })
    loop(video)
  } catch (e) {
    stopMonitor()
    const msg = e instanceof Error ? e.message : String(e)
    useFatigue.setState({ status: 'error', error: msg.includes('Permission') || msg.includes('NotAllowed') ? 'Camera permission was declined.' : msg })
  }
}

export function stopMonitor() {
  cancelAnimationFrame(raf)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  frames.length = 0
  yawnTimes.length = 0
  useFatigue.setState({ status: 'off', level: 'awake', face: false, eyePoints: [], closedFor: 0, perclos: 0, yawns: 0 })
}

function score(name: string, cats: { categoryName: string; score: number }[]) {
  return cats.find((c) => c.categoryName === name)?.score ?? 0
}

function loop(video: HTMLVideoElement) {
  raf = requestAnimationFrame(() => loop(video))
  if (!landmarker || video.readyState < 2) return
  const now = performance.now()
  const res = landmarker.detectForVideo(video, now)
  const cats = res.faceBlendshapes?.[0]?.categories
  if (!cats || !res.faceLandmarks?.[0]) {
    useFatigue.setState({ face: false, eyePoints: [] })
    return
  }
  const blink = (score('eyeBlinkLeft', cats) + score('eyeBlinkRight', cats)) / 2
  const jaw = score('jawOpen', cats)
  const closed = blink > 0.5

  // head pitch from the facial transformation matrix (column-major 4x4)
  const m = res.facialTransformationMatrixes?.[0]?.data
  const pitch = m ? Math.atan2(-m[9], m[10]) * (180 / Math.PI) : 0
  const headDown = pitch < -18

  frames.push({ t: now, closed })
  while (frames.length && now - frames[0].t > 20_000) frames.shift()
  const perclos = frames.filter((f) => f.closed).length / Math.max(1, frames.length)

  if (closed) closedSince ||= now
  else closedSince = 0
  const closedFor = closedSince ? (now - closedSince) / 1000 : 0

  if (jaw > 0.55) jawSince ||= now
  else {
    if (jawSince && now - jawSince > 1200) yawnTimes.push(now)
    jawSince = 0
  }
  while (yawnTimes.length && now - yawnTimes[0] > 60_000) yawnTimes.shift()

  const level: FatigueLevel = closedFor > 1.2 || (headDown && closed) ? 'microsleep' : perclos > 0.15 || yawnTimes.length >= 2 ? 'drowsy' : 'awake'
  useFatigue.setState({
    face: true,
    eyesClosed: closed,
    perclos,
    closedFor,
    yawns: yawnTimes.length,
    headDown,
    level,
    eyePoints: EYES.map((i) => res.faceLandmarks[0][i]),
  })
}

// ---------- alerting: a chime and a voice, never a modal ----------

let audio: AudioContext | null = null
export function chime(urgent: boolean) {
  try {
    audio ??= new AudioContext()
    const t0 = audio.currentTime
    const notes = urgent ? [880, 660, 880] : [660, 880]
    notes.forEach((f, i) => {
      const o = audio!.createOscillator()
      const g = audio!.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16)
      o.connect(g).connect(audio!.destination)
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
