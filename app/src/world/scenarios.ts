// The scenarios the prototype can play. Each is one 48 s loop on a real Powai road from the OSM
// extract: where your car starts, how it drives, what is on the road, and what every sensor
// reports when. All positions are metres along the route from where your car starts (s) and
// metres across it (offset: negative toward the kerb, where traffic keeps left).
import type { HazardKind } from '../engine/types'
import type { TimeOfDay } from './atmos'
import type { V2 } from './corridor'

export type ScenarioId = 'jvlr-night' | 'asm-monsoon' | 'orchard-school' | 'jvlr-cattle' | 'asm-crash'

/** A scripted sensor report, timed in seconds into the loop (negative = before the loop). */
export interface ScriptObs {
  at: number
  key: string
  kind: HazardKind
  polarity?: 1 | -1
  resolve?: boolean
  source: 'vision' | 'cctv' | 'imu' | 'swerve' | 'citizen' | 'history' | 'operator' | 'driver-monitor'
  sourceId: string
  pos: V2
  conf: number
  reputation?: number
  who: string
  how: string
  note?: string
}
export interface ScriptManoeuvre {
  at: number
  key: string
  vehicleId: string
  pos: V2
  type: 'swerve' | 'harsh-brake'
}

/** Someone crossing the road: from one offset to another between t0 and t1. */
export interface Crossing {
  s: number
  t0: number
  t1: number
  from: number
  to: number
  height?: number // metres; children are shorter
  shirt?: string
}

export interface Marks {
  bus?: { s: number; off: number; paint?: string } // a stopped bus
  barricade?: number
  pothole?: number
  debris?: number
  water?: { s0: number; s1: number; off0: number; off1: number } // standing water on the road
  manhole?: { s: number; off: number } // an open manhole
  stalled?: { s: number; off: number; paint?: string }[] // stopped cars with hazard lights
  cattle?: { s: number; off0: number; off1: number; t0: number; t1: number; lying?: boolean }[]
  wrongWay?: { s0: number; t0: number; speed: number; off: number } // a rider against the traffic
  speedBreaker?: number
  crossings: Crossing[]
}

/** A camera move for film mode, in terms of the scenario's own places. */
export type Cam =
  | { type: 'establish' }
  | { type: 'orbit'; s: number; off?: number; r?: [number, number]; h?: [number, number] }
  | { type: 'crane'; s: number; off?: number }
  | { type: 'chase' }
  | { type: 'top'; s?: number }
  | { type: 'pullout' }

export interface ShotDef {
  from: number
  to: number
  title: string
  subs: [number, string][]
  cam: Cam
}

export interface ScriptCtx {
  /** world position of a place on the route, with optional random jitter */
  at: (s: number, off: number, jitter?: number) => V2
  /** a crossing's position at time t */
  crossingAt: (c: Crossing, t: number) => V2
  add: (o: ScriptObs) => void
  swerve: (at: number, vehicleId: string, s: number, off: number) => void
  brake: (at: number, vehicleId: string, s: number, off: number) => void
}

export interface ScenarioDef {
  id: ScenarioId
  title: string
  short: string
  road: string
  time: TimeOfDay
  rain: boolean
  summary: string
  hazards: string[]
  route: RegExp
  /** where your car starts, metres along the route */
  start: (length: number) => number
  egoSpeed: (t: number) => number
  egoLane: (t: number) => number
  scout: { gap: number; speed: (t: number) => number; lane: number }
  /** the place the views centre on, metres from the start */
  focus: number
  marks: Marks
  /** lane advice on the windshield */
  advice: { t0: number; t1: number; text: string; toward: 'right' | 'left' }[]
  script: (ctx: ScriptCtx) => void
  beats: [number, string][]
  shots: ShotDef[]
  /** extra predicted-risk hot spots: [s, offset, amplitude, sigma] */
  risk: [number, number, number, number][]
  /** background traffic: lanes with us, lanes coming the other way (on the reversed route) */
  traffic: { lanes: number[]; oncoming?: number[]; count?: number; blocks?: { s: number; lane: number; until: number }[] }
  /** lane paint: dashed dividers and solid edge lines, as offsets */
  paint?: { dashes: number[]; edges: number[] }
}

const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))
const smooth = (x: number) => x * x * (3 - 2 * x)
const DAY = 86_400
const MIN = 60
const H = 3600
const base = (kind: HazardKind) => ({ kind, polarity: 1 as const })

export const EGO_PLATE = 'MH-02 EV 4471'
export const SCOUT_PLATE = 'MH-03 AK 5530'

// ---------------------------------------------------------------------------------------------
// 1. Night on JVLR: the original story.
// ---------------------------------------------------------------------------------------------
const JVLR = /Jogeshwari-Vikhroli Link Road|Jogeshwari-Vikhroli Link Turnpike/
const N = { bus: 300, barricade: 430, pothole: 130, debris: 215, ped: { s: 307.5, t0: 21, t1: 31.5, from: -10, to: 4 } }

