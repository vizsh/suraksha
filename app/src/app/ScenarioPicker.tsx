// Choose what the whole prototype plays: a scenario is a road, a time of day and a set of things
// going wrong on it. The choice rides on the shared clock, so every device follows it.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDownIcon, CloudRainIcon, MapTrifoldIcon, MoonIcon, SunHorizonIcon, SunIcon, XIcon } from '@phosphor-icons/react'
import { useSim } from '../world/store'
import { setScenario } from '../world/clock'
import { SCENARIOS, type ScenarioDef } from '../world/scenarios'
import { chainRoad, type CorridorData } from '../world/corridor'

export const useScenarioPicker = (() => {
  let set: ((v: boolean) => void) | null = null
  return { open: () => set?.(true), bind: (f: (v: boolean) => void) => (set = f) }
})()

/** The chip that shows the scenario playing; opens the picker. */
export function ScenarioChip({ night = false }: { night?: boolean }) {
  const sc = useSim((s) => s.world?.scenario)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    useScenarioPicker.bind(setOpen)
  }, [])
  if (!sc) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Choose a scenario: road, time and what goes wrong"
        className={'flex min-w-0 items-center gap-2 px-3 py-1.5 text-[13px] ' + (night ? 'bg-night-2/90 text-clay hover:bg-night-2' : 'bg-clay/90 text-ink hover:bg-clay')}
        style={{ boxShadow: night ? 'inset 0 0 0 1px rgba(231,227,217,0.25)' : 'inset 0 0 0 1px rgba(28,34,38,0.3)' }}
      >
        <TimeIcon sc={sc} size={14} />
        <span className="hidden max-w-[220px] truncate sm:inline">{sc.short}</span>
        <CaretDownIcon size={12} className="opacity-60" />
      </button>
      {createPortal(<ScenarioSheet open={open} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function TimeIcon({ sc, size }: { sc: ScenarioDef; size: number }) {
  if (sc.rain) return <CloudRainIcon size={size} />
  if (sc.time === 'night') return <MoonIcon size={size} />
  if (sc.time === 'dusk') return <SunHorizonIcon size={size} />
  return <SunIcon size={size} />
}

const TIME_WORD = { day: 'Day', dusk: 'Dusk', night: 'Night' } as const

const NEXT: [string, string][] = [
  ['Ambulance at rush hour', 'Cars ahead on JVLR are told to keep left as it approaches'],
  ['Signal failure in the rain', 'A junction goes dark; police take over; cars are told by lane'],
  ['Crew working in the lane at night', 'A repair crew geofenced; cars slow before the cones'],
  ['Ganpati procession', 'A road closes for the evening; the crowd spills off the footpath'],
  ['Two-wheeler on a broken service road', 'Potholes felt by phones in pockets, warned by voice'],
]

export function ScenarioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const world = useSim((s) => s.world)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && world && (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-[#0b0f12]/55 p-3 backdrop-blur-[2px] sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a scenario"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[1180px] overflow-auto bg-clay text-ink"
            style={{ boxShadow: '0 40px 80px -30px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(28,34,38,0.2)' }}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-7">
              <div>
                <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-ink-3">
                  <MapTrifoldIcon size={14} />
                  Scenarios
                </div>
                <h2 className="mt-1 text-[22px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 115" }}>
                  Choose the road, the hour and what goes wrong
                </h2>
                <p className="mt-1 max-w-[70ch] text-[13px] text-ink-3">
                  Every surface follows: the twin, the cockpit, the in-dash screen, the phone and the ops console. Devices linked to this one switch too, and the loop restarts from its first second.
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 text-ink-3 hover:bg-clay-deep hover:text-ink" aria-label="Close">
                <XIcon size={18} />
              </button>
            </div>
            <ul className="grid gap-px bg-rule p-px sm:grid-cols-2 lg:grid-cols-3">
              {SCENARIOS.map((sc) => (
                <li key={sc.id} className="bg-clay">
                  <Card sc={sc} data={world.data} active={world.scenario.id === sc.id} onPick={() => (world.scenario.id === sc.id ? onClose() : (setScenario(sc.id), onClose()))} />
                </li>
              ))}
              <li className="bg-clay p-5">
                <div className="text-[11px] uppercase tracking-[0.14em] text-ink-3">Next scenarios</div>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-2">The same engine and roads take these next; each is a script, not new code.</p>
                <ul className="mt-3 space-y-2 text-[13px]">
                  {NEXT.map(([t, d]) => (
                    <li key={t}>
                      <span className="font-medium">{t}</span>
                      <span className="block text-[12px] text-ink-3">{d}</span>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Card({ sc, data, active, onPick }: { sc: ScenarioDef; data: CorridorData; active: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick} className={'group flex h-full w-full flex-col text-left transition-colors ' + (active ? 'bg-clay-deep' : 'hover:bg-clay-deep/60')}>
      <RouteMap sc={sc} data={data} />
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="flex items-center gap-1 px-1.5 py-0.5" style={{ boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.25)' }}>
            <TimeIcon sc={sc} size={11} />
            {TIME_WORD[sc.time]}
            {sc.rain ? ', rain' : ''}
          </span>
          <span className="truncate text-ink-3">{sc.road}</span>
        </div>
        <div className="mt-2 text-[15px] font-semibold leading-snug" style={{ fontVariationSettings: "'wdth' 110" }}>
          {sc.title}
        </div>
        <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{sc.summary}</p>
        <ul className="mt-3 flex flex-wrap gap-1">
          {sc.hazards.map((h) => (
            <li key={h} className="bg-ink/[0.06] px-1.5 py-0.5 text-[11px] text-ink-2">
              {h}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-4">
          <span className={'inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium ' + (active ? 'bg-ink text-clay' : 'text-ink group-hover:bg-ink group-hover:text-clay')} style={active ? undefined : { boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.35)' }}>
            {active ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-live" /> Playing now
              </>
            ) : (
              'Play this scenario'
            )}
          </span>
        </div>
      </div>
    </button>
  )
}

const routeCache = new Map<string, string>()

/** Powai's roads, faint, with this scenario's stretch of route drawn over them. */
function RouteMap({ sc, data }: { sc: ScenarioDef; data: CorridorData }) {
  const [W, H] = data.size
  const roads = useMemo(() => {
    const k = 'roads'
    if (!routeCache.has(k))
      routeCache.set(
        k,
        data.roads
          .filter((r) => r.kind !== 'footway' && r.kind !== 'service')
          .map((r) => 'M' + r.pts.map(([x, z]) => `${(x + W / 2).toFixed(0)} ${(z + H / 2).toFixed(0)}`).join('L'))
          .join(''),
      )
    return routeCache.get(k)!
  }, [data, W, H])
  const route = useMemo(() => {
    const k = 'r:' + sc.id
    if (!routeCache.has(k)) {
      const path = chainRoad(data.roads, sc.route)
      const s0 = sc.start(path.length)
      const pts: string[] = []
      for (let s = s0; s < Math.min(path.length, s0 + 760); s += 8) {
        const p = path.at(s, 0)
        pts.push(`${(p.x + W / 2).toFixed(0)} ${(p.z + H / 2).toFixed(0)}`)
      }
      const a = path.at(s0, 0)
      const f = path.at(s0 + sc.focus, 0)
      routeCache.set(k, JSON.stringify({ d: 'M' + pts.join('L'), start: [a.x + W / 2, a.z + H / 2], focus: [f.x + W / 2, f.z + H / 2] }))
    }
    return JSON.parse(routeCache.get(k)!) as { d: string; start: [number, number]; focus: [number, number] }
  }, [sc, data, W, H])
  const night = sc.time === 'night'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block aspect-[16/9] w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={W} height={H} fill={night ? '#151b20' : sc.time === 'dusk' ? '#2a2830' : '#e4dfd3'} />
      <path d={roads} fill="none" stroke={night || sc.time === 'dusk' ? 'rgba(231,227,217,0.16)' : 'rgba(28,34,38,0.16)'} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={route.d} fill="none" stroke={night || sc.time === 'dusk' ? '#7fb6e6' : '#1f6fb2'} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={route.start[0]} cy={route.start[1]} r={22} fill={night || sc.time === 'dusk' ? '#e7e3d9' : '#1c2226'} />
      <circle cx={route.focus[0]} cy={route.focus[1]} r={30} fill="#e0401f" />
      <circle cx={route.focus[0]} cy={route.focus[1]} r={58} fill="none" stroke="#e0401f" strokeWidth={6} opacity={0.6} />
    </svg>
  )
}
