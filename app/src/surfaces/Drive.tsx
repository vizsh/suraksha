import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EyeIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react'
import { useSim } from '../world/store'
import { Contained, alertCopy, topAlert } from '../product/bits'
import { HUD_H, HUD_W, Hud } from '../product/Car'
import { SurfaceNav } from '../app/SurfaceNav'
import { chime, speak, useFatigue } from '../sense/fatigue'
import { DriverMonitor } from '../product/DriverMonitor'
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
    // place the chime on the threat's side of the road, relative to our lane
    const pan = (top.threat.offset - world.egoLane(useSim.getState().t)) / 6
    chime(top.tier === 'critical', top.threat.kind === 'pedestrian' ? -0.8 : pan)
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
      <MonitorAlerts />
      <p className="absolute bottom-2 left-4 right-4 z-30 text-right text-[10px] text-clay/40">Simulated drive: {world.scenario.short}. Driver monitoring (eyes, head and gaze) is real and stays on this device.</p>
    </main>
  )
}

/** Alerts from the in-cabin monitor: voice and chime by state, a network report for a microsleep. */
function MonitorAlerts() {
  const attention = useFatigue((s) => s.attention)
  const offFor = useFatigue((s) => s.offFor)
  const running = useFatigue((s) => s.status === 'running')
  const add = useEvents((s) => s.addObservation)
  const world = useSim((s) => s.world)!
  const last = useRef(attention)
  const lastSpoken = useRef(0)
  const urged = useRef(false)

  useEffect(() => {
    if (attention === last.current) return
    last.current = attention
    const now = Date.now()
    const say = (text: string, urgent = false) => {
      if (now - lastSpoken.current < 6000 && !urgent) return
      lastSpoken.current = now
      chime(urgent)
      speak(text)
    }
    if (attention === 'eyes-off-road') say('Eyes on the road.')
    if (attention === 'looking-down') say('Eyes up. Put the phone away.')
    if (attention === 'drowsy') say('You seem tired. There is a rest stop in 2 kilometres.')
    if (attention === 'microsleep') {
      say('Eyes on the road. Pull over when it is safe.', true)
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
  }, [attention, add, world])

  // still away after 4 s: one urgent chime
  useEffect(() => {
    if (offFor < 4) urged.current = false
    else if (!urged.current) {
      urged.current = true
      chime(true)
    }
  }, [offFor])

  const show = running && (attention === 'eyes-off-road' || attention === 'looking-down' || attention === 'microsleep')
  const red = attention === 'microsleep' || offFor >= 4
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute left-1/2 top-[18%] z-30 -translate-x-1/2"
        >
          <div
            className="flex items-center gap-3 rounded-full px-6 py-3 text-[clamp(18px,2.2vw,28px)] font-semibold text-white"
            style={{
              background: red ? 'rgba(224,64,31,0.88)' : 'rgba(209,154,28,0.88)',
              boxShadow: `0 0 0 1px rgba(255,255,255,0.25), 0 0 60px ${red ? 'rgba(224,64,31,0.55)' : 'rgba(209,154,28,0.45)'}`,
              fontVariationSettings: "'wdth' 112",
            }}
          >
            <EyeIcon size={26} weight="bold" />
            {attention === 'microsleep' ? 'Wake up. Pull over safely' : attention === 'looking-down' ? 'Eyes up' : 'Eyes on the road'}
            {attention !== 'microsleep' && <span className="figures text-[0.7em] font-normal opacity-85">{offFor.toFixed(1)} s</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