const jvlrNight: ScenarioDef = {
  id: 'jvlr-night',
  title: 'Night on JVLR: someone behind the bus',
  short: 'Night, JVLR',
  road: 'Jogeshwari-Vikhroli Link Road',
  time: 'night',
  rain: false,
  summary: 'A pedestrian steps out from behind a stopped bus. The car ahead sees them first; a barricade nobody mapped, a known pothole and a fallen branch cleared by passing cars complete the night.',
  hazards: ['Pedestrian behind a bus', 'Unmapped barricade', 'Pothole', 'Debris cleared by passers'],
  route: JVLR,
  start: (L) => Math.max(40, Math.min(L * 0.12, L - 620)),
  egoSpeed: (t) => 11 - 6.5 * smooth(ramp(t, 21, 25)) + 6.5 * smooth(ramp(t, 32, 36)),
  egoLane: (t) => -3.5 + 3.5 * smooth(ramp(t, 17.5, 20.5)),
  scout: { gap: 72, speed: (t) => 11 - 8 * smooth(ramp(t, 22.2, 23.4)) + 8 * smooth(ramp(t, 25.5, 28)), lane: 0 },
  focus: N.bus,
  marks: { bus: { s: N.bus, off: -5.2 }, barricade: N.barricade, pothole: N.pothole, debris: N.debris, crossings: [N.ped] },
  advice: [{ t0: 16.5, t1: 21, text: 'Bus stopped in lane 1 ahead. Move to lane 2.', toward: 'right' }],
  script: ({ at, add, swerve, crossingAt }) => {
    // Pothole: known for days. Two cars' accelerometers, one dashcam, one resident.
    add({ ...base('pothole'), key: 'pothole-imu-1', at: -3 * DAY, source: 'imu', sourceId: 'MH-01 CX 2210', pos: at(N.pothole, 0, 2), conf: 0.82, who: 'MH-01 CX 2210', how: 'IMU spike, 7.4 m/s²', note: '1.2 m wide' })
    add({ ...base('pothole'), key: 'pothole-imu-2', at: -2.6 * DAY, source: 'imu', sourceId: 'MH-04 JD 0918', pos: at(N.pothole, 0.4, 2), conf: 0.76, who: 'MH-04 JD 0918', how: 'IMU spike, 6.1 m/s²' })
    add({ ...base('pothole'), key: 'pothole-vision', at: -2 * DAY, source: 'vision', sourceId: SCOUT_PLATE, pos: at(N.pothole, 0, 1.5), conf: 0.91, who: `${SCOUT_PLATE} dashcam`, how: 'Road-damage detector, 0.91', note: '1.2 m wide' })
    add({ ...base('pothole'), key: 'pothole-citizen', at: -1 * DAY, source: 'citizen', sourceId: 'resident-ward-s-14', reputation: 0.85, pos: at(N.pothole, -0.5, 3), conf: 0.9, who: 'Resident, ward S', how: 'Photo and location' })
    // Barricade: put up tonight, on no map. A resident reports it; cars start swerving; a dashcam names it.
    add({ ...base('barricade'), key: 'barricade-citizen', at: 6, source: 'citizen', sourceId: 'resident-ward-s-77', reputation: 0.6, pos: at(N.barricade, -3.5, 4), conf: 0.9, who: 'Resident, ward S', how: 'Photo, first report from this account' })
    add({ ...base('barricade'), key: 'barricade-vision', at: 18, source: 'vision', sourceId: 'MH-47 BT 6602', pos: at(N.barricade, -3.6, 1), conf: 0.78, who: 'MH-47 BT 6602 dashcam', how: 'Open-vocabulary detector: "barricade"' })
    // Debris: a fallen branch reported this evening, since dragged off the road. Cars that pass the
    // spot with their cameras on and see an empty lane quietly vote it away (pass-by verification).
    add({ ...base('debris'), key: 'debris-vision-1', at: -50 * MIN, source: 'vision', sourceId: 'MH-01 DB 4410', pos: at(N.debris, 0, 1.5), conf: 0.9, who: 'MH-01 DB 4410 dashcam', how: 'Open-vocabulary detector: "fallen branch", 0.90', note: 'fallen branch' })
    add({ ...base('debris'), key: 'debris-citizen', at: -45 * MIN, source: 'citizen', sourceId: 'resident-ward-s-31', reputation: 0.85, pos: at(N.debris, 0.6, 3), conf: 0.9, who: 'Resident, ward S', how: 'Photo and location', note: 'fallen branch' })
    add({ ...base('debris'), key: 'debris-vision-2', at: -30 * MIN, source: 'vision', sourceId: 'MH-04 RN 7781', pos: at(N.debris, -0.4, 1.5), conf: 0.88, who: 'MH-04 RN 7781 dashcam', how: 'Open-vocabulary detector: "fallen branch", 0.88' })
    for (const [t, plate] of [[4.5, 'MH-02 FF 1187'], [8.5, 'MH-43 ZR 0045'], [12.5, 'MH-01 QA 3391']] as const) {
      add({ kind: 'debris', polarity: -1, key: `debris-clear-${t}`, at: t, source: 'vision', sourceId: plate, pos: at(N.debris, 0, 1), conf: 0.9, who: `${plate} dashcam`, how: 'Passed the spot, lane clear' })
    }
    for (const [t, v, ds] of [[10.5, 'MH-02 FF 1187', -6], [11.2, 'MH-03 KL 7720', -4], [12.0, 'MH-01 QA 3391', -7], [13.4, 'MH-43 ZR 0045', -5], [14.1, 'MH-02 PM 8852', -3]] as const) {
      swerve(t, v, N.barricade + ds, -3.2)
    }
    // Pedestrian behind the bus: the car ahead sees them, an oncoming car agrees, and once the bus
    // no longer hides them your own camera sees them too.
    for (const t of [22.3, 22.8, 23.3, 23.8, 24.3]) add({ ...base('pedestrian'), key: `ped-scout-${t}`, at: t, source: 'vision', sourceId: SCOUT_PLATE, pos: crossingAt(N.ped, t), conf: 0.88, who: `Car ahead, ${SCOUT_PLATE}`, how: 'Dashcam vision, 0.88', note: 'from the left' })
    for (const t of [22.9, 23.5]) add({ ...base('pedestrian'), key: `ped-oncoming-${t}`, at: t, source: 'vision', sourceId: 'MH-02 RT 3017', pos: crossingAt(N.ped, t), conf: 0.81, who: 'Oncoming car, MH-02 RT 3017', how: 'Dashcam vision, 0.81', note: 'from the left' })
    for (let t = 27.5; t <= 31.01; t += 0.5) add({ ...base('pedestrian'), key: `ped-ego-${t}`, at: t, source: 'vision', sourceId: EGO_PLATE, pos: crossingAt(N.ped, t), conf: 0.95, who: 'Your car', how: 'Dashcam vision, 0.95', note: 'from the left' })
  },
  beats: [
    [4.5, 'A passing car sees the branch gone'],
    [6, 'Resident reports a barricade'],
    [8.5, 'Passing cars clear the fallen branch'],
    [12, 'Cars swerve at the barricade'],
    [18, 'Dashcam confirms the barricade'],
    [22.3, 'Car ahead sees the pedestrian'],
    [27.5, 'Your camera sees the pedestrian'],
    [40, 'Pedestrian clears'],
  ],
  shots: [
    { from: 0, to: 4, title: 'Powai, tonight', subs: [[0, 'A live twin of the corridor from IIT Bombay to Hiranandani']], cam: { type: 'establish' } },
    { from: 4, to: 10, title: 'A fallen branch, reported an hour ago', subs: [[4, 'Two dashcams and a resident reported it this evening'], [6, 'Cars that pass with cameras on see an empty lane and vote it away']], cam: { type: 'orbit', s: N.debris } },
    { from: 10, to: 19.5, title: 'A barricade on no map', subs: [[10, 'A resident reported it at second 6. Now cars start to swerve'], [15, 'Five swerves in one spot are evidence too'], [18, 'A dashcam names it. Two kinds of source: confirmed']], cam: { type: 'crane', s: N.barricade, off: -3.5 } },
    { from: 19.5, to: 31, title: 'Someone behind the bus', subs: [[19.5, 'Your car, on the corridor'], [22.3, 'The car ahead sees a pedestrian your driver cannot'], [24.5, 'The warning reaches your car while the bus still hides them'], [27.5, 'Now your own camera sees them. The warning was already there']], cam: { type: 'chase' } },
    { from: 31, to: 40, title: 'One picture of the road', subs: [[31, 'Every connected car nearby shares the same picture'], [36, 'Built from dashcams, phones, city cameras and swerves']], cam: { type: 'top' } },
    { from: 40, to: 48, title: 'SuRaksha Mesh', subs: [[40, 'Every car a sensor, every sensor shared']], cam: { type: 'pullout' } },
  ],
  risk: [[N.bus + 4, -6, 0.7, 30]],
  traffic: { lanes: [-3.5, 0, 3.5] },
}

