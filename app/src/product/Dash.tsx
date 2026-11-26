// The 1920 x 720 in-dash display, at its native size. Three panes under a status bar:
// navigation (3D, the route glowing ahead), a driver-assist lane view where every car, person,
// animal and hazard sits in its real lane at its real distance, and the cluster (speed, limit,
// driver attention, what the network knows). Everything on it is read from the simulation.
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpIcon, CloudRainIcon, EyeIcon, MoonIcon, NavigationArrowIcon, SunIcon, WifiHighIcon } from '@phosphor-icons/react'
import { NavCanvas } from '../three/Canvases'
import { egoSpeed, sampleAgents, type World } from '../world/scenario'
import { useSim, type FeedView } from '../world/store'
import { simTime } from '../world/clock'
import { useAtmos } from '../world/atmos'
import { useWeather } from '../sense/weather'
import { useFatigue } from '../sense/fatigue'
import { ATTN } from './DriverMonitor'
import { STATE, StateGlyph, alertCopy, topAlert } from './bits'
import { laneOf } from '../engine/relevance'

const GLASS = 'rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))]'
const RING = { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07), 0 30px 60px -30px rgba(0,0,0,0.7)' }
const LIMIT: Record<string, number> = { 'jvlr-night': 60, 'jvlr-cattle': 60, 'asm-monsoon': 40, 'asm-crash': 50, 'orchard-school': 25 }

/** A 30 fps clock for the parts of the dash that move continuously. */
function useFrameTime(fps = 30) {
  const [t, setT] = useState(() => simTime())
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / fps) return
      last = now
      setT(simTime())
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [fps])
  return t
}

export function DashScreen({ world }: { world: World }) {
  return (
    <div className="relative h-[720px] w-[1920px] overflow-hidden text-[#e9edf1]" style={{ background: 'radial-gradient(120% 140% at 50% 0%, #121a21 0%, #070a0d 60%, #040608 100%)', fontFeatureSettings: '"tnum"' }}>
      <StatusBar world={world} />
      <div className="absolute inset-x-6 bottom-6 top-[76px] grid grid-cols-[760px_1fr_440px] gap-5">
        <NavPane world={world} />
        <LanePane world={world} />
        <Cluster world={world} />
      </div>
    </div>
  )
}

function StatusBar({ world }: { world: World }) {
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])
  const weather = useWeather((s) => s.weather)
  const { time, rain } = useAtmos()
  const linked = useSim((s) => s.feed.length)
  const ist = clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
  const Icon = rain ? CloudRainIcon : time === 'night' ? MoonIcon : SunIcon
  return (
    <div className="absolute inset-x-8 top-0 flex h-[64px] items-center gap-6 text-[22px]">
      <span className="font-semibold tracking-tight" style={{ fontVariationSettings: "'wdth' 100" }}>
        {ist}
      </span>
      <span className="flex items-center gap-2 text-white/70">
        <Icon size={24} />
        {weather ? `${Math.round(weather.temperature)}°` : rain ? 'Rain' : ''}
      </span>
      <span className="flex-1 truncate text-center text-[20px] text-white/55">{world.scenario.road}</span>
      <span className="flex items-center gap-2.5 rounded-full bg-white/[0.06] px-4 py-1.5 text-[18px] text-white/80">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4aa3ff] opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4aa3ff]" />
        </span>
        SuRaksha Mesh{linked ? ` · ${linked} on route` : ''}
      </span>
      <WifiHighIcon size={26} className="text-white/70" />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------------------------

