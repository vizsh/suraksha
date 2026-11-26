// The demo scenario on the real Powai corridor (JVLR eastbound, left-hand traffic).
// It does not script threat states. It scripts what vehicles and people do and what each
// sensor reports; the Threat Intelligence Engine decides what is noticed, confirmed or resolved.
import { buildRisk, chainRoad, type CorridorData, type Path, type RiskField, type V2 } from './corridor'
import { LOOP } from './clock'
import type { HazardKind, Observation } from '../engine/types'

export { LOOP }

export type AgentKind = 'car' | 'bus' | 'auto' | 'bike' | 'ped' | 'cone'
export interface Agent {
  id: string
  kind: AgentKind
  x: number
  z: number
  heading: number
  connected: boolean
  role?: 'ego' | 'scout' | 'ambient'
}

/** A scripted sensor report, timed in seconds into the loop (negative = before the loop, e.g. history). */
export interface ScriptObs extends Omit<Observation, 't' | 'id'> {
  at: number
  key: string
}
export interface ScriptManoeuvre {
  at: number
  key: string
  vehicleId: string
  pos: V2
  type: 'swerve' | 'harsh-brake'
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
  path: Path
  path2: Path | null
  risk: RiskField
  sStart: number
  egoS: Float32Array
  scoutS: Float32Array
  script: ScriptObs[]
  manoeuvres: ScriptManoeuvre[]
  zones: RiskZone[]
}

export const EGO_PLATE = 'MH-02 EV 4471'
const DT = 0.05
export const BUS_S = 300
export const BARRICADE_S = 430
export const POTHOLE_S = 130
export const PED_T0 = 21
export const PED_T1 = 31.5

function integrate(s0: number, speed: (t: number) => number) {
  const n = Math.ceil(LOOP / DT) + 1
  const out = new Float32Array(n)
  out[0] = s0
  for (let i = 1; i < n; i++) out[i] = out[i - 1] + speed(i * DT) * DT
  return out
}
function lookup(table: Float32Array, t: number) {
  const f = t / DT
  const i = Math.min(table.length - 2, Math.max(0, Math.floor(f)))
  const k = f - i
  return table[i] * (1 - k) + table[i + 1] * k
}
const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))
const smooth = (x: number) => x * x * (3 - 2 * x)

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const DAY = 86_400