// ---------------------------------------------------------------------------------------------
// 2. Monsoon evening on Adi Shankaracharya Marg: water hides an open manhole.
// ---------------------------------------------------------------------------------------------
const ASM = /Adi Sankaracharya Marg/
const M = { water: { s0: 196, s1: 246, off0: -8.5, off1: 0.5 }, stalled: 214, manhole: 238 }

const asmMonsoon: ScenarioDef = {
  id: 'asm-monsoon',
  title: 'Monsoon on Adi Shankaracharya Marg: water hides an open manhole',
  short: 'Monsoon, Adi Shankaracharya Marg',
  road: 'Adi Shankaracharya Marg, by Powai Hospital',
  time: 'dusk',
  rain: true,
  summary: 'Knee-deep water by Powai Hospital. A car has stalled in it, and somewhere under the water a manhole has lost its lid. Phones, dashcams and one wheel that dropped into it find it before you get there.',
  hazards: ['Waterlogging', 'Car stalled in water', 'Open manhole under water'],
  route: ASM,
  start: () => 40,
  egoSpeed: (t) => 8.5 - 5.5 * smooth(ramp(t, 17, 21)) + 5 * smooth(ramp(t, 35, 39)),
  egoLane: (t) => -3.5 + 3.5 * smooth(ramp(t, 25.5, 28.5)),
  scout: { gap: 78, speed: (t) => 8 - 3 * smooth(ramp(t, 12, 15)) + 3 * smooth(ramp(t, 26, 29)), lane: -3.5 },
  focus: 240,
  marks: { water: M.water, stalled: [{ s: M.stalled, off: -5.4, paint: '#c9c4b8' }], manhole: { s: M.manhole, off: -3.2 }, crossings: [] },
  advice: [
    { t0: 17, t1: 23, text: 'Standing water ahead, about 40 cm. Slow to 10 km/h.', toward: 'right' },
    { t0: 25, t1: 30, text: 'Open manhole reported in lane 1. Keep to lane 2.', toward: 'right' },
  ],
  script: ({ at, add, swerve, brake }) => {
    const w = (M.water.s0 + M.water.s1) / 2
    add({ ...base('waterlogging'), key: 'water-citizen', at: -40 * MIN, source: 'citizen', sourceId: 'resident-ward-l-08', reputation: 0.8, pos: at(w, -4, 6), conf: 0.9, who: 'Resident, ward L', how: 'Photo: knee-deep water outside Powai Hospital', note: 'about 40 cm' })
    add({ ...base('waterlogging'), key: 'water-imu', at: 3, source: 'imu', sourceId: 'MH-03 PQ 1840', pos: at(w - 8, -3.5, 3), conf: 0.74, who: 'MH-03 PQ 1840', how: 'Wheel slip and drag, aquaplaning signature' })
    add({ ...base('waterlogging'), key: 'water-vision', at: 7, source: 'vision', sourceId: 'MH-02 LK 7319', pos: at(w, -3, 3), conf: 0.82, who: 'MH-02 LK 7319 dashcam', how: 'Road-surface model: waterlogging, 0.82', note: 'about 40 cm' })
    brake(4.2, 'MH-03 PQ 1840', w - 18, -3.5)
    brake(5.1, 'MH-02 LK 7319', w - 16, 0)
    // a car that stalled in the water, hazard lights on
    add({ ...base('stalled-vehicle'), key: 'stalled-vision', at: 11, source: 'vision', sourceId: SCOUT_PLATE, pos: at(M.stalled, -5.4, 1), conf: 0.86, who: `Car ahead, ${SCOUT_PLATE}`, how: 'Detector: car, stopped, hazard lights', note: 'in the water, kerb lane' })
    add({ ...base('stalled-vehicle'), key: 'stalled-citizen', at: 14, source: 'citizen', sourceId: 'resident-ward-l-22', reputation: 0.75, pos: at(M.stalled, -5, 3), conf: 0.85, who: 'Resident, ward L', how: 'Photo: car stuck in water' })
    for (const [t, v] of [[9.5, 'MH-01 BV 6621'], [10.4, 'MH-04 GH 0034'], [12.8, 'MH-02 UX 9182']] as const) swerve(t, v, M.stalled - 4, -4)
    // the manhole: a resident says the lid is gone; the car ahead finds it with a wheel
    add({ ...base('manhole'), key: 'manhole-citizen', at: 18, source: 'citizen', sourceId: 'resident-ward-l-41', reputation: 0.7, pos: at(M.manhole, -3.2, 2), conf: 0.9, who: 'Resident, ward L', how: 'Report: lid missing, now under water', note: 'lid missing' })
    add({ ...base('manhole'), key: 'manhole-imu', at: 24, source: 'imu', sourceId: SCOUT_PLATE, pos: at(M.manhole, -3.2, 1), conf: 0.88, who: `Car ahead, ${SCOUT_PLATE}`, how: 'IMU: front-left wheel drop, 9.1 m/s²', note: 'lid missing' })
    add({ ...base('manhole'), key: 'manhole-imu-2', at: 26, source: 'imu', sourceId: 'MH-04 ZA 3307', pos: at(M.manhole, -3.4, 1), conf: 0.86, who: 'MH-04 ZA 3307', how: 'IMU: front-left wheel drop, 8.4 m/s²', note: 'lid missing' })
  },
  beats: [
    [3, 'A car slips in standing water'],
    [7, 'A dashcam confirms the waterlogging'],
    [11, 'The car ahead sees a car stalled in the water'],
    [18, 'A resident reports a missing manhole lid'],
    [24, 'The car ahead drops a wheel into it'],
    [26, 'A second car hits it: confirmed'],
  ],
  shots: [
    { from: 0, to: 4, title: 'Powai, monsoon evening', subs: [[0, 'Adi Shankaracharya Marg, past Powai Hospital']], cam: { type: 'establish' } },
    { from: 4, to: 11, title: 'Knee-deep water by the hospital', subs: [[4, 'A resident sent a photo 40 minutes ago'], [7, 'A wheel slips, then a dashcam names it: confirmed']], cam: { type: 'orbit', s: 221, off: -4, r: [80, 52], h: [70, 38] } },
    { from: 11, to: 18, title: 'A car stalled in the water', subs: [[11, 'The car ahead sees it stopped, hazard lights on'], [13, 'Cars swerve round it']], cam: { type: 'orbit', s: M.stalled, off: -5.4, r: [46, 30], h: [34, 18] } },
    { from: 18, to: 27, title: 'Somewhere under the water, an open manhole', subs: [[18, 'A resident reports the lid missing'], [24, 'The car ahead drops a wheel into it'], [26, 'A second car hits it too. Confirmed']], cam: { type: 'crane', s: M.manhole, off: -3.2 } },
    { from: 27, to: 38, title: 'Your car keeps out of lane 1', subs: [[27, 'The warning arrived before the water hid the danger'], [32, 'Slow through the water, away from the manhole']], cam: { type: 'chase' } },
    { from: 38, to: 44, title: 'One picture of a flooded road', subs: [[38, 'Every car approaching gets it, by lane']], cam: { type: 'top', s: 230 } },
    { from: 44, to: 48, title: 'SuRaksha Mesh', subs: [[44, 'Every car a sensor, every sensor shared']], cam: { type: 'pullout' } },
  ],
  risk: [[221, -4, 0.8, 40]],
  traffic: { lanes: [-3.5, 0, 3.5] },
}

