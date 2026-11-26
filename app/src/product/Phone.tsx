import { useMemo, type ReactNode } from 'react'
import { CameraIcon, HouseIcon, MapTrifoldIcon, ShieldCheckIcon, UserIcon } from '@phosphor-icons/react'
import type { World } from '../world/scenario'
import { threatForObservation, useSim } from '../world/store'
import { useEvents } from '../sync/events'
import { MapOverlay, MiniMap, STATE, Scaled, StateGlyph, alertCopy, egoCenter } from './bits'

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

export function TabBar({ active, onChange }: { active: number; onChange?: (i: number) => void }) {
  return (
    <nav className="absolute inset-x-0 bottom-0 grid grid-cols-4 border-t border-rule bg-clay/95 pb-5 pt-2">
      {TABS.map(({ icon: Icon, label }, i) => (
        <button
          key={label}
          onClick={() => onChange?.(i)}
          className={'flex flex-col items-center gap-0.5 text-[10px] ' + (i === active ? 'text-ink' : 'text-ink-3')}
          aria-current={i === active ? 'page' : undefined}
        >
          <Icon size={20} weight={i === active ? 'fill' : 'regular'} />
          {label}
        </button>
      ))}
    </nav>
  )
}

/** Driver mode: route map and what is coming, in confidence-aware words. */
export function DriveScreen({ world, children }: { world: World; children?: ReactNode }) {
  const t = useSim((s) => s.t)
  const feed = useSim((s) => s.feed)
  const center = useMemo(() => egoCenter(world, Math.floor(t / 4) * 4), [world, t])
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[44%] shrink-0 overflow-hidden">
        <MiniMap world={world} center={center} radius={260} className="absolute inset-0 h-full w-full" />
        <MapOverlay world={world} center={center} radius={260} />
      </div>
      <div className="flex-1 overflow-hidden px-5 pt-4">
        <div className="text-[22px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 110" }}>
          Road ahead
        </div>
        <div className="text-[12px] text-ink-3">JVLR eastbound, toward Powai</div>
        <ul className="mt-3 divide-y divide-rule/70">
          {feed.slice(0, 3).map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <StateGlyph state={f.threat.state} size={18} />
              <span className="flex-1 text-[14px] leading-tight">
                {alertCopy(f).title}
                <span className="block text-[11px]" style={{ color: STATE[f.threat.state].text }}>
                  {STATE[f.threat.state].word}, {f.threat.lane}
                </span>
              </span>
              <span className="figures text-[13px]">{Math.max(0, Math.round(f.ahead))} m</span>
            </li>
          ))}
          {feed.length === 0 && <li className="py-3 text-[13px] text-ink-3">Nothing reported on your route.</li>}
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
    <ol className="relative mt-3 space-y-3 pl-6">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-rule" />
      {steps.map((s) => (
        <li key={s.title} className="relative">
          <span className={'absolute -left-6 top-0.5 h-[15px] w-[15px] rounded-full border-2 ' + (s.done ? 'border-live bg-live' : 'border-rule bg-clay')} />
          <div className={'text-[14px] leading-tight ' + (s.done ? 'text-ink' : 'text-ink-3')}>{s.title}</div>
          <div className="text-[11px] text-ink-3">{s.sub}</div>
        </li>
      ))}
    </ol>
  )
}

/** Citizen mode, as seen by the resident who reported tonight's barricade. */
export function CitizenStatus({ world }: { world: World }) {
  const barricade = world.script.find((o) => o.key === 'barricade-citizen')!
  const { steps } = useReportSteps('script:barricade-citizen', 'a barricade')
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
