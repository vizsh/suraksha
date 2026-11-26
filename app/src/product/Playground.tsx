// Fusion Lab: add evidence about one spot of road and watch the real Threat Intelligence Engine
// decide. Same fusion code that drives every surface; nothing here is scripted except Autoplay,
// which only presses the same buttons a visitor can.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowCounterClockwiseIcon,
  CameraIcon,
  CarProfileIcon,
  DeviceMobileIcon,
  EyeSlashIcon,
  PlayIcon,
  UserIcon,
  VideoCameraIcon,
  WrenchIcon,
} from '@phosphor-icons/react'
import { decay, fuse, RELIABILITY, THRESHOLD, clusterKind } from '../engine/fusion'
import { implicitObstacles } from '../engine/implicit'
import type { HazardKind, Manoeuvre, Observation, SourceKind } from '../engine/types'
import type { World } from '../world/scenario'
import { loadSatellite } from '../three/realism/Ground'
import { STATE, StateGlyph } from './bits'

type Icon = typeof CameraIcon
interface Action {
  key: string
  label: string
  detail: string
  icon: Icon
  source: SourceKind | 'swerve-cluster'
  make: (n: number) => { obs?: Observation; man?: Manoeuvre[] }
}

const LIFE = ['noticed', 'potential', 'confirmed', 'resolved'] as const
const SPAN = 120 // metres shown across the imagery
const AUTOPLAY = ['citizen', 'swerve', 'vision', 'clear', 'clear2', 'clear3']

/** Crop of the real satellite image around the spot, as a data URL. */
function useSatelliteCrop(world: World, center: [number, number]) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadSatellite(world.data).then((img) => {
      const src = img.texture.image as HTMLCanvasElement
      const pxPerM = src.width / img.size[0]
      const left = img.center[0] - img.size[0] / 2
      const top = img.center[1] - img.size[1] / 2
      const w = SPAN * pxPerM
      const h = (SPAN * 0.625) * pxPerM
      const c = document.createElement('canvas')
      c.width = 1280
      c.height = 800
      c.getContext('2d')!.drawImage(src, (center[0] - left) * pxPerM - w / 2, (center[1] - top) * pxPerM - h / 2, w, h, 0, 0, 1280, 800)
      if (live) setUrl(c.toDataURL('image/jpeg', 0.85))
    })
    return () => {
      live = false
    }
  }, [world, center])
  return url
}