// ---------------------------------------------------------------------------------------------
// 3. School morning on Orchard Avenue, Hiranandani: children behind a school bus.
// ---------------------------------------------------------------------------------------------
const ORCH = /Orchard Avenue/
const S = { van: 110, breaker: 160, bus: 250 }
const kids: Crossing[] = [
  { s: S.bus + 9, t0: 21, t1: 28, from: -6, to: 6.5, height: 1.22, shirt: '#f1efe8' },
  { s: S.bus + 10.4, t0: 21.6, t1: 28.8, from: -6.3, to: 6.5, height: 1.32, shirt: '#2f5d8c' },
  { s: S.bus + 8.2, t0: 22.3, t1: 29.4, from: -5.9, to: 6.5, height: 1.16, shirt: '#f1efe8' },
]

const orchardSchool: ScenarioDef = {
  id: 'orchard-school',
  title: 'School morning in Hiranandani: children behind the school bus',
  short: 'School morning, Hiranandani',
  road: 'Orchard Avenue, Hiranandani Gardens',
  time: 'day',
  rain: false,
  summary: 'A van double-parked in the kerb lane, a speed breaker nobody painted, and three children crossing from behind a stopped school bus. The car ahead sees them; your car slows to school-zone speed before you can.',
  hazards: ['Children behind a school bus', 'Double-parked van', 'Unpainted speed breaker'],
  route: ORCH,
  start: () => 60,
  // slow over the speed breaker, stop well behind the school bus, wait, then pass it
  egoSpeed: (t) =>
    10 - 3 * (smooth(ramp(t, 14.6, 15.6)) - smooth(ramp(t, 16.6, 17.6))) - 10 * smooth(ramp(t, 18, 23.5)) + 6 * smooth(ramp(t, 30.5, 33)) + 3 * smooth(ramp(t, 35, 38)),
  egoLane: (t) => -2 + 2.8 * smooth(ramp(t, 6, 8.5)) - 2.8 * smooth(ramp(t, 12.5, 14.5)) + 2.8 * smooth(ramp(t, 31, 33)) - 2.8 * smooth(ramp(t, 42, 44)),
  scout: { gap: 70, speed: (t) => 9 - 7 * smooth(ramp(t, 20.5, 22)) + 6 * smooth(ramp(t, 29, 32)), lane: 0.8 },
  focus: S.bus,
  marks: { bus: { s: S.bus, off: -2.6, paint: '#f2b705' }, stalled: [{ s: S.van, off: -2.6, paint: '#e8e6df' }], speedBreaker: S.breaker, crossings: kids },
  advice: [
    { t0: 5, t1: 9, text: 'Van double-parked ahead. Pass with care.', toward: 'right' },
    { t0: 20, t1: 29, text: 'Children crossing behind the school bus. Stop and wait.', toward: 'left' },
  ],
  script: ({ at, add, swerve, crossingAt }) => {
    // the speed breaker: felt for days, never painted
    for (const [t, v, g] of [[-2 * DAY, 'MH-02 TT 4410', 8.2], [-1 * DAY, 'MH-04 CB 2290', 7.6], [-3 * H, 'MH-01 NA 1185', 8.8]] as const) {
      add({ ...base('speed-breaker'), key: `breaker-${v}`, at: t, source: 'imu', sourceId: v, pos: at(S.breaker, 0, 2), conf: 0.8, who: v, how: `IMU: vertical jolt ${g} m/s², both axles`, note: 'unpainted' })
    }
    add({ ...base('speed-breaker'), key: 'breaker-vision', at: -40 * MIN, source: 'vision', sourceId: 'MH-02 YN 6021', pos: at(S.breaker, 0, 1), conf: 0.78, who: 'MH-02 YN 6021 dashcam', how: 'Road-surface model: hump, no markings', note: 'unpainted' })
    // the van: cars swerve, then a dashcam names it
    for (const [t, v] of [[3.5, 'MH-02 JK 5512'], [4.4, 'MH-43 PL 0921'], [5.6, 'MH-01 SD 3377']] as const) swerve(t, v, S.van - 4, -2)
    add({ ...base('stalled-vehicle'), key: 'van-vision', at: 6.5, source: 'vision', sourceId: 'MH-43 PL 0921', pos: at(S.van, -2.6, 1), conf: 0.84, who: 'MH-43 PL 0921 dashcam', how: 'Detector: van, stopped in lane, no driver', note: 'double-parked' })
    add({ ...base('stalled-vehicle'), key: 'van-citizen', at: 8.5, source: 'citizen', sourceId: 'resident-ward-s-52', reputation: 0.8, pos: at(S.van, -2.6, 2), conf: 0.9, who: 'Resident, Hiranandani', how: 'Photo: van parked in the lane outside the school', note: 'double-parked' })
    // the children: the school's crossing app, then the car ahead, then your camera
    add({ ...base('pedestrian'), key: 'kids-guard', at: 20.8, source: 'citizen', sourceId: 'school-guard-hg', reputation: 0.9, pos: crossingAt(kids[0], 21.5), conf: 0.9, who: 'School crossing guard app', how: 'Tapped: children crossing now', note: 'children' })
    for (const t of [21.6, 22.2, 22.8, 23.4]) add({ ...base('pedestrian'), key: `kids-scout-${t}`, at: t, source: 'vision', sourceId: SCOUT_PLATE, pos: crossingAt(kids[1], t), conf: 0.9, who: `Car ahead, ${SCOUT_PLATE}`, how: 'Dashcam vision: 3 people, child height', note: 'children' })
    for (let t = 26; t <= 29.5; t += 0.5) add({ ...base('pedestrian'), key: `kids-ego-${t}`, at: t, source: 'vision', sourceId: EGO_PLATE, pos: crossingAt(kids[1], t), conf: 0.95, who: 'Your car', how: 'Dashcam vision, 0.95', note: 'children' })
  },
  beats: [
    [3.5, 'Cars swerve round a double-parked van'],
    [6.5, 'A dashcam names the van'],
    [8.5, 'A resident sends a photo: confirmed'],
    [20.8, 'The crossing guard taps "children crossing"'],
    [21.6, 'The car ahead sees children behind the bus'],
    [26, 'Your camera sees them too'],
  ],
  shots: [
    { from: 0, to: 4, title: 'Hiranandani, 8 in the morning', subs: [[0, 'Orchard Avenue, school run']], cam: { type: 'establish' } },
    { from: 4, to: 12, title: 'A van double-parked in the kerb lane', subs: [[4, 'Three cars swerve round it'], [6.5, 'A dashcam names it: stopped, no driver']], cam: { type: 'orbit', s: S.van, off: -2, r: [60, 36], h: [26, 12] } },
    { from: 12, to: 20, title: 'A speed breaker nobody painted', subs: [[12, 'Three cars have jolted over it in two days'], [16, 'Then a dashcam sees the hump. Confirmed before you reach it']], cam: { type: 'crane', s: S.breaker, off: 0 } },
    { from: 20, to: 31, title: 'Children behind the school bus', subs: [[20, 'Your car, approaching the school stop'], [20.8, 'The crossing guard taps "children crossing"'], [21.6, 'The car ahead sees three children your driver cannot'], [26, 'Your car has already stopped, well back']], cam: { type: 'chase' } },
    { from: 31, to: 42, title: 'One picture of the school run', subs: [[31, 'Every car near the school gets it'], [36, 'From phones, dashcams, a guard and a bump in the road']], cam: { type: 'top', s: S.bus } },
    { from: 42, to: 48, title: 'SuRaksha Mesh', subs: [[42, 'Every car a sensor, every sensor shared']], cam: { type: 'pullout' } },
  ],
  risk: [[S.bus + 9, -4, 0.75, 32]],
  traffic: { lanes: [-2], oncoming: [-2], count: 26 },
  paint: { dashes: [0], edges: [-3.6, 3.6] },
}

