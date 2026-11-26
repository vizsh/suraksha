// Corridor data: real OSM geometry of Powai (IIT Bombay to Hiranandani), in local metres.
// x = east, z = south. Produced by scripts/fetch-osm.mjs.
import { contours } from 'd3-contour'

export type V2 = [number, number]
export interface Road {
  id: number
  kind: string
  name: string | null
  lanes: number | null
  oneway: boolean
  sidewalk: string | null
  pts: V2[]
}
export interface Building {
  id: number
  h: number
  pts: V2[]
}
export interface PointFeature {
  id: number
  kind: string
  name: string | null
  p: V2
}
export interface CorridorData {
  source: string
  bbox: { s: number; w: number; n: number; e: number }
  origin: { lat: number; lon: number }
  size: [number, number]
  roads: Road[]
  buildings: Building[]
  points: PointFeature[]
}

export const ROAD_WIDTH: Record<string, number> = {
  motorway: 18,
  trunk: 16,
  primary: 15,
  secondary: 11,
  tertiary: 8,
  unclassified: 6,
  residential: 5.5,
  service: 3.6,
  footway: 1.8,
}

export class Path {
  pts: V2[]
  cum: number[]
  length: number
  constructor(pts: V2[]) {
    this.pts = pts
    this.cum = [0]
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]
      const [bx, bz] = pts[i]
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, bz - az))
    }
    this.length = this.cum[this.cum.length - 1]
  }
  /** Position and unit tangent at arc length s, with a lateral offset (positive = right of travel). */
  at(s: number, offset = 0): { x: number; z: number; dx: number; dz: number; heading: number } {
    const L = this.length
    s = ((s % L) + L) % L
    let lo = 0
    let hi = this.cum.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] <= s) lo = mid
      else hi = mid
    }
    const [ax, az] = this.pts[lo]
    const [bx, bz] = this.pts[hi]
    const seg = this.cum[hi] - this.cum[lo] || 1
    const t = (s - this.cum[lo]) / seg
    const dx = (bx - ax) / seg
    const dz = (bz - az) / seg
    // right-hand normal of (dx, dz) on the x/z plane, viewed from above with z south
    const nx = -dz
    const nz = dx
    return {
      x: ax + (bx - ax) * t + nx * offset,
      z: az + (bz - az) * t + nz * offset,
      dx,
      dz,
      heading: Math.atan2(dx, dz),
    }
  }
  /** Nearest point on the path: arc length s and signed lateral offset (positive = right of travel). */
  project(x: number, z: number): { s: number; offset: number; dist: number } {
    let best = { s: 0, offset: 0, dist: Infinity }
    for (let i = 0; i < this.pts.length - 1; i++) {
      const [ax, az] = this.pts[i]
      const [bx, bz] = this.pts[i + 1]
      const vx = bx - ax
      const vz = bz - az
      const len2 = vx * vx + vz * vz || 1
      const k = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2))
      const px = ax + vx * k
      const pz = az + vz * k
      const d = Math.hypot(x - px, z - pz)
      if (d < best.dist) {
        const len = Math.sqrt(len2)
        // right-hand normal (-vz, vx) / len, matching at()
        const offset = ((x - px) * -vz + (z - pz) * vx) / len
        best = { s: this.cum[i] + k * len, offset, dist: d }
      }
    }
    return best
  }
}

function near(a: V2, b: V2, tol = 3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < tol
}

/** Chain same-named ways into one continuous path, starting from the longest one. */
export function chainRoad(roads: Road[], name: RegExp, exclude: Set<number> = new Set()): Path & { ids: Set<number> } {
  const pool = roads.filter((r) => r.name && name.test(r.name) && r.pts.length > 1 && !exclude.has(r.id))
  const len = (r: Road) => new Path(r.pts).length
  pool.sort((a, b) => len(b) - len(a))
  const used = new Set<number>()
  let chain: V2[] = [...pool[0].pts]
  used.add(pool[0].id)
  let grew = true
  while (grew) {
    grew = false
    for (const r of pool) {
      if (used.has(r.id)) continue
      const first = r.pts[0]
      const last = r.pts[r.pts.length - 1]
      const end = chain[chain.length - 1]
      const start = chain[0]
      if (near(first, end)) chain = chain.concat(r.pts.slice(1))
      else if (near(last, start)) chain = r.pts.slice(0, -1).concat(chain)
      else if (!r.oneway && near(last, end)) chain = chain.concat([...r.pts].reverse().slice(1))
      else if (!r.oneway && near(first, start)) chain = [...r.pts].reverse().slice(0, -1).concat(chain)
      else continue
      used.add(r.id)
      grew = true
    }
  }
  return Object.assign(new Path(chain), { ids: used })
}

export interface RiskField {
  isolines: { level: number; rings: V2[][] }[]
  hotspot: V2
  peaks: { p: V2; value: number }[]
  /** Predicted risk at a point (bilinear on the 8 m grid). */
  at: (x: number, z: number) => number
}

