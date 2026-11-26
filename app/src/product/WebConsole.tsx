import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BroadcastIcon, CheckCircleIcon, WrenchIcon } from '@phosphor-icons/react'
import { BevCanvas } from '../three/Canvases'
import type { World } from '../world/scenario'
import { ago, threatForObservation, useSim, type ThreatView } from '../world/store'
import { engineNow } from '../world/clock'
import { useEvents, type WorkOrder } from '../sync/events'
import { useWeather, weatherWords } from '../sense/weather'
import type { HazardKind } from '../engine/types'
import { STATE, StateGlyph } from './bits'

type Tab = 'live' | 'reports' | 'orders' | 'blackspots'
const RANK: Record<string, number> = { confirmed: 0, potential: 1, noticed: 2, predicted: 3, resolved: 4, faded: 5 }
const REPAIRABLE = new Set<string>(['pothole', 'barricade', 'speed-breaker', 'debris', 'manhole', 'footpath', 'waterlogging', 'unknown'])

/** City operations console: fused lane-level view, threat inspector, reports, work orders, blackspots. */
export function WebConsole({ world }: { world: World }) {
  const threats = useSim((s) => s.threats)
  const feed = useSim((s) => s.feed)
  const [tab, setTab] = useState<Tab>('live')
  const [sel, setSel] = useState<string | null>(null)
  const live = useMemo(
    () => threats.filter((t) => t.state !== 'resolved').sort((a, b) => RANK[a.state] - RANK[b.state] || b.confidence - a.confidence),
    [threats],
  )
  // Follow the threat the driver is being told about, unless the operator picked one.
  const current = threats.find((t) => t.id === sel) ?? feed.find((f) => f.threat.state !== 'predicted')?.threat ?? live[0]

  return (
    <div className="grid h-full grid-cols-[1fr_380px] bg-clay text-ink">
      <div className="relative min-w-0 overflow-hidden border-r border-rule">
        <BevCanvas world={world} className="absolute inset-0" />
        <ConsoleHeader />
        <div className="pointer-events-none absolute bottom-3 left-4 flex gap-4 text-[11px] text-ink-2">
          {(['confirmed', 'potential', 'predicted'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <StateGlyph state={s} size={12} />
              {STATE[s].word}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <StateGlyph state="live" size={12} />
            Connected car
          </span>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col">
        <nav className="grid grid-cols-4 border-b border-rule text-[12px]">
          {(
            [
              ['live', 'Live'],
              ['reports', 'Reports'],
              ['orders', 'Work orders'],
              ['blackspots', 'Blackspots'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={'px-2 py-2.5 transition-colors ' + (tab === k ? 'bg-clay-deep font-semibold text-ink' : 'text-ink-3 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'live' && <LiveTab live={live} current={current} onSelect={setSel} />}
        {tab === 'reports' && <ReportsTab threats={threats} onSelect={(id) => (setSel(id), setTab('live'))} />}
        {tab === 'orders' && <OrdersTab threats={threats} />}
        {tab === 'blackspots' && <BlackspotsTab world={world} />}
      </aside>
    </div>
  )
}

function ConsoleHeader() {
  const weather = useWeather((s) => s.weather)
  const remote = useEvents((s) => s.remote)
  return (
    <div className="pointer-events-none absolute inset-x-4 top-3 flex items-baseline gap-3">
      <span className="text-[15px] font-semibold" style={{ fontVariationSettings: "'wdth' 112" }}>
        Jogeshwari-Vikhroli Link Road
      </span>
      <span className="text-[11px] text-ink-3">Eastbound, lane-level fused view</span>
      <span className="flex-1" />
      <span className="text-[11px] text-ink-3">{weatherWords(weather)}</span>
      <span className="text-[11px] text-ink-3">{remote === 'on' ? 'Devices linked' : 'This browser only'}</span>
    </div>
  )
}

function LiveTab({ live, current, onSelect }: { live: ThreatView[]; current?: ThreatView; onSelect: (id: string) => void }) {
  const add = useEvents((s) => s.addObservation)
  const upsert = useEvents((s) => s.upsertWorkOrder)
  const orders = useEvents((s) => s.workOrders)
  const [sent, setSent] = useState<string | null>(null)
  const canRepair = current && REPAIRABLE.has(current.kind) && current.state !== 'predicted'
  const hasOrder = current && orders.some((o) => o.threatId === current.id && o.status === 'dispatched')

  const verify = () => {
    if (!current || current.kind === 'risk-zone') return
    add({
      id: `op-${Date.now()}`,
      t: engineNow(),
      kind: current.kind as HazardKind,
      source: 'operator',
      sourceId: 'ops-ward-s',
      pos: current.pos,
      conf: 1,
      who: 'City operator',
      how: 'Verified on CCTV, broadcast to drivers',
    })
    setSent(current.id)
    setTimeout(() => setSent(null), 2600)
  }
  const dispatch = () => {
    if (!current) return
    const wo: WorkOrder = {
      id: `wo-${Date.now()}`,
      threatId: current.id,
      label: current.label,
      pos: current.pos,
      createdAt: engineNow(),
      status: 'dispatched',
      crew: 'Ward S road maintenance',
    }
    upsert(wo)
  }

  return (
    <>
      <div className="border-b border-rule px-4 pb-2 pt-3">
        <ul className="max-h-[220px] space-y-0.5 overflow-auto">
          {live.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onSelect(t.id)}
                className={
                  'flex w-full items-center gap-2 px-1.5 py-1 text-left text-[13px] transition-colors ' +
                  (t.id === current?.id ? 'bg-clay-deep' : 'hover:bg-clay-deep/60')
                }
              >
                <StateGlyph state={t.state} size={13} />
                <span className="flex-1 truncate">{t.state === 'potential' || t.state === 'noticed' ? `Possible ${t.label.toLowerCase()}` : t.label}</span>
                {t.origin === 'user' && <span className="text-[10px] text-live">live report</span>}
                <span className="figures text-[10px] text-ink-3">{Math.round(t.confidence * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {current && (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <StateGlyph state={current.state} size={18} />
            <span className="text-[17px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 92" }}>
              {current.label}
            </span>
          </div>
          <div className="mt-1 text-[12px]" style={{ color: STATE[current.state].text }}>
            {STATE[current.state].word}, {current.lane}
            {current.sourceCount > 0 && current.state !== 'predicted' && `, ${current.sourceCount} independent source${current.sourceCount === 1 ? '' : 's'}`}
          </div>
          <div className="mt-3 h-[3px] w-full bg-clay-shade/60">
            <motion.div className="h-full" style={{ background: STATE[current.state].color }} animate={{ width: `${current.confidence * 100}%` }} />
          </div>
          <Lifeline state={current.state} />
          <ol className="mt-3 space-y-1.5">
            {current.sources.slice(0, 6).map((s) => (
              <li key={s.id} className="grid grid-cols-[1fr_auto] gap-2 text-[12px]">
                <span>
                  {s.who}
                  <span className="block text-[11px] text-ink-3">{s.how}</span>
                </span>
                <span className="text-[10px] text-ink-3">{s.source === 'history' && s.ageMs === 0 ? 'model' : ago(s.ageMs)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-rule px-4 py-3">
        {canRepair && (
          <button
            onClick={dispatch}
            disabled={hasOrder}
            className="flex items-center gap-1.5 border border-ink/30 px-2.5 py-1.5 text-[12px] hover:bg-clay-deep disabled:opacity-50"
          >
            <WrenchIcon size={14} />
            {hasOrder ? 'Crew dispatched' : 'Dispatch work order'}
          </button>
        )}
        <span className="flex-1" />
        <button
          onClick={verify}
          disabled={!current || current.kind === 'risk-zone' || current.state === 'resolved'}
          className="flex items-center gap-1.5 bg-confirmed-text px-2.5 py-1.5 text-[12px] font-medium text-[#f6efe9] hover:bg-confirmed active:translate-y-px disabled:opacity-40"
        >
          <BroadcastIcon size={14} />
          {sent === current?.id ? 'Sent to drivers nearby' : 'Verify and broadcast'}
        </button>
      </div>
    </>
  )
}

const LIFE = ['noticed', 'potential', 'confirmed', 'resolved'] as const
function Lifeline({ state }: { state: ThreatView['state'] }) {
  if (state === 'predicted') return null
  const idx = LIFE.indexOf(state as (typeof LIFE)[number])
  return (
    <div className="mt-3 grid grid-cols-4 gap-1">
      {LIFE.map((s, i) => (
        <div key={s} className="flex flex-col gap-1">
          <div className="h-[2px]" style={{ background: i <= idx ? STATE[s].color : '#c9c3b5' }} />
          <span className={'text-[10px] ' + (i === idx ? 'font-semibold text-ink' : 'text-ink-3')}>{STATE[s].word}</span>
        </div>
      ))}
    </div>
  )
}

function ReportsTab({ threats, onSelect }: { threats: ThreatView[]; onSelect: (id: string) => void }) {
  const obs = useEvents((s) => s.observations)
  const thumbs = useEvents((s) => s.thumbs)
  const now = useSim((s) => s.now)
  const list = [...obs].filter((o) => o.source !== 'operator').sort((a, b) => b.t - a.t)
  if (list.length === 0) {
    return (
      <div className="px-4 py-6 text-[13px] leading-relaxed text-ink-2">
        No reports from people yet. Open the phone app at <span className="font-medium">/app</span>, report a hazard or shake the phone in drive mode, and it lands here within seconds.
      </div>
    )
  }
  return (
    <ul className="min-h-0 flex-1 divide-y divide-rule/60 overflow-auto px-4">
      <AnimatePresence initial={false}>
        {list.map((o) => {
          const th = threatForObservation(threats, o.id)
          return (
            <motion.li key={o.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 py-2.5">
              {thumbs[o.id] ? (
                <img src={thumbs[o.id]} alt="" className="h-12 w-12 shrink-0 object-cover" />
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center bg-clay-deep text-[10px] text-ink-3">{o.source.toUpperCase()}</span>
              )}
              <button className="min-w-0 flex-1 text-left" onClick={() => th && onSelect(th.id)}>
                <div className="truncate text-[13px] font-medium">{o.who}</div>
                <div className="truncate text-[11px] text-ink-3">{o.how}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                  {th && <StateGlyph state={th.state} size={11} />}
                  <span style={{ color: th ? STATE[th.state].text : undefined }}>{th ? STATE[th.state].word : 'Faded'}</span>
                  <span className="text-ink-3">{ago(now - o.t)}</span>
                </div>
              </button>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

function OrdersTab({ threats }: { threats: ThreatView[] }) {
  const orders = useEvents((s) => s.workOrders)
  const upsert = useEvents((s) => s.upsertWorkOrder)
  const add = useEvents((s) => s.addObservation)
  const now = useSim((s) => s.now)
  const repaired = (wo: WorkOrder) => {
    const th = threats.find((t) => t.id === wo.threatId)
    add({
      id: `fix-${wo.id}`,
      t: engineNow(),
      kind: (th?.kind === 'risk-zone' ? 'unknown' : th?.kind) ?? 'unknown',
      source: 'operator',
      sourceId: 'ops-ward-s',
      pos: wo.pos,
      conf: 1,
      resolve: true,
      who: 'Ward S crew',
      how: 'Repair completed',
    })
    upsert({ ...wo, status: 'repaired', repairedAt: engineNow() })
  }
  if (orders.length === 0) {
    return <div className="px-4 py-6 text-[13px] leading-relaxed text-ink-2">No work orders. Select a road hazard in Live and dispatch a crew.</div>
  }
  return (
    <ul className="min-h-0 flex-1 divide-y divide-rule/60 overflow-auto px-4">
      {[...orders].reverse().map((wo) => {
        const th = threats.find((t) => t.id === wo.threatId)
        return (
          <li key={wo.id} className="py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              {th && <StateGlyph state={th.state} size={12} />}
              {wo.label}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-3">
              {wo.crew}, dispatched {ago(now - wo.createdAt)}
            </div>
            {wo.status === 'dispatched' ? (
              <button onClick={() => repaired(wo)} className="mt-2 flex items-center gap-1.5 border border-ink/30 px-2.5 py-1 text-[12px] hover:bg-clay-deep">
                <CheckCircleIcon size={14} />
                Mark repaired
              </button>
            ) : (
              <div className="mt-1.5 text-[12px] text-ink-2">
                Repaired {ago(now - (wo.repairedAt ?? now))}. Passing cars now confirm the road is clear.
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function BlackspotsTab({ world }: { world: World }) {
  const ranked = [...world.zones].sort((a, b) => b.value - a.value)
  const first = ['14 Mar 2025', '2 Aug 2025', '19 Jan 2026']
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
      <p className="text-[12px] leading-relaxed text-ink-2">
        Ranked by predicted risk from road geometry and crash history. Crash history in this prototype is synthetic.
      </p>
      <ol className="mt-3 space-y-3">
        {ranked.map((z, i) => (
          <li key={z.id} className="grid grid-cols-[28px_1fr] gap-2">
            <span className="figures text-[18px] leading-none text-predicted">{i + 1}</span>
            <span>
              <span className="block text-[13px] font-medium">{z.label}</span>
              <span className="block text-[11px] text-ink-3">{z.why}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3">First flagged {first[i % first.length]}, risk {z.value.toFixed(2)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