// ---------------------------------------------------------------------------------------------
// 4. Late night on JVLR: cattle in the lane, a rider against the traffic.
// ---------------------------------------------------------------------------------------------
const C = { cattle: 330, rider: 520 }
const jvlrCattle: ScenarioDef = {
  id: 'jvlr-cattle',
  title: 'Late night on JVLR: cattle in the lane, a rider against the traffic',
  short: 'Late night, JVLR east',
  road: 'Jogeshwari-Vikhroli Link Road, eastern stretch',
  time: 'night',
  rain: false,
  summary: 'Two cows have wandered off the grass median into lane 3, unlit, past midnight. A motorcycle rides against the traffic in the kerb lane. Swerves, the car ahead and a city camera find both; your car settles into lane 2, between them, before its headlights reach either.',
  hazards: ['Cattle on the carriageway', 'Wrong-way motorcycle'],
  route: JVLR,
  start: () => 640,
  egoSpeed: (t) => 13 - 6 * smooth(ramp(t, 16, 20)) + 5 * smooth(ramp(t, 27, 31)),
  egoLane: (t) => -3.5 + 3.5 * smooth(ramp(t, 13, 16)) - 3.5 * smooth(ramp(t, 38, 41)),
  scout: { gap: 90, speed: (t) => 13 - 6 * smooth(ramp(t, 9, 11)) + 6 * smooth(ramp(t, 14, 16)), lane: 0 },
  focus: C.cattle,
  marks: {
    cattle: [
      { s: C.cattle, off0: 3.6, off1: 3.6, t0: 0, t1: 48, lying: true },
      { s: C.cattle + 6, off0: 7.6, off1: 4.2, t0: 4, t1: 44 },
    ],
    wrongWay: { s0: C.rider, t0: 6, speed: 9, off: -5.6 },
    crossings: [],
  },
  advice: [
    { t0: 12, t1: 17, text: 'Motorcycle coming the wrong way in the kerb lane. Move to lane 2.', toward: 'right' },
    { t0: 20, t1: 27, text: 'Cattle in lane 3 ahead. Stay in lane 2.', toward: 'left' },
  ],
  script: ({ at, add, swerve }) => {
    add({ ...base('animal'), key: 'cattle-citizen', at: 3, source: 'citizen', sourceId: 'resident-ward-s-90', reputation: 0.7, pos: at(C.cattle + 4, 5, 6), conf: 0.85, who: 'Resident, ward S', how: 'Report: cows on JVLR near the median', note: '2 cows' })
    for (const [t, v] of [[5.5, 'MH-02 DY 3381'], [6.4, 'MH-46 AR 1290'], [7.9, 'MH-01 WE 7745']] as const) swerve(t, v, C.cattle - 4, 3.5)
    add({ ...base('animal'), key: 'cattle-scout-1', at: 9.5, source: 'vision', sourceId: SCOUT_PLATE, pos: at(C.cattle, 3.6, 1), conf: 0.87, who: `Car ahead, ${SCOUT_PLATE}`, how: 'Detector: cow, 2, on the carriageway', note: '2 cows' })
    add({ ...base('animal'), key: 'cattle-oncoming', at: 11.2, source: 'vision', sourceId: 'MH-02 RT 3017', pos: at(C.cattle + 2, 4.2, 1.5), conf: 0.83, who: 'Oncoming car, MH-02 RT 3017', how: 'Detector: cow, 0.83', note: '2 cows' })
    add({ ...base('animal'), key: 'cattle-scout-2', at: 10.5, source: 'vision', sourceId: SCOUT_PLATE, pos: at(C.cattle + 3, 4.4, 1), conf: 0.9, who: `Car ahead, ${SCOUT_PLATE}`, how: 'Detector: cow, 0.90', note: '2 cows' })
    // the rider, seen where they are at each moment: s falls as they ride toward us
    const riderS = (t: number) => C.rider - 9 * (t - 6)
    for (const t of [14, 15.5, 17]) add({ ...base('erratic-vehicle'), key: `rider-scout-${t}`, at: t, source: 'vision', sourceId: SCOUT_PLATE, pos: at(riderS(t), -5.6, 1), conf: 0.84, who: `Car ahead, ${SCOUT_PLATE}`, how: 'Tracker: motorcycle, closing against traffic', note: 'wrong way' })
    for (const [t, v] of [[16.2, 'MH-03 FG 8820'], [17.4, 'MH-02 KM 4402']] as const) swerve(t, v, riderS(t) + 4, -4.5)
    add({ ...base('erratic-vehicle'), key: 'rider-cctv', at: 18.5, source: 'cctv', sourceId: 'cam-jvlr-14', pos: at(riderS(18.5), -5.6, 2), conf: 0.8, who: 'City camera JVLR-14', how: 'Wrong-way detection', note: 'wrong way' })
  },
  beats: [
    [3, 'A resident reports cows by the median'],
    [5.5, 'Cars swerve at something in lane 3'],
    [9.5, 'The car ahead sees two cows'],
    [11.2, 'An oncoming car agrees: confirmed'],
    [14, 'The car ahead sees a rider against the traffic'],
    [18.5, 'A city camera confirms the wrong-way rider'],
    [29, 'The rider passes on your left, the cows on your right'],
  ],
  shots: [
    { from: 0, to: 4, title: 'JVLR, past midnight', subs: [[0, 'The eastern stretch, toward the Eastern Express Highway']], cam: { type: 'establish' } },
    { from: 4, to: 12, title: 'Two cows off the median', subs: [[5.5, 'Three cars swerve at the same spot in lane 3'], [9.5, 'The car ahead names it: two cows, unlit']], cam: { type: 'orbit', s: C.cattle, off: 4, r: [55, 30], h: [22, 9] } },
    { from: 12, to: 20, title: 'A rider against the traffic', subs: [[14, 'The car ahead tracks a motorcycle closing the wrong way'], [18.5, 'A city camera agrees']], cam: { type: 'crane', s: 430, off: -5.6 } },
    { from: 20, to: 34, title: 'Your car takes lane 2, between them', subs: [[20, 'Before its headlights reach either'], [29, 'The rider passes on your left, the cows on your right']], cam: { type: 'chase' } },
    { from: 34, to: 42, title: 'One picture of the night road', subs: [[34, 'Every car on JVLR tonight gets it']], cam: { type: 'top', s: C.cattle + 80 } },
    { from: 42, to: 48, title: 'SuRaksha Mesh', subs: [[42, 'Every car a sensor, every sensor shared']], cam: { type: 'pullout' } },
  ],
  risk: [[C.cattle, 4, 0.6, 40]],
  traffic: { lanes: [-3.5, 0, 3.5] },
}

