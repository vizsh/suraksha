import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { CameraIcon, HouseIcon, MapTrifoldIcon, ShieldCheckIcon, UserIcon } from '@phosphor-icons/react'
import { citizenReport, focusPoint, type World } from '../world/scenario'
import { hazardLabel, threatForObservation, useSim } from '../world/store'
import { useEvents } from '../sync/events'
import { MapOverlay, MiniMap, STATE, Scaled, StateGlyph, alertCopy, egoCenter, topAlert } from './bits'
import { egoSpeed } from '../world/scenario'

const BevCanvas = lazy(() => import('../three/Canvases').then((m) => ({ default: m.BevCanvas })))

/** Card surface used across the phone app. */
export const CARD = 'rounded-[22px] bg-white/75 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_12px_28px_-18px_rgba(40,34,26,0.45)] ring-1 ring-black/[0.05]'

export function PhoneFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className="relative aspect-[390/844] w-full overflow-hidden rounded-[44px] bg-ink p-[10px]"
        style={{ boxShadow: '0 30px 60px -20px rgba(40,34,26,0.45), 0 0 0 1px rgba(28,34,38,0.6)' }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[35px] bg-clay">
          <Scaled w={370} h={802}>
            <div className="relative h-[802px] w-[370px] pt-11">
              <div className="absolute left-1/2 top-2.5 z-10 h-[26px] w-[104px] -translate-x-1/2 rounded-full bg-ink" />
              {children}
            </div>
          </Scaled>
        </div>
      </div>
      {label && <figcaption className="text-[13px] text-ink-3">{label}</figcaption>}
    </figure>
  )
}

export const TABS = [
  { icon: HouseIcon, label: 'Drive' },
  { icon: MapTrifoldIcon, label: 'Map' },
  { icon: CameraIcon, label: 'Report' },
  { icon: UserIcon, label: 'You' },
] as const

/** A floating frosted-glass tab bar, above the content. */
export function TabBar({ active, onChange }: { active: number; onChange?: (i: number) => void }) {
  return (
    <nav
      className="absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 gap-1 rounded-[28px] bg-white/70 p-1.5 backdrop-blur-xl"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 0 0 1px rgba(28,34,38,0.07), 0 18px 40px -16px rgba(28,34,38,0.45)' }}
    >
      {TABS.map(({ icon: Icon, label }, i) => (
        <button
          key={label}
          onClick={() => onChange?.(i)}
          className={'flex flex-col items-center gap-0.5 rounded-[22px] py-1.5 text-[10px] font-medium transition-colors ' + (i === active ? 'bg-ink text-clay' : 'text-ink-2 hover:bg-black/[0.04]')}
          aria-current={i === active ? 'page' : undefined}
        >
          <Icon size={20} weight={i === active ? 'fill' : 'regular'} />
          {label}
        </button>
      ))}
    </nav>
  )
}

/** Driver mode: a live map of the road around you, the next warning, and what is coming. */
export function DriveScreen({ world, children, live3d = false }: { world: World; children?: ReactNode; live3d?: boolean }) {
  const t = useSim((s) => s.t)
  const feed = useSim((s) => s.feed)
  const center = useMemo(() => egoCenter(world, Math.floor(t / 4) * 4), [world, t])
  const top = topAlert(feed)
  const speed = Math.max(0, Math.round(egoSpeed(world, t) * 3.6))
  return (
    <div className="flex min-h-full flex-col">
      <div className="relative h-[330px] shrink-0 overflow-hidden rounded-b-[30px] bg-[#e7e3d9]">
        {live3d ? (
          <Suspense fallback={null}>
            <BevCanvas world={world} className="absolute inset-0" zoom={3.4} />
          </Suspense>
        ) : (
          <>
            <MiniMap world={world} center={center} radius={260} className="absolute inset-0 h-full w-full" />
            <MapOverlay world={world} center={center} radius={260} />
          </>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#efece5] to-transparent" />
        <div className="absolute left-4 top-3 flex max-w-[70%] items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 text-[12px] font-medium backdrop-blur-md" style={{ boxShadow: '0 0 0 1px rgba(28,34,38,0.06), 0 8px 20px -12px rgba(28,34,38,0.5)' }}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-live" />
          <span className="truncate">{world.scenario.road.split(',')[0]}</span>
        </div>
        <div className="absolute right-4 top-3 rounded-2xl bg-ink px-3 py-1.5 text-center text-clay" style={{ boxShadow: '0 8px 20px -10px rgba(0,0,0,0.6)' }}>
          <div className="text-[20px] font-semibold leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {speed}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-clay/60">km/h</div>
        </div>
        {top && (
          <div
            className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-[20px] bg-white/80 px-3.5 py-3 backdrop-blur-xl"
            style={{ boxShadow: `0 0 0 1.5px ${STATE[top.threat.state].color}, 0 16px 30px -14px rgba(28,34,38,0.55)` }}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: STATE[top.threat.state].color + '22' }}>
              <StateGlyph state={top.threat.state} size={20} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[15px] font-semibold">{alertCopy(top).title}</span>
              <span className="block truncate text-[12px] text-ink-3">{alertCopy(top).detail}</span>
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 px-4 pt-5">
        <div className="flex items-baseline justify-between px-1">
          <div className="text-[24px] font-semibold leading-tight tracking-tight" style={{ fontVariationSettings: "'wdth' 108" }}>
            Road ahead
          </div>
          <div className="text-[12px] text-ink-3">{feed.length ? `${feed.length} on your route` : 'All clear'}</div>
        </div>
        <ul className="mt-3 space-y-2">
          {feed.slice(0, 4).map((f) => (
            <li key={f.id} className={'flex items-center gap-3 px-3.5 py-3 ' + CARD}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: STATE[f.threat.state].color + '1f' }}>
                <StateGlyph state={f.threat.state} size={18} />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[14px] font-medium">{alertCopy(f).title}</span>
                <span className="block truncate text-[11.5px]" style={{ color: STATE[f.threat.state].text }}>
                  {STATE[f.threat.state].word}, {f.threat.lane}
                </span>
              </span>
              <span className="text-right leading-none">
                <span className="block text-[18px] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.max(0, Math.round(f.ahead))}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-ink-3">m</span>
              </span>
            </li>
          ))}
          {feed.length === 0 && <li className={'px-4 py-4 text-[13px] text-ink-3 ' + CARD}>Nothing reported on your route.</li>}
        </ul>
        {children}
      </div>
    </div>
  )
}

