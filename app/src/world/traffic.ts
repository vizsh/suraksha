// Traffic signals and background traffic.
// The map has 12 signalised junctions (OSM highway=traffic_signals). Those on JVLR get a stop line
// on each carriageway and a fixed-time cycle; the cycle is offset per junction so that the two
// scripted cars (yours and the car ahead) always meet green: the story's timing never changes.
// Background cars are simulated once per world with a car-following model (IDM): they slow for
// the car in front, stop at red, queue, and pull away on green. Their positions are stored as
// tables, so drawing a frame is a lookup, as for the scripted cars.
import type { Path, V2 } from './corridor'

export const CYCLE = 24 // seconds; divides the 48 s loop, so the loop stays seamless
export const MAIN_GREEN = 13
export const MAIN_AMBER = 3 // then red until the end of the cycle
export const CROSS_FROM = 16.5 // cross-street green after an all-red half second
export const CROSS_AMBER = 23
const STOP_BACK = 9 // stop line, metres before the junction centre
export const DT = 0.05

export type Light = 'green' | 'amber' | 'red'

export interface Junction {
  id: string
  p: V2
  /** arc length of the junction centre on each carriageway, if it is on JVLR */
  sPath: number | null
  sPath2: number | null
  offset: number // seconds added to t before taking the cycle phase
}

export interface AmbientCar {
  kind: 'car' | 'auto' | 'bike'
  lane: number
  opposite: boolean
  s: Float32Array // arc length per DT step over the loop
  brake: Uint8Array // 1 while braking or held at a stop
}

export function phase(j: Junction, t: number) {
  return (((t + j.offset) % CYCLE) + CYCLE) % CYCLE
}

/** Light shown to traffic on JVLR (main) or on the cross street. */
export function lightAt(j: Junction, t: number, approach: 'main' | 'cross'): Light {
  const p = phase(j, t)
  if (approach === 'main') return p < MAIN_GREEN ? 'green' : p < MAIN_GREEN + MAIN_AMBER ? 'amber' : 'red'
  return p >= CROSS_FROM && p < CROSS_AMBER ? 'green' : p >= CROSS_AMBER ? 'amber' : 'red'
}