export function Playground({ world }: { world: World }) {
  const center = useMemo(() => world.script.find((o) => o.key === 'barricade-citizen')!.pos, [world])
  const sat = useSatelliteCrop(world, center)
  const [obs, setObs] = useState<Observation[]>([])
  const [man, setMan] = useState<Manoeuvre[]>([])
  const [now, setNow] = useState(Date.now())
  const [playing, setPlaying] = useState(false)
  const timers = useRef<number[]>([])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const jitter = (k = 6): [number, number] => [center[0] + (Math.random() - 0.5) * k, center[1] + (Math.random() - 0.5) * k]
  const base = (source: SourceKind, sourceId: string, kind: HazardKind, conf: number, who: string, how: string, extra: Partial<Observation> = {}): Observation => ({
    id: `pg-${Math.random().toString(36).slice(2)}`,
    t: Date.now(),
    kind,
    source,
    sourceId,
    pos: jitter(),
    conf,
    who,
    how,
    ...extra,
  })

  const actions: Action[] = [
    { key: 'citizen', icon: CameraIcon, source: 'citizen', label: 'Resident sends a photo', detail: 'New account, trust 0.6', make: (n) => ({ obs: base('citizen', `resident-${n}`, 'barricade', 0.9, 'Resident', 'Photo, new account', { reputation: 0.6 }) }) },
    {
      key: 'swerve',
      icon: CarProfileIcon,
      source: 'swerve-cluster',
      label: 'Three cars swerve here',
      detail: 'Nobody names it; behaviour does',
      make: (n) => ({ man: [0, 1, 2].map((i) => ({ id: `pgm-${n}-${i}`, t: Date.now() - (2 - i) * 900, vehicleId: `car-${n}-${i}`, pos: jitter(10), type: 'swerve' as const })) }),
    },
    { key: 'vision', icon: VideoCameraIcon, source: 'vision', label: 'A dashcam detects it', detail: 'Detector score 0.78', make: (n) => ({ obs: base('vision', `dashcam-${n}`, 'barricade', 0.78, 'Dashcam', 'Open-vocabulary detector') }) },
    { key: 'imu', icon: DeviceMobileIcon, source: 'imu', label: 'A phone feels a jolt', detail: 'Accelerometer, weak alone', make: (n) => ({ obs: base('imu', `phone-${n}`, 'unknown', 0.7, 'Phone', 'Accelerometer spike') }) },
    { key: 'same', icon: UserIcon, source: 'citizen', label: 'Same resident again', detail: 'Counts once: same source', make: () => ({ obs: base('citizen', 'resident-1', 'barricade', 0.9, 'Resident', 'Repeat report', { reputation: 0.6 }) }) },
    { key: 'clear', icon: EyeSlashIcon, source: 'vision', label: 'Cars pass, see nothing', detail: 'Negative evidence', make: (n) => ({ obs: base('vision', `passer-${n}`, 'barricade', 0.9, 'Passing car', 'Saw nothing', { polarity: -1 }) }) },
    { key: 'fix', icon: WrenchIcon, source: 'operator', label: 'Crew marks it repaired', detail: 'Operator closes it', make: () => ({ obs: base('operator', 'ops', 'barricade', 1, 'Crew', 'Repair done', { resolve: true }) }) },
  ]

  const run = (key: string) => {
    const a = actions.find((x) => x.key === key.replace(/\d$/, ''))!
    const n = Math.floor(Math.random() * 1e6)
    const out = a.make(n)
    if (out.obs) setObs((o) => [...o, out.obs!])
    if (out.man) setMan((m) => [...m, ...out.man!])
  }
  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPlaying(false)
    setObs([])
    setMan([])
  }
  const autoplay = () => {
    reset()
    setPlaying(true)
    AUTOPLAY.forEach((k, i) => timers.current.push(window.setTimeout(() => run(k), 400 + i * 1900)))
    timers.current.push(window.setTimeout(() => setPlaying(false), 400 + AUTOPLAY.length * 1900))
  }

  const implicit = implicitObstacles(man, now)
  const all = [...obs, ...implicit]
  const threat = fuse(all, now)[0]
  const state = threat?.state ?? null
  const idx = state ? LIFE.indexOf(state as (typeof LIFE)[number]) : -1
  const color = state ? STATE[state].color : '#7d8380'
  const conf = threat?.confidence ?? 0

  // one node per independent source, with its current weight in the fusion
  const kind = clusterKind(all)
  const nodes = useMemo(() => {
    const by = new Map<string, { id: string; who: string; how: string; source: SourceKind; e: number; neg: boolean; t: number }>()
    for (const o of all) {
      if (o.resolve) continue
      const e = RELIABILITY[o.source] * o.conf * (o.reputation ?? 1) * decay(now - o.t, kind)
      const prev = by.get(o.sourceId)
      if (!prev || e > prev.e) by.set(o.sourceId, { id: o.sourceId, who: o.who, how: o.how, source: o.source, e, neg: o.polarity === -1, t: o.t })
    }
    return [...by.values()].sort((a, b) => a.t - b.t)
  }, [all, now, kind])

  const words =
    state === 'confirmed'
      ? 'Confirmed. Drivers in lane 1 get a named, lane-level warning.'
      : state === 'potential'
        ? 'Potential. Drivers hear "possible barricade" until a stronger source agrees.'
        : state === 'noticed'
          ? 'Noticed. On the map, said softly: one source is a rumour.'
          : state === 'resolved'
            ? 'Resolved. Warnings stop; nobody gets a stale alert.'
            : state === 'faded'
              ? 'Faded. The evidence decayed before anyone confirmed it.'
              : 'Nothing known here yet. Add evidence, or press Autoplay.'

  // gauge geometry
  const R = 46
  const C = 2 * Math.PI * R
  const tick = (v: number) => {
    const a = -Math.PI / 2 + v * 2 * Math.PI
    return { x1: 60 + Math.cos(a) * 40, y1: 60 + Math.sin(a) * 40, x2: 60 + Math.cos(a) * 53, y2: 60 + Math.sin(a) * 53 }
  }

  return (
    <div className="grid overflow-hidden bg-[#11161a] text-clay lg:grid-cols-[380px_1fr]" style={{ boxShadow: '0 50px 100px -40px rgba(10,14,16,0.6)' }}>
      {/* evidence console */}
      <div className="flex flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold" style={{ fontVariationSettings: "'wdth' 115" }}>
              Evidence
            </div>
            <div className="text-[12px] text-clay/55">Barricade site, JVLR lane 1</div>
          </div>
          <div className="flex gap-2">
            <button onClick={autoplay} disabled={playing} className="flex items-center gap-1.5 bg-clay px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-white disabled:opacity-50">
              <PlayIcon size={13} weight="fill" />
              {playing ? 'Playing' : 'Autoplay'}
            </button>
            <button onClick={reset} aria-label="Start over" className="grid h-[32px] w-[32px] place-items-center text-clay/70 hover:text-clay" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.25)' }}>
              <ArrowCounterClockwiseIcon size={15} />
            </button>
          </div>
        </div>
        <ul className="flex-1 divide-y divide-white/[0.07]">
          {actions.map((a) => (
            <li key={a.key}>
              <button onClick={() => run(a.key)} disabled={playing} className="group grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-60">
                <span className="grid h-[34px] w-[34px] place-items-center text-clay/80 transition-colors group-hover:text-clay" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.2)' }}>
                  <a.icon size={17} />
                </span>
                <span>
                  <span className="block text-[14px] font-medium">{a.label}</span>
                  <span className="block text-[12px] text-clay/50">{a.detail}</span>
                </span>
                <span className="figures text-[11px] text-clay/45" title="Source reliability">
                  {a.source === 'swerve-cluster' ? RELIABILITY.swerve : RELIABILITY[a.source as SourceKind]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* instrument */}
      <div className="relative min-h-[560px]">
        {sat && <img src={sat} alt="Satellite view of the barricade site on JVLR" className="absolute inset-0 h-full w-full object-cover opacity-55 saturate-[0.7]" />}
        <div className="absolute inset-0 bg-gradient-to-br from-[#11161a]/70 via-[#11161a]/30 to-[#11161a]/85" />

        <svg viewBox="0 0 1000 620" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <style>{'@keyframes flow{to{stroke-dashoffset:-40}} .flow{animation:flow 1.1s linear infinite}'}</style>
          </defs>
          {/* swerve tracks */}
          {man.map((m, i) => {
            const x = 500 + ((m.pos[0] - center[0]) / SPAN) * 1000
            const y = 310 + ((m.pos[1] - center[1]) / (SPAN * 0.62)) * 620
            return <path key={m.id} d={`M${x - 10 + i * 4} ${y + 120} C ${x - 40} ${y + 40}, ${x + 40} ${y - 30}, ${x + 6} ${y - 110}`} fill="none" stroke="#7fb6e6" strokeWidth={2} strokeDasharray="6 6" opacity={0.75} />
          })}
          {/* evidence flowing into the threat */}
          {nodes.map((n, i) => {
            // spread sources over the upper arc around the threat
            const a = Math.PI + ((i + 1) / (nodes.length + 1)) * Math.PI
            const nx = 500 + Math.cos(a) * 330
            const ny = 330 + Math.sin(a) * 240
            const w = 1 + n.e * 9
            const c = n.neg ? '#9aa3a6' : n.source === 'swerve' ? '#7fb6e6' : '#f2c56b'
            return (
              <g key={n.id}>
                <line x1={nx} y1={ny} x2={500} y2={310} stroke={c} strokeWidth={w} strokeOpacity={0.35} />
                <line x1={nx} y1={ny} x2={500} y2={310} stroke={c} strokeWidth={Math.max(1.5, w * 0.45)} strokeDasharray="4 16" className="flow" />
                <circle cx={nx} cy={ny} r={7} fill="#11161a" stroke={c} strokeWidth={2.5} />
                <text x={nx} y={ny - 16} textAnchor="middle" fill="#ece9e1" fontSize={15} fontWeight={600}>
                  {n.neg ? '− ' : ''}
                  {n.who}
                </text>
                <text x={nx} y={ny + 26} textAnchor="middle" fill="#ece9e1" opacity={0.6} fontSize={12}>
                  weight {n.e.toFixed(2)}
                </text>
              </g>
            )
          })}
          {/* the threat */}
          <circle cx={500} cy={310} r={18} fill={color} opacity={state ? 0.9 : 0.4} />
          {state === 'confirmed' && <circle cx={500} cy={310} r={18} fill="none" stroke={color} strokeWidth={2} className="animate-ping" style={{ transformOrigin: '500px 310px' }} />}
        </svg>

        {/* gauge and verdict */}
        <div className="absolute bottom-5 left-5 right-5 flex flex-col gap-4 bg-[#0c1013]/85 p-5 backdrop-blur-sm sm:flex-row sm:items-center" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.14)' }}>
          <svg viewBox="0 0 120 120" className="h-[112px] w-[112px] shrink-0">
            <circle cx={60} cy={60} r={R} fill="none" stroke="rgba(231,227,217,0.12)" strokeWidth={9} />
            <motion.circle
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={9}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
              strokeDasharray={C}
              animate={{ strokeDashoffset: C * (1 - conf) }}
              transition={{ type: 'spring', stiffness: 80, damping: 18 }}
            />
            {[THRESHOLD.potential, THRESHOLD.confirm].map((v) => (
              <line key={v} {...tick(v)} stroke="#ece9e1" strokeWidth={1.5} />
            ))}
            <text x={60} y={66} textAnchor="middle" fill="#ece9e1" fontSize={22} fontFamily="Martian Mono">
              {Math.round(conf * 100)}
            </text>
          </svg>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {state && <StateGlyph state={state} size={20} night />}
              <AnimatePresence mode="wait">
                <motion.span
                  key={state ?? 'none'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-[26px] font-semibold"
                  style={{ fontVariationSettings: "'wdth' 115", color: state ? color : '#ece9e1' }}
                >
                  {state ? STATE[state].word : 'Unknown'}
                </motion.span>
              </AnimatePresence>
              <span className="ml-auto text-[12px] text-clay/55">{threat ? `${threat.sources} independent source${threat.sources === 1 ? '' : 's'}` : ''}</span>
            </div>
            <p className="mt-1 text-[14px] text-clay/75">{words}</p>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {LIFE.map((s, i) => (
                <div key={s}>
                  <div className="h-[3px]" style={{ background: i <= idx ? STATE[s].color : 'rgba(231,227,217,0.15)' }} />
                  <span className={'text-[11px] ' + (i === idx ? 'font-semibold text-clay' : 'text-clay/45')}>{STATE[s].word}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="absolute right-5 top-4 text-[11px] text-clay/55">Ticks on the gauge: potential {THRESHOLD.potential}, confirmed {THRESHOLD.confirm}. Imagery Esri.</p>
      </div>
    </div>
  )
}