export function buildWorld(data: CorridorData): World {
  const JV = /Jogeshwari-Vikhroli Link Road|Jogeshwari-Vikhroli Link Turnpike/
  const path = chainRoad(data.roads, JV)
  let path2: Path | null = null
  try {
    const p2 = chainRoad(data.roads, JV, path.ids)
    if (p2.length > 400) path2 = p2
  } catch {
    path2 = null
  }
  const sStart = Math.max(40, Math.min(path.length * 0.12, path.length - 620))

  const egoSpeed = (t: number) => 11 - 6.5 * smooth(ramp(t, 21, 25)) + 6.5 * smooth(ramp(t, 32, 36))
  const scoutSpeed = (t: number) => 11 - 8 * smooth(ramp(t, 22.2, 23.4)) + 8 * smooth(ramp(t, 25.5, 28))
  const egoS = integrate(sStart, egoSpeed)
  const scoutS = integrate(sStart + 72, scoutSpeed)

  const r = rand(11)
  const at = (s: number, o: number, jitter = 0): V2 => {
    const p = path.at(sStart + s, o)
    return [p.x + (r() - 0.5) * jitter, p.z + (r() - 0.5) * jitter]
  }
  const pedAt = (t: number): V2 => {
    const k = ramp(t, PED_T0, PED_T1)
    return at(BUS_S + 7.5, -10 + 14 * k)
  }

  const script: ScriptObs[] = []
  const add = (o: ScriptObs) => script.push(o)
  const base = (kind: HazardKind) => ({ kind, polarity: 1 as const })

  // Pothole: known for days. Two cars' accelerometers, one dashcam, one resident.
  add({ ...base('pothole'), key: 'pothole-imu-1', at: -3 * DAY, source: 'imu', sourceId: 'MH-01 CX 2210', pos: at(POTHOLE_S, 0, 2), conf: 0.82, who: 'MH-01 CX 2210', how: 'IMU spike, 7.4 m/s²', note: '1.2 m wide' })
  add({ ...base('pothole'), key: 'pothole-imu-2', at: -2.6 * DAY, source: 'imu', sourceId: 'MH-04 JD 0918', pos: at(POTHOLE_S, 0.4, 2), conf: 0.76, who: 'MH-04 JD 0918', how: 'IMU spike, 6.1 m/s²' })
  add({ ...base('pothole'), key: 'pothole-vision', at: -2 * DAY, source: 'vision', sourceId: 'MH-03 AK 5530', pos: at(POTHOLE_S, 0, 1.5), conf: 0.91, who: 'MH-03 AK 5530 dashcam', how: 'Road-damage detector, 0.91', note: '1.2 m wide' })
  add({ ...base('pothole'), key: 'pothole-citizen', at: -1 * DAY, source: 'citizen', sourceId: 'resident-ward-s-14', reputation: 0.85, pos: at(POTHOLE_S, -0.5, 3), conf: 0.9, who: 'Resident, ward S', how: 'Photo and location' })

  // Barricade: put up tonight, on no map. A resident reports it; cars start swerving; a dashcam names it.
  add({ ...base('barricade'), key: 'barricade-citizen', at: 6, source: 'citizen', sourceId: 'resident-ward-s-77', reputation: 0.6, pos: at(BARRICADE_S, -3.5, 4), conf: 0.9, who: 'Resident, ward S', how: 'Photo, first report from this account' })
  add({ ...base('barricade'), key: 'barricade-vision', at: 18, source: 'vision', sourceId: 'MH-47 BT 6602', pos: at(BARRICADE_S, -3.6, 1), conf: 0.78, who: 'MH-47 BT 6602 dashcam', how: 'Open-vocabulary detector: "barricade"' })

  const manoeuvres: ScriptManoeuvre[] = [
    { at: 10.5, vehicleId: 'MH-02 FF 1187', s: BARRICADE_S - 6 },
    { at: 11.2, vehicleId: 'MH-03 KL 7720', s: BARRICADE_S - 4 },
    { at: 12.0, vehicleId: 'MH-01 QA 3391', s: BARRICADE_S - 7 },
    { at: 13.4, vehicleId: 'MH-43 ZR 0045', s: BARRICADE_S - 5 },
    { at: 14.1, vehicleId: 'MH-02 PM 8852', s: BARRICADE_S - 3 },
  ].map((m, i) => ({ at: m.at, key: `swerve-${i}`, vehicleId: m.vehicleId, pos: at(m.s, -3.2, 2), type: 'swerve' as const }))

  // Pedestrian behind the bus: the car ahead sees them, an oncoming car agrees, and once the
  // bus no longer hides them the ego car's own camera sees them too.
  for (const t of [22.3, 22.8, 23.3, 23.8, 24.3]) {
    add({ ...base('pedestrian'), key: `ped-scout-${t}`, at: t, source: 'vision', sourceId: 'MH-03 AK 5530', pos: pedAt(t), conf: 0.88, who: 'Car ahead, MH-03 AK 5530', how: 'Dashcam vision, 0.88', note: 'from the left' })
  }
  for (const t of [22.9, 23.5]) {
    add({ ...base('pedestrian'), key: `ped-oncoming-${t}`, at: t, source: 'vision', sourceId: 'MH-02 RT 3017', pos: pedAt(t), conf: 0.81, who: 'Oncoming car, MH-02 RT 3017', how: 'Dashcam vision, 0.81', note: 'from the left' })
  }
  for (let t = 27.5; t <= 31.01; t += 0.5) {
    add({ ...base('pedestrian'), key: `ped-ego-${t}`, at: t, source: 'vision', sourceId: EGO_PLATE, pos: pedAt(t), conf: 0.95, who: 'Your car', how: 'Dashcam vision, 0.95', note: 'from the left' })
  }

  const busKerb = at(BUS_S + 4, -6)
  const risk = buildRisk(data, [{ p: busKerb, amp: 0.7, sigma: 30 }])
  const roadName = (p: V2) => {
    let best = { d: Infinity, name: '' }
    for (const r of data.roads) {
      if (!r.name || !['primary', 'secondary', 'tertiary', 'trunk'].includes(r.kind)) continue
      for (const q of r.pts) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1])
        if (d < best.d) best = { d, name: r.name }
      }
    }
    return best.name.replace('Jogeshwari-Vikhroli Link Road', 'JVLR').replace('Jogeshwari-Vikhroli Link Turnpike', 'JVLR')
  }
  const seen = new Set<string>()
  const zones: RiskZone[] = []
  for (const pk of risk.peaks) {
    if (zones.length === 3) break
    const near = data.points
      .filter((f) => f.kind === 'traffic_signals' || f.kind === 'bus_stop')
      .map((f) => ({ f, d: Math.hypot(f.p[0] - pk.p[0], f.p[1] - pk.p[1]) }))
      .sort((a, b) => a.d - b.d)[0]
    const atBus = Math.hypot(pk.p[0] - busKerb[0], pk.p[1] - busKerb[1]) < 40
    const road = roadName(pk.p)
    const kindLabel = atBus ? 'Bus stop crossing' : near && near.d < 70 && near.f.kind === 'traffic_signals' ? 'Signal junction' : 'High-risk segment'
    const label = road ? `${kindLabel}, ${road}` : kindLabel
    if (seen.has(label)) continue
    seen.add(label)
    const why = atBus
      ? 'No zebra, footpath gap, 4 pedestrian incidents (synthetic)'
      : kindLabel === 'Signal junction'
        ? 'Turning conflicts, 6 pedestrian incidents (synthetic)'
        : 'Speed and crossings, 3 incidents (synthetic)'
    zones.push({ id: `zone-${zones.length}`, pos: pk.p, value: pk.value, label, why })
  }

  return { data, path, path2, risk, sStart, egoS, scoutS, script, manoeuvres, zones }
}

