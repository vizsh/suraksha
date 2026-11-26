// The live picture every surface reads: scripted sensor reports for the current loop plus
// everything people and devices added, fused by the Threat Intelligence Engine, projected
// onto the ego car's route and filtered into its driver feed.
import { create } from 'zustand'
import { fuse } from '../engine/fusion'
import { implicitObstacles } from '../engine/implicit'
import { driverFeed, laneOf, type FeedItem, type RouteThreat } from '../engine/relevance'
import type { HazardKind, Manoeuvre, Observation, Threat, ThreatState, V2 } from '../engine/types'
import { engineNow, loopStart, simTime } from './clock'
import { egoAbsS, egoOffset, egoSpeed, type World } from './scenario'
import { useEvents } from '../sync/events'
import { conditionsFrom, useWeather } from '../sense/weather'
import { activeForecast, totalMm, useMonsoon, WARN_MM } from '../sense/monsoon'

export interface SourceView {
  id: string
  ageMs: number
  who: string
  how: string
  source: Observation['source']
  clear: boolean
}

export interface ThreatView {
  id: string
  kind: HazardKind | 'risk-zone'
  label: string
  lane: string
  state: ThreatState
  confidence: number
  sources: SourceView[]
  sourceCount: number
  ahead: number
  onRoute: boolean
  s: number
  offset: number
  pos: V2
  origin: 'script' | 'user' | 'predicted'
  obsIds: string[]
  firstSeen: number
  lastSeen: number
  synthetic: boolean
  ownOnly: boolean // only reported by this car's own cabin monitor: not something to warn this driver about
  clearedBy: number // passers since the last sighting who saw nothing there
  why?: string
}

export interface FeedView extends FeedItem {
  threat: ThreatView
}

const LABEL: Record<HazardKind, string> = {
  pedestrian: 'Pedestrian crossing',
  pothole: 'Pothole',
  barricade: 'Unmarked barricade',
  'speed-breaker': 'Unmarked speed breaker',
  debris: 'Debris on the road',
  waterlogging: 'Waterlogging',
  'stalled-vehicle': 'Stalled vehicle',
  animal: 'Animal on the road',
  manhole: 'Open manhole',
  footpath: 'Broken footpath',
  'erratic-vehicle': 'Erratic vehicle',
  unknown: 'Unknown obstacle',
}

export function hazardLabel(kind: HazardKind, note?: string) {
  if (kind === 'pedestrian' && note) return `${LABEL.pedestrian} ${note}`
  if (kind === 'pothole' && note) return `${LABEL.pothole}, ${note}`
  if (kind === 'debris' && note) return `${LABEL.debris}, ${note}`
  return LABEL[kind]
}

const nameCache = new Map<string, string>()
function nearestRoadName(w: World, p: V2) {
  const key = `${Math.round(p[0] / 25)}:${Math.round(p[1] / 25)}`
  const hit = nameCache.get(key)
  if (hit) return hit
  let best = { d: Infinity, name: 'the corridor' }
  for (const r of w.data.roads) {
    if (!r.name) continue
    for (const q of r.pts) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (d < best.d) best = { d, name: r.name }
    }
  }
  nameCache.set(key, best.name)
  return best.name
}

function toView(w: World, th: Threat, now: number, egoS: number): ThreatView {
  const pr = w.path.project(th.pos[0], th.pos[1])
  const onRoute = pr.dist < 10
  const sources: SourceView[] = [...th.observations]
    .filter((o) => !o.resolve)
    .sort((a, b) => b.t - a.t)
    .map((o) => ({ id: o.id, ageMs: now - o.t, who: o.who, how: o.how, source: o.source, clear: o.polarity === -1 }))
  const origin = th.observations.every((o) => o.id.startsWith('script:')) ? 'script' : 'user'
  const lane =
    th.kind === 'pedestrian' ? 'Crossing the carriageway' : onRoute ? `Lane ${laneOf(pr.offset)}` : `Near ${nearestRoadName(w, th.pos)}`
  return {
    id: th.id,
    kind: th.kind,
    label: hazardLabel(th.kind, th.note),
    lane,
    state: th.state,
    confidence: th.confidence,
    sources,
    sourceCount: th.sources,
    ahead: onRoute ? pr.s - egoS : Infinity,
    onRoute,
    s: pr.s,
    offset: pr.offset,
    pos: th.pos,
    origin,
    obsIds: th.observations.map((o) => o.id),
    firstSeen: th.firstSeen,
    lastSeen: th.lastSeen,
    synthetic: origin === 'script',
    ownOnly: th.observations.every((o) => o.sourceId.startsWith('monitor:')),
    clearedBy: th.clearedBy,
  }
}