export function stopLine(s: number) {
  return s - STOP_BACK
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

function crossings(table: Float32Array, s: number) {
  const out: number[] = []
  for (let i = 1; i < table.length; i++) if (table[i - 1] < s && table[i] >= s) out.push(i * DT)
  return out
}

/** OSM tags each signal head as its own node; one junction usually has two to four. */
function cluster(signals: { id: number; p: V2 }[], radius = 45) {
  const groups: { id: number; p: V2; n: number }[] = []
  for (const sg of signals) {
    const g = groups.find((q) => Math.hypot(q.p[0] - sg.p[0], q.p[1] - sg.p[1]) < radius)
    if (g) {
      g.p = [(g.p[0] * g.n + sg.p[0]) / (g.n + 1), (g.p[1] * g.n + sg.p[1]) / (g.n + 1)]
      g.n++
    } else groups.push({ id: sg.id, p: [sg.p[0], sg.p[1]], n: 1 })
  }
  return groups
}

/** Junctions, with cycle offsets chosen so the scripted cars cross JVLR junctions in mid-green. */
export function buildJunctions(signals: { id: number; p: V2 }[], path: Path, path2: Path | null, scripted: Float32Array[]): Junction[] {
  return cluster(signals).map((sg) => {
    const a = path.project(sg.p[0], sg.p[1])
    const b = path2?.project(sg.p[0], sg.p[1])
    const sPath = a.dist < 30 ? a.s : null
    const sPath2 = b && b.dist < 30 ? b.s : null
    const j: Junction = { id: `sig-${sg.id}`, p: sg.p, sPath, sPath2, offset: hash(`sig-${sg.id}`) * CYCLE }
    if (sPath !== null) {
      const times = scripted.flatMap((tab) => crossings(tab, stopLine(sPath)))
      if (times.length) {
        // mid-green: at least 6 s after green starts (queues have pulled away), 1 s before amber
        let best = { off: j.offset, score: -Infinity }
        for (let off = 0; off < CYCLE; off += 0.25) {
          const score = Math.min(...times.map((t) => {
            const p = (((t + off) % CYCLE) + CYCLE) % CYCLE
            return Math.min(p - 6, MAIN_GREEN - 1 - p)
          }))
          if (score > best.score) best = { off, score }
        }
        j.offset = best.off
      }
    }
    return j
  })
}

interface Spec {
  s0: number
  v: number
  lane: number
  kind: AmbientCar['kind']
  opposite: boolean
}

/** Simulate the background traffic for one loop. Scripted cars are leaders the others react to. */
export function simulateTraffic(
  specs: Spec[],
  path: Path,
  path2: Path | null,
  junctions: Junction[],
  scripted: { s: Float32Array; lane: (t: number) => number }[],
  loop: number,
  /** lanes closed by something stopped in them (a crash), until a time in the loop */
  blocks: { s: number; lane: number; until: number }[] = [],
): AmbientCar[] {
  const n = Math.ceil(loop / DT) + 1
  const WARM = 30 // seconds simulated before the loop starts, so queues are already formed
  const cars = specs.map((sp) => ({ ...sp, v0: sp.v, p: sp.opposite && path2 ? path2 : path, s: sp.s0 - sp.v * WARM, v: sp.v }))
  const out: AmbientCar[] = specs.map((sp) => ({ kind: sp.kind, lane: sp.lane, opposite: sp.opposite && !!path2, s: new Float32Array(n), brake: new Uint8Array(n) }))
  const stops = (p: Path) =>
    junctions.flatMap((j) => {
      const s = p === path ? j.sPath : j.sPath2
      return s === null ? [] : [{ j, line: stopLine(s) }]
    })
  const stopsOf = new Map<Path, { j: Junction; line: number }[]>([[path, stops(path)]])
  if (path2) stopsOf.set(path2, stops(path2))

  const ahead = (from: number, to: number, L: number) => (((to - from) % L) + L) % L
  // IDM parameters, tuned for Mumbai arterial traffic
  const A = 1.6
  const B = 3
  const GAP = 2.2
  const HEAD = 1.1
  const LEN = 4.6

  // lanes: cars on the same carriageway within 1.6 m of the same offset follow one another
  const laneKey = (c: (typeof cars)[number]) => `${c.p === path ? 0 : 1}:${Math.round(c.lane)}`
  const lanes = new Map<string, number[]>()
  cars.forEach((c, i) => {
    const k = laneKey(c)
    if (!lanes.has(k)) lanes.set(k, [])
    lanes.get(k)!.push(i)
  })
  const gapOf = new Float64Array(cars.length)
  const vLeadOf = new Float64Array(cars.length)
  const nextV = new Float64Array(cars.length)
  const nextA = new Float64Array(cars.length)

  const steps = Math.round((loop + WARM) / DT)
  for (let k = 0; k <= steps; k++) {
    const t = k * DT - WARM
    const idx = Math.round(t / DT)
    // leader of each car: the next one round its lane, after sorting by position on the loop
    for (const ids of lanes.values()) {
      const L = cars[ids[0]].p.length
      const pos = (i: number) => ((cars[i].s % L) + L) % L
      ids.sort((x, y) => pos(x) - pos(y))
      for (let q = 0; q < ids.length; q++) {
        const i = ids[q]
        if (ids.length < 2) {
          gapOf[i] = Infinity
          continue
        }
        const lead = ids[(q + 1) % ids.length]
        gapOf[i] = ahead(cars[i].s, cars[lead].s, L) - LEN
        vLeadOf[i] = cars[lead].v
      }
    }
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]
      const L = c.p.length
      let gap = gapOf[i]
      let vLead = vLeadOf[i]
      // the scripted cars, which never yield
      if (c.p === path && t >= 0) {
        const step = Math.min(scripted[0].s.length - 2, Math.round(t / DT))
        for (const sc of scripted) {
          if (Math.abs(sc.lane(t) - c.lane) > 1.6) continue
          const sNow = sc.s[step]
          const d = ahead(c.s, sNow, L) - LEN
          if (d < 200 && d < gap) {
            gap = d
            vLead = (sc.s[step + 1] - sNow) / DT
          }
        }
      }
      // a closed lane: queue behind it until it is cleared
      if (c.p === path) {
        for (const b of blocks) {
          if (t >= b.until || Math.abs(b.lane - c.lane) > 1.6) continue
          const d = ahead(c.s, b.s, L) - LEN / 2
          if (d < 400 && d < gap) {
            gap = Math.max(0.1, d)
            vLead = 0
          }
        }
      }
      // red or amber ahead: a stopped car at the stop line, unless too close to stop safely
      for (const st of stopsOf.get(c.p) ?? []) {
        const d = ahead(c.s, st.line, L)
        if (d > 90) continue
        const light = lightAt(st.j, t, 'main')
        if (light === 'green') continue
        if (light === 'amber' && d < (c.v * c.v) / (2 * B) + 1) continue
        if (d < gap) {
          gap = Math.max(0.1, d)
          vLead = 0
        }
      }
      const sStar = GAP + c.v * HEAD + (c.v * (c.v - vLead)) / (2 * Math.sqrt(A * B))
      const r = c.v / c.v0
      let a = A * (1 - r * r * r * r - (gap === Infinity ? 0 : (Math.max(0, sStar) / Math.max(0.1, gap)) ** 2))
      a = Math.max(-8, Math.min(A, a))
      nextV[i] = Math.max(0, c.v + a * DT)
      nextA[i] = a
    }
    for (let i = 0; i < cars.length; i++) {
      cars[i].v = nextV[i]
      cars[i].s += nextV[i] * DT
      if (t >= -DT / 2 && idx >= 0 && idx < n) {
        out[i].s[idx] = cars[i].s
        out[i].brake[idx] = nextA[i] < -1 || nextV[i] < 0.4 ? 1 : 0
      }
    }
  }
  return out
}