// ---------------------------------------------------------------------------------------------
// 5. Morning rush on Adi Shankaracharya Marg: a crash ahead, cleared by the city.
// ---------------------------------------------------------------------------------------------
const K = { crash: 300 }
const asmCrash: ScenarioDef = {
  id: 'asm-crash',
  title: 'Morning rush on Adi Shankaracharya Marg: a crash ahead',
  short: 'Crash ahead, Adi Shankaracharya Marg',
  road: 'Adi Shankaracharya Marg, northbound',
  time: 'day',
  rain: false,
  summary: 'Two cars collide in lane 2 at rush hour. A wall of harsh braking is the first sign; dashcams name the crash and the glass on the road; traffic police close the lane and the tow truck clears it, all on the same picture.',
  hazards: ['Crash in lane 2', 'Debris on the road', 'Lane closed, then cleared'],
  route: ASM,
  start: () => 760,
  egoSpeed: (t) => 12 - 7 * smooth(ramp(t, 12, 17)) + 6 * smooth(ramp(t, 33, 38)),
  egoLane: (t) => 0 - 3.5 * smooth(ramp(t, 14, 17)) + 3.5 * smooth(ramp(t, 40, 43)),
  scout: { gap: 80, speed: (t) => 12 - 9 * smooth(ramp(t, 3, 5)) + 5 * smooth(ramp(t, 9, 12)), lane: 0 },
  focus: K.crash,
  marks: {
    stalled: [
      { s: K.crash, off: 0.3, paint: '#8c2f24' },
      { s: K.crash + 6, off: 1.2, paint: '#d6d7d3' },
    ],
    debris: K.crash - 4,
    crossings: [],
  },
  advice: [
    { t0: 12, t1: 18, text: 'Crash in lane 2 ahead. Move to lane 1.', toward: 'left' },
    { t0: 40, t1: 44, text: 'Lane 2 cleared. Traffic back to normal.', toward: 'right' },
  ],
  script: ({ at, add, brake }) => {
    for (const [t, v, ds, off] of [[2.6, 'MH-02 HB 1009', -6, 0], [3.0, 'MH-01 KT 5528', -9, 0], [3.3, 'MH-02 RZ 7719', -12, 0.5], [3.9, 'MH-04 UA 6610', -10, 2.5], [4.4, 'MH-43 MM 2081', -13, -1.5]] as const) brake(t, v, K.crash + ds, off)
    add({ ...base('stalled-vehicle'), key: 'crash-vision-1', at: 5.5, source: 'vision', sourceId: 'MH-02 HB 1009', pos: at(K.crash + 3, 0.8, 1), conf: 0.9, who: 'MH-02 HB 1009 dashcam', how: 'Detector: 2 cars stopped across lane 2, hazard lights', note: 'collision' })
    add({ ...base('debris'), key: 'crash-debris', at: 6.5, source: 'vision', sourceId: 'MH-01 KT 5528', pos: at(K.crash - 4, 0.5, 1), conf: 0.83, who: 'MH-01 KT 5528 dashcam', how: 'Open-vocabulary detector: "broken glass, bumper"', note: 'glass and a bumper' })
    add({ ...base('debris'), key: 'crash-debris-2', at: 7.4, source: 'vision', sourceId: 'MH-04 UA 6610', pos: at(K.crash - 3, 0.2, 1), conf: 0.8, who: 'MH-04 UA 6610 dashcam', how: 'Open-vocabulary detector: "debris on road"', note: 'glass and a bumper' })
    add({ ...base('stalled-vehicle'), key: 'crash-citizen', at: 8, source: 'citizen', sourceId: 'resident-ward-l-63', reputation: 0.8, pos: at(K.crash + 3, 1, 3), conf: 0.9, who: 'Resident, ward L', how: 'Photo: two cars, nobody hurt', note: 'collision' })
    add({ ...base('stalled-vehicle'), key: 'crash-police', at: 21, source: 'operator', sourceId: 'traffic-police-powai', pos: at(K.crash + 3, 0.8, 0.5), conf: 0.97, who: 'Traffic police, Powai', how: 'On scene: lane 2 closed, tow truck called', note: 'lane 2 closed' })
    add({ ...base('stalled-vehicle'), key: 'crash-clear', at: 39, source: 'operator', sourceId: 'traffic-police-powai', resolve: true, pos: at(K.crash + 3, 0.8, 0.5), conf: 0.97, who: 'Traffic police, Powai', how: 'Tow truck cleared lane 2' })
    add({ ...base('debris'), key: 'debris-clear', at: 39.5, source: 'operator', sourceId: 'bmc-ward-l', resolve: true, pos: at(K.crash - 4, 0.5, 0.5), conf: 0.97, who: 'BMC ward L', how: 'Swept' })
  },
  beats: [
    [2.6, 'A wall of harsh braking'],
    [5.5, 'A dashcam names a crash in lane 2'],
    [6.5, 'Glass and a bumper on the road'],
    [21, 'Traffic police close lane 2'],
    [39, 'The tow truck clears it'],
  ],
  shots: [
    { from: 0, to: 4, title: 'Rush hour, Adi Shankaracharya Marg', subs: [[0, 'Northbound, toward the Eastern Express Highway']], cam: { type: 'establish' } },
    { from: 4, to: 12, title: 'Two cars, lane 2', subs: [[4, 'Five cars brake hard within two seconds'], [5.5, 'A dashcam names it. Another sees the glass']], cam: { type: 'orbit', s: K.crash + 3, off: 0.8, r: [60, 32], h: [26, 12] } },
    { from: 12, to: 22, title: 'Your car moves to lane 1', subs: [[12, 'The warning arrives well before the queue'], [18, 'Past the crash at a crawl']], cam: { type: 'chase' } },
    { from: 22, to: 38, title: 'The city closes the lane', subs: [[22, 'Traffic police mark lane 2 closed'], [30, 'Every car approaching is told, by lane']], cam: { type: 'crane', s: K.crash + 3, off: 0.8 } },
    { from: 38, to: 44, title: 'And opens it again', subs: [[39, 'The tow truck clears lane 2: resolved']], cam: { type: 'top', s: K.crash } },
    { from: 44, to: 48, title: 'SuRaksha Mesh', subs: [[44, 'Every car a sensor, every sensor shared']], cam: { type: 'pullout' } },
  ],
  risk: [[K.crash, 0, 0.5, 40]],
  traffic: { lanes: [-3.5, 0, 3.5], blocks: [{ s: K.crash - 3, lane: 0, until: 39 }] },
}

export const SCENARIOS: ScenarioDef[] = [jvlrNight, asmMonsoon, orchardSchool, jvlrCattle, asmCrash]
export const DEFAULT_SCENARIO: ScenarioId = 'jvlr-night'
export function scenarioById(id: string | null | undefined): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id) ?? jvlrNight
}