/** Every observation known now: this loop's scripted reports plus everything users added. */
export function currentObservations(w: World) {
  const t = simTime()
  const l0 = loopStart()
  const scripted: Observation[] = w.script
    .filter((o) => o.at <= t)
    .map(({ at, key, ...o }) => ({ ...o, id: `script:${key}`, t: l0 + at * 1000 }))
  const scriptedMan: Manoeuvre[] = w.manoeuvres
    .filter((m) => m.at <= t)
    .map((m) => ({ id: `script:${m.key}`, t: l0 + m.at * 1000, vehicleId: m.vehicleId, pos: m.pos, type: m.type }))
  const ev = useEvents.getState()
  return { observations: [...scripted, ...ev.observations], manoeuvres: [...scriptedMan, ...ev.manoeuvres] }
}

interface SimState {
  world: World | null
  t: number
  now: number
  threats: ThreatView[]
  feed: FeedView[]
  xray: boolean
  setWorld: (w: World) => void
  tick: () => void
  setXray: (v: boolean) => void
}

export const useSim = create<SimState>((set, get) => ({
  world: null,
  t: 0,
  now: 0,
  threats: [],
  feed: [],
  xray: true,
  setWorld: (world) => {
    set({ world })
    get().tick()
  },
  setXray: (xray) => set({ xray }),
  tick: () => {
    const w = get().world
    if (!w) return
    const t = simTime()
    const now = engineNow()
    const { observations, manoeuvres } = currentObservations(w)
    const fused = fuse([...observations, ...implicitObstacles(manoeuvres, now)], now).filter((th) => th.state !== 'faded')
    const egoS = egoAbsS(w, t)
    const views = fused.map((th) => toView(w, th, now, egoS))

    for (const z of w.zones) {
      const pr = w.path.project(z.pos[0], z.pos[1])
      views.push({
        id: z.id,
        kind: 'risk-zone',
        label: z.label,
        lane: 'All lanes',
        state: 'predicted',
        confidence: Math.min(0.9, z.value / 1.4),
        sources: [{ id: z.id, ageMs: 0, who: 'Risk model', how: z.why, source: 'history', clear: false }],
        sourceCount: 1,
        ahead: pr.dist < 30 ? pr.s - egoS : Infinity,
        onRoute: pr.dist < 30,
        s: pr.s,
        offset: 0,
        pos: z.pos,
        origin: 'predicted',
        obsIds: [],
        firstSeen: 0,
        lastSeen: 0,
        synthetic: true,
        ownOnly: false,
        clearedBy: 0,
        why: z.why,
      })
    }

    // Monsoon early warning: heavy rain forecast over the corridor's lowest road points
    const mon = useMonsoon.getState()
    const fc = activeForecast(mon)
    const mm = totalMm(fc)
    if (mm >= WARN_MM) {
      const peak = fc.reduce((a, h) => (h.mm > a.mm ? h : a), fc[0])
      for (const lp of mon.lowPoints) {
        const pr = w.path.project(lp.pos[0], lp.pos[1])
        views.push({
          id: `monsoon-${lp.id}`,
          kind: 'risk-zone',
          label: `Waterlogging likely, ${lp.road.replace('Jogeshwari-Vikhroli Link Road', 'JVLR')}`,
          lane: 'All lanes',
          state: 'predicted',
          confidence: Math.min(0.95, 0.4 + mm / 60),
          sources: [{ id: `monsoon-src-${lp.id}`, ageMs: 0, who: 'Monsoon watch', how: `${mm.toFixed(0)} mm forecast in 6 h, peak at ${peak?.time ?? 'soon'}; ground ${lp.elev.toFixed(0)} m, a local low`, source: 'history', clear: false }],
          sourceCount: 1,
          ahead: pr.dist < 30 ? pr.s - egoS : Infinity,
          onRoute: pr.dist < 30,
          s: pr.s,
          offset: 0,
          pos: lp.pos,
          origin: 'predicted',
          obsIds: [],
          firstSeen: 0,
          lastSeen: 0,
          synthetic: mon.simulated,
          ownOnly: false,
          clearedBy: 0,
          why: `${mm.toFixed(0)} mm of rain in the next 6 h over a low point`,
        })
      }
    }

    const route: RouteThreat[] = views.filter((v) => !v.ownOnly).map((v) => ({ id: v.id, kind: v.kind, state: v.state, s: v.s, offset: v.offset, onRoute: v.onRoute }))
    const items = driverFeed(route, { s: egoS, offset: egoOffset(t), speed: egoSpeed(w, t) }, conditionsFrom(useWeather.getState().weather))
    const byId = new Map(views.map((v) => [v.id, v]))
    const feed = items.map((f) => ({ ...f, threat: byId.get(f.id)! }))
    set({ t, now, threats: views, feed })
  },
}))

/** The threat that absorbed a given observation, if any. */
export function threatForObservation(threats: ThreatView[], obsId: string) {
  return threats.find((th) => th.obsIds.includes(obsId))
}

export function ago(ms: number) {
  if (ms < 0) return 'scheduled'
  const s = ms / 1000
  if (s < 5) return 'now'
  if (s < 60) return `${Math.round(s)} s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86_400)} days ago`
}