export interface ReportStep {
  title: string
  sub: string
  done: boolean
}

/** What happened to one report, read from the engine, not from a script. */
export function useReportSteps(obsId: string, kindWord: string): { steps: ReportStep[]; stateWord: string } {
  const threats = useSim((s) => s.threats)
  const orders = useEvents((s) => s.workOrders)
  const th = threatForObservation(threats, obsId)
  const swerves = th?.sources.some((s) => s.source === 'swerve') ?? false
  const others = th ? th.sourceCount - 1 : 0
  const order = th && orders.find((o) => o.threatId === th.id)
  const steps: ReportStep[] = [
    { title: `You reported ${kindWord}`, sub: th ? 'Photo and location received' : 'Sending', done: !!th },
    {
      title: swerves ? 'Cars are swerving here' : 'Other drivers are checking',
      sub: swerves ? 'Connected cars changed course at this spot' : others > 0 ? `${others} other source${others === 1 ? '' : 's'} agree` : 'Waiting for a second source',
      done: swerves || others > 0,
    },
    { title: 'Confirmed by the network', sub: 'Drivers approaching now get a warning', done: th?.state === 'confirmed' || th?.state === 'resolved' },
    {
      title: order ? 'Crew assigned' : 'Crew not assigned yet',
      sub: order ? `${order.crew}` : 'The city sees it in its work queue',
      done: !!order,
    },
    { title: 'Repaired', sub: 'Passing cars confirm the road is clear', done: th?.state === 'resolved' },
  ]
  return { steps, stateWord: th ? STATE[th.state].word : 'Sending' }
}

export function StepList({ steps }: { steps: ReportStep[] }) {
  return (
    <ol className="relative mt-3 space-y-3.5 pl-7">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-rule" />
      {steps.map((s) => (
        <li key={s.title} className="relative">
          <span className={'absolute -left-7 top-0 grid h-[17px] w-[17px] place-items-center rounded-full border-2 ' + (s.done ? 'border-live bg-live shadow-[0_0_0_4px_rgba(31,111,178,0.15)]' : 'border-rule bg-clay')} />
          <div className={'text-[14px] leading-tight ' + (s.done ? 'text-ink' : 'text-ink-3')}>{s.title}</div>
          <div className="text-[11px] text-ink-3">{s.sub}</div>
        </li>
      ))}
    </ol>
  )
}

/** Citizen mode, as seen by the resident who reported tonight's barricade. */
export function CitizenStatus({ world }: { world: World }) {
  const report = citizenReport(world)
  const barricade = report ?? { pos: focusPoint(world), kind: 'unknown' as const, key: '' }
  const { steps } = useReportSteps(`script:${report?.key ?? ''}`, `a ${hazardLabel(barricade.kind).toLowerCase()}`)
  const confirmed = steps[2].done
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[32%] shrink-0 overflow-hidden">
        <MiniMap world={world} center={[barricade.pos[0], barricade.pos[1] + 20]} radius={140} route={false} className="absolute inset-0 h-full w-full" />
        <svg viewBox="-140 -140 280 280" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
          <circle cx={0} cy={-20} r={9} fill="none" stroke={confirmed ? '#e0401f' : '#d19a1c'} strokeWidth={2.4} strokeDasharray={confirmed ? undefined : '4 3'} />
        </svg>
      </div>
      <div className="flex-1 overflow-hidden px-5 pt-4">
        <div className="text-[22px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 110" }}>
          Your report
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-live">
          <ShieldCheckIcon size={15} weight="fill" />
          Street Guardian, 140 points
        </div>
        <StepList steps={steps} />
      </div>
    </div>
  )
}

export function PhoneDriver({ world }: { world: World }) {
  return (
    <>
      <DriveScreen world={world} />
      <TabBar active={0} />
    </>
  )
}

export function PhoneCitizen({ world }: { world: World }) {
  return (
    <>
      <CitizenStatus world={world} />
      <TabBar active={2} />
    </>
  )
}
