import * as React from 'react'
import { memo, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { egoSAt, sampleAgents, type World } from '../world/scenario'
import { useSim, type FeedView } from '../world/store'
import type { ThreatState } from '../engine/types'
import type { V2 } from '../world/corridor'

export const STATE: Record<ThreatState, { word: string; color: string; text: string }> = {
  confirmed: { word: 'Confirmed', color: '#e0401f', text: '#b3301a' },
  potential: { word: 'Potential', color: '#d19a1c', text: '#8a6208' },
  noticed: { word: 'Noticed', color: '#d19a1c', text: '#8a6208' },
  predicted: { word: 'Predicted', color: '#6b4fa0', text: '#6b4fa0' },
  resolved: { word: 'Resolved', color: '#7d8380', text: '#565e63' },
  faded: { word: 'Faded', color: '#9a9e9a', text: '#565e63' },
}

/** Survey notation for threat state. Shape carries the state, colour repeats it. */
export function StateGlyph({ state, size = 14, night = false }: { state: ThreatState | 'live'; size?: number; night?: boolean }) {
  const c = state === 'live' ? '#1f6fb2' : STATE[state].color
  const s = size
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      {state === 'confirmed' && <path d="M1.5 3h13L8 14.5z" fill={c} />}
      {(state === 'potential' || state === 'noticed') && (
        <circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.8" strokeDasharray="3 2.2" />
      )}
      {state === 'predicted' && (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.4" />
          <circle cx="8" cy="8" r="3.2" fill="none" stroke={c} strokeWidth="1.4" />
        </>
      )}
      {(state === 'resolved' || state === 'faded') && <path d="M1.5 3h13L8 14.5z" fill="none" stroke={c} strokeWidth="1.4" />}
      {state === 'live' && <circle cx="8" cy="8" r="4.5" fill={c} stroke={night ? '#13181b' : '#e7e3d9'} strokeWidth="1.5" />}
    </svg>
  )
}

export function useSimTicker(hz = 5) {
  const tick = useSim((s) => s.tick)
  useEffect(() => {
    const id = setInterval(tick, 1000 / hz)
    return () => clearInterval(id)
  }, [tick, hz])
}

/** Confidence-aware wording: confirmed is stated, potential is "possible", predicted names the history. */
export function alertCopy(f: FeedView) {
  const t = f.threat
  const dist = `${Math.max(0, Math.round(f.ahead))} m`
  if (t.state === 'confirmed') return { title: t.label, detail: `${t.lane}, ${dist}` }
  if (t.state === 'predicted') return { title: t.label, detail: `${t.why ?? 'Crash history'}, ${dist}` }
  const n = t.sourceCount
  return { title: `Possible ${t.label.toLowerCase()}`, detail: `${n} source${n === 1 ? '' : 's'} so far, ${dist}` }
}

export function topAlert(feed: FeedView[]) {
  return feed.find((f) => f.tier === 'critical') ?? feed.find((f) => f.tier === 'advisory' && f.ahead < 380)
}

