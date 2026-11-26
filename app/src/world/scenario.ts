// The world for one scenario: the route, your car and the car ahead, everything standing or moving
// on the road, the scripted sensor reports, and the background traffic. Scenarios themselves are
// defined in scenarios.ts; this file turns one into positions and timings.
import { ROAD_WIDTH, buildRisk, chainRoad, Path, type CorridorData, type RiskField, type V2 } from './corridor'
import { LOOP } from './clock'
import { buildJunctions, simulateTraffic, type AmbientCar, type Junction } from './traffic'
import { EGO_PLATE, SCOUT_PLATE, scenarioById, type Crossing, type Marks, type ScenarioDef, type ScenarioId, type ScriptManoeuvre, type ScriptObs } from './scenarios'

export { LOOP, EGO_PLATE, SCOUT_PLATE }
export type { ScriptObs, ScriptManoeuvre }

export type AgentKind = 'car' | 'bus' | 'auto' | 'bike' | 'ped' | 'cone' | 'cow'
export interface Agent {
  id: string
  kind: AgentKind
  x: number
  z: number
  heading: number
  connected: boolean
  role?: 'ego' | 'scout' | 'ambient' | 'stalled'
  brake?: boolean // brake lights on (or hazard lights, flashing)
  paint?: string
  lying?: boolean
  height?: number
  shirt?: string
}

export interface RiskZone {
  id: string
  pos: V2
  value: number
  label: string
  why: string
}

export interface World {
  data: CorridorData
  scenario: ScenarioDef
  path: Path
  path2: Path | null
  risk: RiskField
  sStart: number
  egoS: Float32Array
  scoutS: Float32Array
  script: ScriptObs[]
  manoeuvres: ScriptManoeuvre[]
  zones: RiskZone[]
  junctions: Junction[]
  traffic: AmbientCar[]
  marks: Marks
  /** your car's lane offset at time t */
  egoLane: (t: number) => number
  /** arc length (absolute) of the place the views centre on */
  focusS: number
  /** half the carriageway width: the kerb is about here */
  halfWidth: number
}

const DT = 0.05

function integrate(s0: number, speed: (t: number) => number) {
  const n = Math.ceil(LOOP / DT) + 1
  const out = new Float32Array(n)
  out[0] = s0
  for (let i = 1; i < n; i++) out[i] = out[i - 1] + Math.max(0, speed(i * DT)) * DT
  return out
}
function lookup(table: Float32Array, t: number) {
  const f = t / DT
  const i = Math.min(table.length - 2, Math.max(0, Math.floor(f)))
  const k = f - i
  return table[i] * (1 - k) + table[i + 1] * k
}
const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Offset of someone crossing, at time t. */
export function crossingOffset(c: Crossing, t: number) {
  return c.from + (c.to - c.from) * ramp(t, c.t0, c.t1)
}