function NavPane({ world }: { world: World }) {
  const t = useSim((s) => s.t)
  const egoS = world.egoS[Math.min(world.egoS.length - 1, Math.round(t / 0.05))]
  const remaining = Math.max(0, world.sStart + 760 - egoS)
  const eta = new Date(Date.now() + (remaining / 8.3) * 1000)
  const etaStr = eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
  const road = world.scenario.road.split(',')[0]
  return (
    <section className={'relative overflow-hidden ' + GLASS} style={RING}>
      <NavCanvas world={world} className="absolute inset-0" />
      {/* depth: the map fades into the glass at the top, as navigation displays do */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#06090c] to-transparent" />
      <div className="absolute left-5 top-5 flex items-center gap-4 rounded-[22px] bg-[#0b1218]/85 py-3.5 pl-4 pr-6 backdrop-blur-md" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#4aa3ff] text-[#06121f]">
          <ArrowUpIcon size={34} weight="bold" />
        </span>
        <span className="leading-tight">
          <span className="block text-[30px] font-semibold tracking-tight">{remaining > 1000 ? `${(remaining / 1000).toFixed(1)} km` : `${Math.round(remaining / 10) * 10} m`}</span>
          <span className="block max-w-[420px] truncate text-[19px] text-white/65">Continue on {road}</span>
        </span>
      </div>
      <div className="absolute inset-x-5 bottom-5 flex items-center justify-between rounded-[22px] bg-[#0b1218]/85 px-6 py-3.5 text-[20px] backdrop-blur-md" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
        <span>
          <span className="text-[26px] font-semibold">{etaStr}</span>
          <span className="ml-2 text-white/55">arrival</span>
        </span>
        <span className="text-white/65">{Math.max(1, Math.round(remaining / 8.3 / 60))} min</span>
        <span className="text-white/65">{(remaining / 1000).toFixed(1)} km</span>
        <NavigationArrowIcon size={24} className="text-[#4aa3ff]" weight="fill" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------
// Driver-assist lane view
// ---------------------------------------------------------------------------------------------

const VW = 640
const VH = 600
const HORIZON = 118
const EYE = 34 // metres the eye sits behind (and above) your car: a gentle perspective
const K = (VH - 60 - HORIZON) * EYE // y scale: your car sits near the bottom
const SX = (150 * EYE) / 3.5 // a 3.5 m lane is 150 px wide at your car
const FAR = 170 // metres of road drawn

const Y = (d: number) => HORIZON + K / Math.max(1, d + EYE)
const X = (lat: number, d: number) => VW / 2 + (lat * SX) / Math.max(1, d + EYE)

function LanePane({ world }: { world: World }) {
  const t = useFrameTime(30)
  const feed = useSim((s) => s.feed)
  const scene = useMemo(() => {
    const agents = sampleAgents(world, t)
    const ego = agents.find((a) => a.id === 'ego')!
    const pe = world.path.project(ego.x, ego.z)
    const egoOff = world.egoLane(t)
    const items = agents
      .filter((a) => a.id !== 'ego' && a.kind !== 'cone')
      .map((a) => {
        const dx = a.x - ego.x
        const dz = a.z - ego.z
        if (dx * dx + dz * dz > 230 * 230) return null
        const p = world.path.project(a.x, a.z)
        const d = p.s - pe.s
        const lat = p.offset - egoOff
        if (d < -12 || d > FAR || Math.abs(lat) > 16) return null
        return { a, d, lat }
      })
      .filter(Boolean) as { a: ReturnType<typeof sampleAgents>[number]; d: number; lat: number }[]
    return { items: items.sort((p, q) => q.d - p.d), egoOff }
  }, [world, t])

  const lanes = world.scenario.traffic.lanes
  const oncoming = (world.scenario.traffic.oncoming ?? []).map((o) => -o)
  const all = [...lanes, ...oncoming].sort((a, b) => a - b)
  const edgeL = all[0] - 1.75
  const edgeR = all[all.length - 1] + 1.75
  const dividers = all.slice(0, -1).map((l, i) => (l + all[i + 1]) / 2)
  const advice = world.scenario.advice.find((a) => t > a.t0 && t < a.t1)
  const hazards = feed.filter((f) => f.ahead < FAR && f.ahead > -5 && f.threat.state !== 'predicted' && f.threat.kind !== 'risk-zone')
  const rel = (o: number) => o - scene.egoOff
  const strip = (l0: number, l1: number, d0: number, d1: number) => `M${X(l0, d0)} ${Y(d0)} L${X(l0, d1)} ${Y(d1)} L${X(l1, d1)} ${Y(d1)} L${X(l1, d0)} ${Y(d0)} Z`

  return (
    <section className={'relative overflow-hidden ' + GLASS} style={RING}>
      <div className="absolute left-6 top-5 z-10 text-[18px] uppercase tracking-[0.16em] text-white/45">Road ahead</div>
      <div className="absolute inset-x-6 top-14 z-10">
        <AlertCard />
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-x-0 bottom-0 h-[86%] w-full" preserveAspectRatio="xMidYMax meet" aria-label="Lane view: cars and hazards in their lanes">
        <defs>
          <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a222a" stopOpacity="0" />
            <stop offset="0.35" stopColor="#1a222a" stopOpacity="0.85" />
            <stop offset="1" stopColor="#26313b" />
          </linearGradient>
          <linearGradient id="car" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b98a5" />
            <stop offset="1" stopColor="#4c5864" />
          </linearGradient>
          <linearGradient id="ego" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f7fa" />
            <stop offset="1" stopColor="#aeb9c4" />
          </linearGradient>
          <radialGradient id="egoGlow">
            <stop offset="0" stopColor="#4aa3ff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#4aa3ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* the carriageway */}
        <path d={strip(rel(edgeL), rel(edgeR), -12, FAR)} fill="url(#road)" />
        {/* advised lane */}
        {advice && (
          <path d={strip(rel(laneTarget(world, t + 3)) - 1.6, rel(laneTarget(world, t + 3)) + 1.6, 2, 120)} fill="#4aa3ff" opacity={0.16} />
        )}
        {/* lane lines: solid edges, dashed dividers moving past as you drive */}
        {[edgeL, edgeR].map((o) => (
          <path key={o} d={`M${X(rel(o), -12)} ${Y(-12)} L${X(rel(o), FAR)} ${Y(FAR)}`} stroke="rgba(233,237,241,0.55)" strokeWidth={3} fill="none" />
        ))}
        {dividers.map((o) =>
          Array.from({ length: Math.ceil(FAR / 12) + 2 }, (_, i) => {
            const phase = (world.egoS[Math.min(world.egoS.length - 1, Math.round(t / 0.05))] % 12) || 0
            const d0 = i * 12 - phase - 10
            if (d0 > FAR - 5 || d0 + 5 < -12) return null
            return <path key={o + ':' + i} d={`M${X(rel(o), d0)} ${Y(d0)} L${X(rel(o), d0 + 5)} ${Y(d0 + 5)}`} stroke="rgba(233,237,241,0.45)" strokeWidth={2.4} />
          }),
        )}
        {/* hazards from the network, on their lane at their distance */}
        {hazards.map((f) => (
          <HazardMark key={f.id} f={f} lat={rel(f.threat.offset ?? 0)} />
        ))}
        {/* everything else on the road */}
        {scene.items.map(({ a, d, lat }) => (
          <Body key={a.id} kind={a.kind} d={d} lat={lat} brake={!!a.brake} lying={a.lying} paint={a.paint} />
        ))}
        {/* your car */}
        <ellipse cx={X(0, 0)} cy={Y(0) + 6} rx={120} ry={34} fill="url(#egoGlow)" />
        <CarShape d={0} lat={0} fill="url(#ego)" ego />
      </svg>
      <AnimatePresence>
        {advice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-6 bottom-5 text-balance rounded-[20px] bg-[#0b1218]/90 px-5 py-3 text-center text-[20px] leading-snug text-white/90"
            style={{ boxShadow: 'inset 0 0 0 1.5px rgba(74,163,255,0.7)' }}
          >
            {advice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function laneTarget(world: World, t: number) {
  return world.egoLane(Math.min(47.9, t))
}

function AlertCard() {
  const feed = useSim((s) => s.feed)
  const top = topAlert(feed)
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {top && (
        <motion.div
          key={top.id + top.threat.state + top.tier}
          initial={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="flex items-center gap-4 rounded-[22px] px-5 py-4"
          style={{
            background: `linear-gradient(90deg, ${STATE[top.threat.state].color}33, rgba(11,18,24,0.88) 55%)`,
            boxShadow: `inset 0 0 0 ${top.tier === 'critical' ? 2 : 1}px ${STATE[top.threat.state].color}`,
          }}
        >
          <StateGlyph state={top.threat.state} size={38} night />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[30px] font-semibold" style={{ fontVariationSettings: "'wdth' 92" }}>
              {alertCopy(top).title}
            </span>
            <span className="block truncate text-[20px] text-white/70" style={{ fontVariantNumeric: 'tabular-nums' }}>{alertCopy(top).detail}</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function HazardMark({ f, lat }: { f: FeedView; lat: number }) {
  const d = Math.max(0, f.ahead)
  const c = STATE[f.threat.state].color
  const y0 = Y(d + 5)
  const y1 = Y(Math.max(-2, d - 5))
  const w = (k: number) => (1.7 * SX) / (k + EYE)
  const x = X(lat, d)
  return (
    <g>
      {/* a hazard zone painted on its lane */}
      <path d={`M${X(lat, d + 5) - w(d + 5)} ${y0} L${X(lat, d + 5) + w(d + 5)} ${y0} L${X(lat, d - 5) + w(d - 5)} ${y1} L${X(lat, d - 5) - w(d - 5)} ${y1} Z`} fill={c} opacity={f.threat.state === 'confirmed' ? 0.32 : 0.18} />
      <path d={`M${X(lat, d + 5) - w(d + 5)} ${y0} L${X(lat, d + 5) + w(d + 5)} ${y0} L${X(lat, d - 5) + w(d - 5)} ${y1} L${X(lat, d - 5) - w(d - 5)} ${y1} Z`} fill="none" stroke={c} strokeWidth={2} strokeDasharray={f.threat.state === 'confirmed' ? undefined : '6 5'} />
      <g transform={`translate(${x} ${Y(d) - 46 * Math.min(1, 40 / (d + 20))})`}>
        <rect x={-54} y={-15} width={108} height={30} rx={15} fill="rgba(11,18,24,0.88)" stroke={c} strokeWidth={1.5} />
        <text x={0} y={6} textAnchor="middle" fontSize={16} fill="#e9edf1" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(d)} m
        </text>
      </g>
    </g>
  )
}

function CarShape({ d, lat, fill, ego = false, brake = false, len = 4.4, wid = 1.85 }: { d: number; lat: number; fill: string; ego?: boolean; brake?: boolean; len?: number; wid?: number }) {
  const yf = Y(d + len / 2)
  const yr = Y(d - len / 2)
  const hw = (z: number) => ((wid / 2) * SX) / Math.max(1, z + EYE)
  const xf = X(lat, d + len / 2)
  const xr = X(lat, d - len / 2)
  const body = `M${xf - hw(d + len / 2) * 0.86} ${yf} Q${xf} ${yf - 6 * (hw(d) / 40)} ${xf + hw(d + len / 2) * 0.86} ${yf} L${xr + hw(d - len / 2)} ${yr - 4} Q${xr} ${yr + 4} ${xr - hw(d - len / 2)} ${yr - 4} Z`
  const roofY0 = yf + (yr - yf) * 0.3
  const roofY1 = yf + (yr - yf) * 0.72
  const xm = (xf + xr) / 2
  const hm = hw(d) * 0.62
  return (
    <g>
      <path d={body} fill={fill} stroke={ego ? '#4aa3ff' : 'rgba(255,255,255,0.12)'} strokeWidth={ego ? 2.5 : 1} />
      <rect x={xm - hm} y={roofY0} width={hm * 2} height={Math.max(2, roofY1 - roofY0)} rx={hm * 0.4} fill={ego ? '#1f2a35' : 'rgba(10,14,18,0.55)'} />
      <rect x={xr - hw(d - len / 2) * 0.8} y={yr - 6} width={hw(d - len / 2) * 0.42} height={4} rx={2} fill={brake ? '#ff3b2f' : '#7a1d18'} />
      <rect x={xr + hw(d - len / 2) * 0.38} y={yr - 6} width={hw(d - len / 2) * 0.42} height={4} rx={2} fill={brake ? '#ff3b2f' : '#7a1d18'} />
    </g>
  )
}

function Body({ kind, d, lat, brake, lying, paint }: { kind: string; d: number; lat: number; brake: boolean; lying?: boolean; paint?: string }) {
  if (kind === 'car' || kind === 'auto') return <CarShape d={d} lat={lat} fill="url(#car)" brake={brake} len={kind === 'auto' ? 2.6 : 4.4} wid={kind === 'auto' ? 1.4 : 1.85} />
  if (kind === 'bus') return <CarShape d={d} lat={lat} fill={paint ?? '#c8261f'} brake={brake} len={11.6} wid={2.55} />
  if (kind === 'bike') return <CarShape d={d} lat={lat} fill="url(#car)" brake={brake} len={2} wid={0.8} />
  const x = X(lat, d)
  const y = Y(d)
  const s = Math.min(1.6, 30 / (d + EYE))
  if (kind === 'cow')
    return <ellipse cx={x} cy={y} rx={(lying ? 22 : 16) * s} ry={10 * s} fill="#a88d6c" stroke="#e0b45a" strokeWidth={2} />
  // a person: a dot with a halo, in the threat colour, so they read at a glance
  return (
    <g>
      <circle cx={x} cy={y} r={14 * s} fill="#e0401f" opacity={0.25} />
      <circle cx={x} cy={y} r={7 * s} fill="#ffb4a2" stroke="#e0401f" strokeWidth={2} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Cluster
// ---------------------------------------------------------------------------------------------

function Cluster({ world }: { world: World }) {
  const t = useFrameTime(15)
  const feed = useSim((s) => s.feed)
  const speed = Math.max(0, Math.round(egoSpeed(world, t) * 3.6))
  const limit = LIMIT[world.scenario.id] ?? 50
  const lane = laneOf(world.egoLane(t))
  const confirmed = feed.filter((f) => f.threat.state === 'confirmed').length
  const possible = feed.filter((f) => f.threat.state === 'potential' || f.threat.state === 'noticed').length
  const f = useFatigue()
  const a = f.status === 'running' ? ATTN[f.face ? f.attention : 'calibrating'] : null
  const R = 150
  const frac = Math.min(1, speed / 100)
  const arc = (k: number) => {
    const ang = Math.PI * (0.8 + 1.4 * k)
    return [200 + R * Math.cos(ang), 190 + R * Math.sin(ang)]
  }
  const [x0, y0] = arc(0)
  const [x1, y1] = arc(frac)
  const [xe, ye] = arc(1)
  return (
    <section className={'flex flex-col gap-5 p-6 ' + GLASS} style={RING}>
      <div className="relative h-[300px]">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full">
          <path d={`M${x0} ${y0} A${R} ${R} 0 1 1 ${xe} ${ye}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} strokeLinecap="round" />
          <path d={`M${x0} ${y0} A${R} ${R} 0 ${frac > 0.715 ? 1 : 0} 1 ${x1} ${y1}`} fill="none" stroke={speed > limit ? '#e0401f' : '#4aa3ff'} strokeWidth={14} strokeLinecap="round" style={{ transition: 'stroke 300ms' }} />
        </svg>
        <div className="absolute inset-x-0 top-[96px] text-center">
          <div className="text-[110px] font-semibold leading-none tracking-tight" style={{ fontVariationSettings: "'wdth' 90" }}>
            {speed}
          </div>
          <div className="mt-2 text-[22px] text-white/55">km/h · lane {lane}</div>
        </div>
        <div className="absolute right-0 top-0 grid h-[86px] w-[86px] place-items-center rounded-full bg-white text-[38px] font-bold text-[#111]" style={{ boxShadow: 'inset 0 0 0 9px #d32f2f' }} aria-label={`Speed limit ${limit}`}>
          {limit}
        </div>
      </div>
      <div className="rounded-[20px] bg-white/[0.04] px-5 py-4" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 text-[17px] uppercase tracking-[0.14em] text-white/45">
          <EyeIcon size={18} />
          Driver
        </div>
        <div className="mt-1 text-[26px] font-medium" style={{ color: a?.color ?? 'rgba(233,237,241,0.5)' }}>
          {a ? (f.attention === 'eyes-off-road' || f.attention === 'looking-down' ? `${a.word}, ${f.offFor.toFixed(1)} s` : a.word) : 'Monitor off'}
        </div>
      </div>
      <div className="mt-auto rounded-[20px] bg-white/[0.04] px-5 py-4" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
        <div className="text-[17px] uppercase tracking-[0.14em] text-white/45">On your route</div>
        <div className="mt-2 flex items-baseline gap-6">
          <span>
            <span className="text-[44px] font-semibold leading-none" style={{ color: confirmed ? STATE.confirmed.color : undefined }}>
              {confirmed}
            </span>
            <span className="ml-2 text-[19px] text-white/60">confirmed</span>
          </span>
          <span>
            <span className="text-[44px] font-semibold leading-none" style={{ color: possible ? STATE.potential.color : undefined }}>
              {possible}
            </span>
            <span className="ml-2 text-[19px] text-white/60">possible</span>
          </span>
        </div>
        <div className="mt-2 truncate text-[18px] text-white/50">Shared by cars, phones and city cameras</div>
      </div>
    </section>
  )
}