export function AlertCapsule({ night = false, large = false, xl = false }: { night?: boolean; large?: boolean; xl?: boolean }) {
  const feed = useSim((s) => s.feed)
  const top = topAlert(feed)
  return (
    <div className="relative" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {top && (
          <motion.div
            key={top.id + top.threat.state + top.tier}
            initial={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className={
              'inline-flex items-center gap-3 rounded-full py-2 pl-3 pr-5 ' +
              (night ? 'bg-[#0d1113]/88 text-clay' : 'bg-clay text-ink') +
              (large ? ' gap-4 py-3 pl-4 pr-7' : '') +
              (xl ? ' gap-5 py-5 pl-6 pr-10' : '')
            }
            style={{ boxShadow: `inset 0 0 0 ${top.tier === 'critical' ? 3 : 1.5}px ${STATE[top.threat.state].color}` }}
          >
            <StateGlyph state={top.threat.state} size={xl ? 40 : large ? 24 : 16} night={night} />
            <span className="flex flex-col leading-tight">
              <span className={(xl ? 'text-[44px]' : large ? 'text-[26px]' : 'text-[15px]') + ' font-semibold'} style={{ fontVariationSettings: "'wdth' 88" }}>
                {alertCopy(top).title}
              </span>
              <span className={'figures ' + (xl ? 'mt-1 text-[24px]' : large ? 'text-[15px]' : 'text-[11px]') + (night ? ' text-clay/75' : ' text-ink-3')}>
                {alertCopy(top).detail}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Road Ahead: a measured distance rail. Ticks are real distances, threats sit at their distance. */
export function RoadAheadRail({ night = false, range = 600, vertical = false, xl = false }: { night?: boolean; range?: number; vertical?: boolean; xl?: boolean }) {
  const feed = useSim((s) => s.feed)
  const items = feed.filter((f) => f.ahead < range && f.threat.state !== 'predicted')
  const ink = night ? 'text-clay' : 'text-ink'
  const sub = night ? 'text-clay/60' : 'text-ink-3'
  const ticks = [0, 100, 200, 300, 400, 500, 600].filter((d) => d <= range)
  if (vertical) {
    return (
      <div className={'relative h-full w-full ' + ink}>
        <div className={'absolute bottom-0 top-0 w-px ' + (xl ? 'left-[112px] ' : 'left-[62px] ') + (night ? 'bg-clay/30' : 'bg-ink/25')} />
        {ticks.map((d) => (
          <div key={d} className={'figures absolute left-0 flex items-center justify-end gap-1 ' + (xl ? 'w-[118px] text-[17px] ' : 'w-[66px] text-[10px] ') + sub} style={{ bottom: `${(d / range) * 100}%`, transform: 'translateY(50%)' }}>
            {d} m<span className={'h-px w-1.5 ' + (night ? 'bg-clay/40' : 'bg-ink/40')} />
          </div>
        ))}
        {items.map((f) => (
          <div
            key={f.id}
            className={'absolute flex items-center transition-[bottom] duration-200 ease-linear ' + (xl ? 'left-[98px] gap-3' : 'left-[54px] gap-2')}
            style={{ bottom: `${(Math.max(0, f.ahead) / range) * 100}%`, transform: 'translateY(50%)' }}
          >
            <StateGlyph state={f.threat.state} size={xl ? 28 : 16} night={night} />
            <span className={'font-medium leading-tight ' + (xl ? 'text-[22px]' : 'text-[12px]')} style={{ fontVariationSettings: "'wdth' 85" }}>
              {f.threat.state === 'confirmed' ? f.threat.label : `Possible ${f.threat.label.toLowerCase()}`}
              <span className={'block font-normal ' + (xl ? 'text-[16px] ' : 'text-[10px] ') + sub}>{f.threat.lane}</span>
            </span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={'relative h-16 w-full ' + ink}>
      <div className={'absolute left-0 right-0 top-6 h-px ' + (night ? 'bg-clay/35' : 'bg-ink/30')} />
      {ticks.map((d) => (
        <div key={d} className="absolute top-6 flex w-0 flex-col items-center" style={{ left: `${(d / range) * 100}%` }}>
          <div className={'h-1.5 w-px ' + (night ? 'bg-clay/50' : 'bg-ink/50')} />
          <div className={'figures mt-1 text-[13px] ' + sub}>{d}</div>
        </div>
      ))}
      {items.map((f) => (
        <div
          key={f.id}
          className="absolute top-0 flex w-0 justify-center transition-[left] duration-200 ease-linear"
          style={{ left: `${(Math.max(0, f.ahead) / range) * 100}%` }}
        >
          <StateGlyph state={f.threat.state} size={18} night={night} />
        </div>
      ))}
    </div>
  )
}

/** Static road drawing of the corridor around a point; overlays are drawn by children. */
export const MiniMap = memo(function MiniMap({
  world,
  center,
  radius,
  night = false,
  route = true,
  className,
}: {
  world: World
  center: V2
  radius: number
  night?: boolean
  route?: boolean
  className?: string
}) {
  const [cx, cz] = center
  const roads = useMemo(
    () =>
      world.data.roads
        .filter((r) => r.pts.some(([x, z]) => Math.abs(x - cx) < radius * 1.4 && Math.abs(z - cz) < radius * 1.4))
        .map((r) => ({ kind: r.kind, d: 'M' + r.pts.map(([x, z]) => `${(x - cx).toFixed(1)},${(z - cz).toFixed(1)}`).join('L') })),
    [world, cx, cz, radius],
  )
  const buildings = useMemo(
    () =>
      world.data.buildings
        .filter((b) => Math.abs(b.pts[0][0] - cx) < radius * 1.3 && Math.abs(b.pts[0][1] - cz) < radius * 1.3)
        .map((b) => 'M' + b.pts.map(([x, z]) => `${(x - cx).toFixed(1)},${(z - cz).toFixed(1)}`).join('L') + 'Z'),
    [world, cx, cz, radius],
  )
  const width: Record<string, number> = { primary: 13, trunk: 13, secondary: 9, tertiary: 6.5, residential: 4.5, service: 3, footway: 1.4 }
  return (
    <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`} className={className} preserveAspectRatio="xMidYMid slice">
      <rect x={-radius} y={-radius} width={radius * 2} height={radius * 2} fill={night ? '#13181b' : '#e7e3d9'} />
      {buildings.map((d, i) => (
        <path key={i} d={d} fill={night ? '#1d2428' : '#d9d4c8'} stroke={night ? '#2b3438' : '#c9c3b5'} strokeWidth={0.6} />
      ))}
      {roads.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={night ? '#2c363a' : '#f3f1eb'} strokeWidth={(width[r.kind] ?? 4) + 2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {roads.map((r, i) => (
        <path key={'c' + i} d={r.d} fill="none" stroke={night ? '#39454a' : '#cfc9bc'} strokeWidth={width[r.kind] ?? 4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {route && <RouteLine world={world} cx={cx} cz={cz} />}
    </svg>
  )
})

function RouteLine({ world, cx, cz }: { world: World; cx: number; cz: number }) {
  const d = useMemo(() => {
    const pts: string[] = []
    for (let s = world.sStart; s < world.sStart + 700; s += 6) {
      const p = world.path.at(s, 0)
      pts.push(`${(p.x - cx).toFixed(1)},${(p.z - cz).toFixed(1)}`)
    }
    return 'M' + pts.join('L')
  }, [world, cx, cz])
  return <path d={d} fill="none" stroke="#1f6fb2" strokeWidth={4} strokeLinecap="round" opacity={0.85} />
}

/** Dynamic overlay for a MiniMap: ego arrow and threat glyphs, in the same metre frame. */
export function MapOverlay({ world, center, radius, night = false }: { world: World; center: V2; radius: number; night?: boolean }) {
  const t = useSim((s) => s.t)
  const threats = useSim((s) => s.threats)
  const ego = sampleAgents(world, t).find((a) => a.id === 'ego')!
  const [cx, cz] = center
  const deg = (-ego.heading * 180) / Math.PI + 180
  return (
    <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      {threats.filter((th) => th.state !== 'resolved').map((th) => {
        const [x, z] = th.pos
        const k = radius / 90
        const c = STATE[th.state].color
        return (
          <g key={th.id} transform={`translate(${x - cx} ${z - cz}) scale(${k})`}>
            {th.state === 'confirmed' && <path d="M-7 -6h14L0 7z" fill={c} />}
            {(th.state === 'potential' || th.state === 'noticed') && <circle r="6" fill="none" stroke={c} strokeWidth="2" strokeDasharray="3 2" />}
            {th.state === 'predicted' && (
              <>
                <circle r="9" fill="none" stroke={c} strokeWidth="1.5" />
                <circle r="4.5" fill="none" stroke={c} strokeWidth="1.5" />
              </>
            )}
          </g>
        )
      })}
      <g transform={`translate(${ego.x - cx} ${ego.z - cz}) rotate(${deg}) scale(${radius / 110})`}>
        <path d="M0 -8 L6 6 L0 3 L-6 6Z" fill="#1f6fb2" stroke={night ? '#13181b' : '#f3f1eb'} strokeWidth="1.5" />
      </g>
    </svg>
  )
}

export function egoCenter(world: World, t: number): V2 {
  const p = world.path.at(world.sStart + egoSAt(world, t) + 120, 0)
  return [Math.round(p.x / 40) * 40, Math.round(p.z / 40) * 40]
}

/** Render a fixed-size device screen (e.g. 1920x720) and scale it to the container width.
 *  `min` keeps small screens legible: below it the screen keeps that scale and pans sideways. */
export function Scaled({ w, h, children, className, min = 0 }: { w: number; h: number; children: React.ReactNode; className?: string; min?: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fit, setFit] = React.useState(0.5)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setFit(e.contentRect.width / w))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [w])
  const k = Math.max(fit, min)
  const pans = k > fit + 0.001
  return (
    <div ref={ref} className={'relative w-full ' + (pans ? 'overflow-x-auto overscroll-x-contain ' : 'overflow-hidden ') + (className ?? '')}>
      <div className="relative" style={{ width: w * k, height: h * k }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${k})` }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** Fit a fixed-size screen inside the viewport, letterboxed and centred. */
export function Contained({ w, h, children, className }: { w: number; h: number; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [k, setK] = React.useState(0.5)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setK(Math.min(e.contentRect.width / w, e.contentRect.height / h)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [w, h])
  return (
    <div ref={ref} className={'relative grid h-full w-full place-items-center overflow-hidden ' + (className ?? '')}>
      <div style={{ width: w * k, height: h * k }} className="relative">
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${k})` }}>
          {children}
        </div>
      </div>
    </div>
  )
}