export function buildWorld(data: CorridorData, id?: ScenarioId | string): World {
  const sc = scenarioById(id)
  const path = chainRoad(data.roads, sc.route)
  let path2: Path | null = null
  if (sc.traffic.oncoming?.length) {
    // a two-way road: oncoming traffic drives the same centreline, reversed
    path2 = new Path([...path.pts].reverse())
  } else {
    try {
      const p2 = chainRoad(data.roads, sc.route, path.ids)
      if (p2.length > 400) path2 = p2
    } catch {
      path2 = null
    }
  }
  const sStart = sc.start(path.length)
  const egoS = integrate(sStart, sc.egoSpeed)
  const scoutS = integrate(sStart + sc.scout.gap, sc.scout.speed)

  const r = rand(11)
  const at = (s: number, o: number, jitter = 0): V2 => {
    const p = path.at(sStart + s, o)
    return [p.x + (r() - 0.5) * jitter, p.z + (r() - 0.5) * jitter]
  }
  const script: ScriptObs[] = []
  const manoeuvres: ScriptManoeuvre[] = []
  sc.script({
    at,
    crossingAt: (c, t) => at(c.s, crossingOffset(c, t)),
    add: (o) => script.push(o),
    swerve: (t, vehicleId, s, off) => manoeuvres.push({ at: t, key: `swerve-${manoeuvres.length}`, vehicleId, pos: at(s, off, 2), type: 'swerve' }),
    brake: (t, vehicleId, s, off) => manoeuvres.push({ at: t, key: `brake-${manoeuvres.length}`, vehicleId, pos: at(s, off, 2), type: 'harsh-brake' }),
  })

  const risk = buildRisk(
    data,
    sc.risk.map(([s, off, amp, sigma]) => ({ p: at(s, off), amp, sigma })),
  )
  const roadName = (p: V2) => {
    let best = { d: Infinity, name: '' }
    for (const rd of data.roads) {
      if (!rd.name || !['primary', 'secondary', 'tertiary', 'trunk'].includes(rd.kind)) continue
      for (const q of rd.pts) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1])
        if (d < best.d) best = { d, name: rd.name }
      }
    }
    return best.name.replace('Jogeshwari-Vikhroli Link Road', 'JVLR').replace('Jogeshwari-Vikhroli Link Turnpike', 'JVLR')
  }
  const focus = at(sc.focus, 0)
  const seen = new Set<string>()
  const zones: RiskZone[] = []
  for (const pk of risk.peaks) {
    if (zones.length === 3) break
    const near = data.points
      .filter((f) => f.kind === 'traffic_signals' || f.kind === 'bus_stop')
      .map((f) => ({ f, d: Math.hypot(f.p[0] - pk.p[0], f.p[1] - pk.p[1]) }))
      .sort((a, b) => a.d - b.d)[0]
    const atFocus = Math.hypot(pk.p[0] - focus[0], pk.p[1] - focus[1]) < 45 && !!sc.marks.bus
    const road = roadName(pk.p)
    const kindLabel = atFocus ? 'Bus stop crossing' : near && near.d < 70 && near.f.kind === 'traffic_signals' ? 'Signal junction' : 'High-risk segment'
    const label = road ? `${kindLabel}, ${road}` : kindLabel
    if (seen.has(label)) continue
    seen.add(label)
    const why = atFocus
      ? 'No zebra, footpath gap, 4 pedestrian incidents (synthetic)'
      : kindLabel === 'Signal junction'
        ? 'Turning conflicts, 6 pedestrian incidents (synthetic)'
        : 'Speed and crossings, 3 incidents (synthetic)'
    zones.push({ id: `zone-${zones.length}`, pos: pk.p, value: pk.value, label, why })
  }

  // background traffic: the same random draw for every scenario, so car a3 is always car a3
  const rr = rand(47)
  const kinds: AmbientCar['kind'][] = ['car', 'car', 'car', 'auto', 'bike', 'car', 'bike', 'car', 'auto']
  const lanes = sc.traffic.lanes
  const oncoming = sc.traffic.oncoming ?? []
  const specs = Array.from({ length: sc.traffic.count ?? 64 }, (_, i) => {
    const s0 = rr() * 2000
    const v = 8 + rr() * 5
    const opposite = i % 2 === 1 && path2 !== null && (oncoming.length > 0 || !sc.traffic.oncoming)
    const lane = opposite && oncoming.length ? oncoming[i % oncoming.length] : lanes[i % lanes.length]
    return { s0, v: oncoming.length ? v * 0.75 : v, lane, kind: kinds[i % kinds.length], opposite }
  })
  const signals = data.points.filter((f) => f.kind === 'traffic_signals')
  const junctions = buildJunctions(signals, path, path2, [egoS, scoutS])
  const traffic = simulateTraffic(
    specs,
    path,
    path2,
    junctions,
    [
      { s: egoS, lane: sc.egoLane },
      { s: scoutS, lane: () => sc.scout.lane },
    ],
    LOOP,
    (sc.traffic.blocks ?? []).map((b) => ({ s: sStart + b.s, lane: b.lane, until: b.until })),
  )

  const kind = data.roads.find((rd) => rd.name && sc.route.test(rd.name))?.kind ?? 'primary'
  const halfWidth = (ROAD_WIDTH[kind] ?? 12) / 2
  return { data, scenario: sc, path, path2, risk, sStart, egoS, scoutS, script, manoeuvres, zones, junctions, traffic, marks: sc.marks, egoLane: sc.egoLane, focusS: sStart + sc.focus, halfWidth }
}

/** Absolute arc length of the ego car along the route. */
export function egoAbsS(w: World, t: number) {
  return lookup(w.egoS, t)
}

/** Ego distance travelled since the loop began. */
export function egoSAt(w: World, t: number) {
  return lookup(w.egoS, t) - w.sStart
}

export function egoSpeed(w: World, t: number) {
  const a = lookup(w.egoS, Math.max(0, t - 0.2))
  const b = lookup(w.egoS, Math.min(LOOP - 0.01, t + 0.2))
  return (b - a) / (Math.min(LOOP - 0.01, t + 0.2) - Math.max(0, t - 0.2))
}

/** Sensor-wave radius in metres for the X-ray sweep at time t. */
export function waveRadius(t: number) {
  const period = 8
  const k = (t % period) / period
  return 40 + 560 * (1 - Math.pow(1 - Math.min(1, k * 1.15), 3))
}

const AGENTS: Agent[] = []