/** Predicted-risk surface: geometry features (signals, stops, hospitals) plus a synthetic crash history. */
export function buildRisk(data: CorridorData, extraHotspots: { p: V2; amp: number; sigma: number }[]): RiskField {
  const cell = 8
  const [W, H] = data.size
  const nx = Math.ceil(W / cell)
  const nz = Math.ceil(H / cell)
  const ox = -W / 2
  const oz = -H / 2
  const sources: { p: V2; amp: number; sigma: number }[] = [...extraHotspots]
  for (const f of data.points) {
    if (f.kind === 'traffic_signals') sources.push({ p: f.p, amp: 0.55, sigma: 38 })
    else if (f.kind === 'bus_stop') sources.push({ p: f.p, amp: 0.28, sigma: 26 })
    else if (f.kind === 'hospital' || f.kind === 'school' || f.kind === 'college') sources.push({ p: f.p, amp: 0.3, sigma: 55 })
  }
  const values = new Float64Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = ox + i * cell
      const z = oz + j * cell
      let v = 0
      for (const s of sources) {
        const d2 = (x - s.p[0]) ** 2 + (z - s.p[1]) ** 2
        v += s.amp * Math.exp(-d2 / (2 * s.sigma * s.sigma))
      }
      values[j * nx + i] = v
    }
  }
  const levels = [0.3, 0.45, 0.6, 0.75, 0.9, 1.05]
  const gen = contours().size([nx, nz]).thresholds(levels)
  const isolines = gen(Array.from(values)).map((c) => ({
    level: c.value,
    rings: c.coordinates.flatMap((poly) =>
      poly.map((ring) => ring.map(([i, j]) => [ox + i * cell, oz + j * cell] as V2)),
    ),
  }))
  let best = 0
  let hotspot: V2 = [0, 0]
  values.forEach((v, k) => {
    if (v > best) {
      best = v
      hotspot = [ox + (k % nx) * cell, oz + Math.floor(k / nx) * cell]
    }
  })
  // Local maxima above the potential band become predicted risk zones.
  const peaks: { p: V2; value: number }[] = []
  for (let j = 2; j < nz - 2; j++) {
    for (let i = 2; i < nx - 2; i++) {
      const v = values[j * nx + i]
      if (v < 0.62) continue
      let isMax = true
      for (let dj = -2; dj <= 2 && isMax; dj++)
        for (let di = -2; di <= 2; di++) if ((di || dj) && values[(j + dj) * nx + i + di] > v) isMax = false
      if (isMax) peaks.push({ p: [ox + i * cell, oz + j * cell], value: v })
    }
  }
  peaks.sort((a, b) => b.value - a.value)
  const at = (x: number, z: number) => {
    const fx = (x - ox) / cell
    const fz = (z - oz) / cell
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return 0
    const tx = fx - i
    const tz = fz - j
    const v = (a: number, b: number) => values[b * nx + a]
    return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - tz) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * tz
  }
  return { isolines, hotspot, peaks: peaks.slice(0, 5), at }
}

let cache: Promise<CorridorData> | null = null
export function loadCorridor(): Promise<CorridorData> {
  cache ??= fetch('/data/corridor.json').then((r) => r.json())
  return cache
}

// ---------- coordinates ----------

const M_PER_LAT = 110574
function mPerLon(lat0: number) {
  return 111320 * Math.cos((lat0 * Math.PI) / 180)
}
/** Local metres (x east, z south) to latitude and longitude. */
export function toLatLon(data: CorridorData, x: number, z: number): { lat: number; lon: number } {
  return { lat: data.origin.lat - z / M_PER_LAT, lon: data.origin.lon + x / mPerLon(data.origin.lat) }
}
/** Latitude and longitude to local metres. */
export function fromLatLon(data: CorridorData, lat: number, lon: number): V2 {
  return [(lon - data.origin.lon) * mPerLon(data.origin.lat), -(lat - data.origin.lat) * M_PER_LAT]
}

/** Map matching: move a reported point onto the nearest carriageway, and onto a lane centre on JVLR. */
export function snapToRoad(data: CorridorData, route: Path, p: V2): { pos: V2; road: string | null; lane: number | null; moved: number } {
  const pr = route.project(p[0], p[1])
  if (pr.dist < 12) {
    const lane = Math.max(-1, Math.min(1, Math.round(pr.offset / 3.5)))
    const q = route.at(pr.s, lane * 3.5)
    return { pos: [q.x, q.z], road: 'JVLR', lane: lane + 2, moved: Math.hypot(q.x - p[0], q.z - p[1]) }
  }
  let best = { d: Infinity, pos: p as V2, road: null as string | null }
  for (const r of data.roads) {
    if (r.kind === 'footway') continue
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i]
      const [bx, bz] = r.pts[i + 1]
      const vx = bx - ax
      const vz = bz - az
      const l2 = vx * vx + vz * vz || 1
      const k = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - az) * vz) / l2))
      const q: V2 = [ax + vx * k, az + vz * k]
      const d = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (d < best.d) best = { d, pos: q, road: r.name }
    }
  }
  if (best.d > 25) return { pos: p, road: null, lane: null, moved: 0 }
  return { pos: best.pos, road: best.road, lane: null, moved: best.d }
}