/** Ego starts in the kerb lane and moves to lane 2 when the network flags the bus stop ahead. */
export function egoOffset(t: number) {
  return -3.5 + 3.5 * smooth(ramp(t, 17.5, 20.5))
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
let ambient: { s0: number; v: number; lane: number; kind: AgentKind; opposite: boolean }[] | null = null

export function sampleAgents(w: World, t: number): Agent[] {
  const { path, sStart } = w
  if (!ambient) {
    const r = rand(47)
    ambient = []
    const kinds: AgentKind[] = ['car', 'car', 'car', 'auto', 'bike', 'car', 'bike', 'car', 'auto']
    const lanes = [-3.5, 0, 3.5]
    for (let i = 0; i < 46; i++) {
      const opposite = i % 2 === 1 && w.path2 !== null
      ambient.push({ s0: r() * 2000, v: 8 + r() * 5, lane: lanes[i % 3], kind: kinds[i % kinds.length], opposite })
    }
  }
  AGENTS.length = 0
  const put = (id: string, kind: AgentKind, s: number, off: number, connected: boolean, role?: Agent['role'], on: Path = path) => {
    const p = on.at(s, off)
    AGENTS.push({ id, kind, x: p.x, z: p.z, heading: p.heading, connected, role })
  }
  put('ego', 'car', lookup(w.egoS, t), egoOffset(t), true, 'ego')
  put('scout', 'car', lookup(w.scoutS, t), 0, true, 'scout')
  put('bus', 'bus', sStart + BUS_S, -5.2, false)
  const k = ramp(t, PED_T0, PED_T1)
  if (t > PED_T0 - 2 && t < PED_T1 + 3) put('ped', 'ped', sStart + BUS_S + 7.5, -10 + 14 * k, false)
  for (let i = 0; i < 6; i++) put(`cone${i}`, 'cone', sStart + BARRICADE_S - 4 + i * 2.2, -5.4 + i * 0.6, false)
  ambient.forEach((a, i) => {
    const s = a.s0 + a.v * t
    put(`a${i}`, a.kind, s, a.lane, i % 3 === 0, 'ambient', a.opposite && w.path2 ? w.path2 : path)
  })
  return AGENTS
}

/** Connected-car message arcs active at time t: one burst per scripted report from a vehicle. */
export function arcsAt(w: World, t: number): { from: string; to: string; p: number; color: 'confirmed' | 'potential' }[] {
  const bursts: { t: number; from: string; color: 'confirmed' | 'potential' }[] = [
    { t: 6.2, from: 'a3', color: 'potential' },
    { t: 12, from: 'a6', color: 'potential' },
    { t: 18, from: 'a9', color: 'confirmed' },
    { t: 22.3, from: 'scout', color: 'confirmed' },
    { t: 22.9, from: 'a12', color: 'confirmed' },
  ]
  void w
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