export function sampleAgents(w: World, t: number): Agent[] {
  const { path, sStart, marks } = w
  AGENTS.length = 0
  const put = (id: string, kind: AgentKind, s: number, off: number, connected: boolean, extra: Partial<Agent> = {}, on: Path = path, turn = 0) => {
    const p = on.at(s, off)
    AGENTS.push({ id, kind, x: p.x, z: p.z, heading: p.heading + turn, connected, ...extra })
  }
  const braking = (tab: Float32Array) => {
    const a = lookup(tab, Math.max(0, t - 0.15))
    const b = lookup(tab, t)
    const c = lookup(tab, Math.min(LOOP - 0.01, t + 0.15))
    return (c - b - (b - a)) / (0.15 * 0.15) < -1
  }
  put('ego', 'car', lookup(w.egoS, t), w.egoLane(t), true, { role: 'ego', brake: braking(w.egoS) })
  put('scout', 'car', lookup(w.scoutS, t), w.scenario.scout.lane, true, { role: 'scout', brake: braking(w.scoutS) })
  if (marks.bus) put('bus', 'bus', sStart + marks.bus.s, marks.bus.off, false, { paint: marks.bus.paint })
  marks.crossings.forEach((c, i) => {
    if (t > c.t0 - 2 && t < c.t1 + 3) put(i ? `ped${i}` : 'ped', 'ped', sStart + c.s, crossingOffset(c, t), false, { height: c.height, shirt: c.shirt })
  })
  if (marks.barricade !== undefined) for (let i = 0; i < 6; i++) put(`cone${i}`, 'cone', sStart + marks.barricade - 4 + i * 2.2, -5.4 + i * 0.6, false)
  // stopped cars with their hazard lights flashing
  const hazard = Math.floor(t * 1.6) % 2 === 0
  marks.stalled?.forEach((st, i) => put(`stalled${i}`, 'car', sStart + st.s, st.off, false, { role: 'stalled', brake: hazard, paint: st.paint }, path, i % 2 ? 0.08 : -0.12))
  marks.cattle?.forEach((c, i) => {
    const k = ramp(t, c.t0, c.t1)
    const off = c.off0 + (c.off1 - c.off0) * k
    // a cow walking across faces where it is going; one lying down sits at an angle to the road
    const across = c.off1 !== c.off0 && k > 0 && k < 1
    const turn = across ? (c.off1 > c.off0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3) : 0.9 + i * 0.7
    put(`cow${i}`, 'cow', sStart + c.s, off, false, { lying: c.lying, paint: i % 2 ? '#d9d3c7' : '#8b7f72' }, path, turn)
  })
  if (marks.wrongWay) {
    const ww = marks.wrongWay
    if (t >= ww.t0) put('wrongway', 'bike', sStart + ww.s0 - ww.speed * (t - ww.t0), ww.off, false, {}, path, Math.PI)
  }
  w.traffic.forEach((a, i) => {
    const k = Math.min(a.s.length - 1, Math.round(t / DT))
    put(`a${i}`, a.kind, lookup(a.s, t), a.lane, i % 3 === 0, { role: 'ambient', brake: a.brake[k] === 1 }, a.opposite && w.path2 ? w.path2 : path)
  })
  return AGENTS
}

/** Connected-car message arcs at time t: a burst from a nearby connected car for each live report. */
export function arcsAt(w: World, t: number): { from: string; to: string; p: number; color: 'confirmed' | 'potential' }[] {
  const bursts = w.script
    .filter((o) => o.at >= 0 && o.at < LOOP && (o.source === 'vision' || o.source === 'imu' || o.source === 'citizen') && (o.polarity ?? 1) === 1)
    .filter((o, i, all) => all.findIndex((x) => Math.abs(x.at - o.at) < 1.2) === i)
    .slice(0, 6)
    .map((o, i) => ({ t: o.at, from: o.sourceId === SCOUT_PLATE ? 'scout' : `a${(i * 3 + 3) % 45}`, color: (i >= 2 ? 'confirmed' : 'potential') as 'confirmed' | 'potential' }))
  const targets = ['ego', 'a0', 'a15', 'a21', 'a30', 'a33']
  const out: { from: string; to: string; p: number; color: 'confirmed' | 'potential' }[] = []
  for (const b of bursts) {
    const p = (t - b.t) / 1.6
    if (p < 0 || p > 1) continue
    for (const to of targets) if (to !== b.from) out.push({ from: b.from, to, p, color: b.color })
  }
  return out
}

/** A spot on the ego's route ahead, quantised so that reports from several phones land together. */
export function virtualSpotAhead(w: World, t: number, metresAhead = 160): V2 {
  const s = Math.ceil((lookup(w.egoS, t) + metresAhead) / 120) * 120
  const p = w.path.at(s, 0)
  return [p.x, p.z]
}

/** The scenario's first resident report: the one the landing page and phone follow end to end. */
export function citizenReport(w: World): ScriptObs | undefined {
  return w.script.find((o) => o.source === 'citizen' && o.at >= 0 && (o.polarity ?? 1) === 1) ?? w.script.find((o) => o.source === 'citizen')
}

/** World position of the place the views centre on. */
export function focusPoint(w: World): V2 {
  const p = w.path.at(w.focusS, 0)
  return [p.x, p.z]
}
