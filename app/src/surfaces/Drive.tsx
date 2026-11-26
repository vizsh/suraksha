import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EyeIcon, SpeakerHighIcon, SpeakerSlashIcon, VideoCameraIcon } from '@phosphor-icons/react'
import { useSim } from '../world/store'
import { Contained, alertCopy, topAlert } from '../product/bits'
import { HUD_H, HUD_W, Hud } from '../product/Car'
import { SurfaceNav } from '../app/SurfaceNav'
import { chime, speak, startMonitor, stopMonitor, useFatigue } from '../sense/fatigue'
import { useEvents } from '../sync/events'
import { engineNow, simTime } from '../world/clock'
import { sampleAgents, EGO_PLATE } from '../world/scenario'

/** The cockpit: windshield HUD over the night road, voice alerts, and on-device driver monitoring. */
export default function Drive() {
  const world = useSim((s) => s.world)!
  const feed = useSim((s) => s.feed)
  const [voice, setVoice] = useState(false)
  const spoken = useRef(new Set<string>())

  // Speak each new critical or advisory alert once, in confidence-aware words.
  useEffect(() => {
    if (!voice) return
    const top = topAlert(feed)
    if (!top) return
    const key = `${top.id}:${top.threat.state}:${top.tier}`
    if (spoken.current.has(key)) return
    spoken.current.add(key)
    const c = alertCopy(top)
    if (top.tier === 'critical') chime(true)
    speak(`${c.title}. ${c.detail.replace(' m', ' metres')}.`)
  }, [feed, voice])

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-night text-clay">
      <Contained w={HUD_W} h={HUD_H} className="bg-night">
        <Hud world={world} />
      </Contained>
      <SurfaceNav tone="night" />
      <div className="absolute right-4 top-4 z-40 flex gap-2">
        <button
          onClick={() => {
            setVoice((v) => !v)
            if (!voice) chime(false)
          }}
          aria-pressed={voice}
          className="flex items-center gap-2 bg-night-2/90 px-3 py-1.5 text-[13px] text-clay hover:bg-night-2"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.25)' }}
        >
          {voice ? <SpeakerHighIcon size={15} /> : <SpeakerSlashIcon size={15} />}
          {voice ? 'Voice alerts on' : 'Voice alerts off'}
        </button>
      </div>
      <DriverMonitor />
      <p className="absolute bottom-2 right-4 z-30 text-[10px] text-clay/40">Simulated night drive on JVLR, Powai. Driver monitoring is real and stays on this device.</p>
    </main>
  )
}

/** Webcam fatigue detection. A microsleep triggers a chime, a voice prompt and a network report. */
function DriverMonitor() {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const f = useFatigue()
  const add = useEvents((s) => s.addObservation)
  const world = useSim((s) => s.world)!
  const lastLevel = useRef(f.level)

  // react to level changes: voice for drowsy, chime + voice + network report for a microsleep
  useEffect(() => {
    if (f.level === lastLevel.current) return
    lastLevel.current = f.level
    if (f.level === 'drowsy') speak('You seem tired. There is a rest stop in 2 kilometres.')
    if (f.level === 'microsleep') {
      chime(true)
      speak('Eyes on the road. Pull over when it is safe.')
      const ego = sampleAgents(world, simTime()).find((a) => a.id === 'ego')!
      add({
        id: `monitor-${Date.now()}`,
        t: engineNow(),
        kind: 'erratic-vehicle',
        source: 'driver-monitor',
        sourceId: `monitor:${EGO_PLATE}`,
        pos: [ego.x, ego.z],
        conf: 0.85,
        who: 'In-cabin monitor',
        how: 'Microsleep detected, nearby cars warned',
      })
    }
  }, [f.level, add, world])

  // draw the eye contour points over the mirrored preview
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = f.eyesClosed ? '#e0401f' : '#7fb6e6'
    for (const p of f.eyePoints) {
      ctx.beginPath()
      ctx.arc((1 - p.x) * c.width, p.y * c.height, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [f.eyePoints, f.eyesClosed])

  const running = f.status === 'running'
  const word = f.level === 'microsleep' ? 'Microsleep' : f.level === 'drowsy' ? 'Drowsy' : f.face ? 'Alert' : 'No face in view'
  const tone = f.level === 'microsleep' ? '#e0401f' : f.level === 'drowsy' ? '#d19a1c' : '#7fb6e6'

  return (
    <div className="absolute right-4 top-16 z-40 w-[280px] bg-night-2/95 text-clay" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.2)' }}>
      <div className="flex items-center gap-2 border-b border-night-rule px-3 py-2 text-[13px]">
        <EyeIcon size={15} />
        Driver monitor
        <span className="flex-1" />
        {running ? (
          <button onClick={stopMonitor} className="text-[12px] text-clay/70 hover:text-clay">
            Stop
          </button>
        ) : null}
      </div>
      <div className="relative aspect-[4/3] bg-black/40">
        <video ref={video} className={'h-full w-full -scale-x-100 object-cover ' + (running ? 'opacity-80' : 'opacity-0')} muted playsInline />
        <canvas ref={canvas} width={300} height={225} className="pointer-events-none absolute inset-0 h-full w-full" />
        {!running && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div>
              <button
                onClick={() => video.current && startMonitor(video.current)}
                disabled={f.status === 'starting'}
                className="inline-flex items-center gap-2 bg-clay px-3 py-2 text-[13px] font-medium text-ink hover:bg-clay-deep disabled:opacity-60"
              >
                <VideoCameraIcon size={15} />
                {f.status === 'starting' ? 'Loading face model' : 'Start monitoring'}
              </button>
              <p className="mt-2 text-[11px] leading-snug text-clay/60">{f.error ?? 'Uses your webcam. Video is processed on this device and never sent.'}</p>
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {running && (
          <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-3 border-t border-night-rule text-center">
            <div className="col-span-3 border-b border-night-rule px-3 py-2 text-left">
              <dt className="sr-only">State</dt>
              <dd className="text-[18px] font-semibold" style={{ color: tone, fontVariationSettings: "'wdth' 110" }}>
                {word}
              </dd>
            </div>
            <Metric label="eyes closed, 20 s" value={`${Math.round(f.perclos * 100)}%`} />
            <Metric label="closed now" value={`${f.closedFor.toFixed(1)} s`} />
            <Metric label="yawns, 1 min" value={String(f.yawns)} />
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-night-rule px-2 py-2 last:border-r-0">
      <dd className="figures text-[15px]">{value}</dd>
      <dt className="text-[10px] leading-tight text-clay/55">{label}</dt>
    </div>
  )
}
