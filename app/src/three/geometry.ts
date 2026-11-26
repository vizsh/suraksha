import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ROAD_WIDTH, type CorridorData, type Path, type V2 } from '../world/corridor'

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Wall tones seen across Powai: weathered whites, creams, pale greys, peach and sand.
const WALLS = ['#ece7dc', '#e4d8c0', '#d3d3cd', '#e9d2bc', '#cfc6b4', '#f1efe8', '#d9cdb9', '#c9ccc9']

/** All OSM building footprints extruded to height, merged into one draw call, with a per-building wall tone. */
export function buildBuildings(data: CorridorData) {
  const parts: THREE.BufferGeometry[] = []
  const c = new THREE.Color()
  for (const b of data.buildings) {
    if (b.pts.length < 4) continue
    const shape = new THREE.Shape(b.pts.map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.deleteAttribute('uv')
    c.set(WALLS[Math.floor(hash(b.id) * WALLS.length)])
    const n = g.getAttribute('position').count
    const col = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
      seed[i] = hash(b.id + 7)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    parts.push(g)
  }
  const merged = mergeGeometries(parts, false)!
  merged.computeVertexNormals()
  const edges = new THREE.EdgesGeometry(merged, 28)
  parts.forEach((p) => p.dispose())
  return { merged, edges }
}

/** A flat strip along a polyline. UVs: u across the strip (0..1), v along it in metres / tile. */
function ribbon(pts: V2[], width: number, y: number, pos: number[], uv: number[], tile = 6, offset = 0) {
  const hw = width / 2
  let along = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az) || 1
    const tx = (bx - ax) / len
    const tz = (bz - az) / len
    const nx = -tz
    const nz = tx
    const ox = nx * offset
    const oz = nz * offset
    const ex = tx * Math.min(hw * 0.5, 1)
    const ez = tz * Math.min(hw * 0.5, 1)
    const a1 = [ax - ex + nx * hw + ox, y, az - ez + nz * hw + oz]
    const a2 = [ax - ex - nx * hw + ox, y, az - ez - nz * hw + oz]
    const b1 = [bx + ex + nx * hw + ox, y, bz + ez + nz * hw + oz]
    const b2 = [bx + ex - nx * hw + ox, y, bz + ez - nz * hw + oz]
    const v0 = along / tile
    const v1 = (along + len) / tile
    pos.push(...a1, ...b1, ...a2, ...b2, ...a2, ...b1)
    uv.push(1, v0, 1, v1, 0, v0, 0, v1, 0, v0, 1, v1)
    along += len
  }
}

function toGeom(pos: number[], uv?: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const n = new Float32Array(pos.length)
  for (let i = 1; i < n.length; i += 3) n[i] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

const MAJOR = ['primary', 'trunk', 'secondary', 'motorway']

/** Road surfaces by class, plus paver footpaths and concrete kerbs along the major roads. */
export function buildRoads(data: CorridorData) {
  const major = { p: [] as number[], u: [] as number[] }
  const minor = { p: [] as number[], u: [] as number[] }
  const foot = { p: [] as number[], u: [] as number[] }
  const kerb = { p: [] as number[], u: [] as number[] }
  for (const r of data.roads) {
    const w = ROAD_WIDTH[r.kind] ?? 5
    if (r.kind === 'footway') ribbon(r.pts, w, 0.08, foot.p, foot.u, 2)
    else if (MAJOR.includes(r.kind)) {
      ribbon(r.pts, w, 0.05, major.p, major.u, 8)
      for (const side of [1, -1]) {
        ribbon(r.pts, 0.35, 0.16, kerb.p, kerb.u, 2, side * (w / 2 + 0.18))
        ribbon(r.pts, 2.6, 0.14, foot.p, foot.u, 2, side * (w / 2 + 1.65))
      }
    } else ribbon(r.pts, w, 0.04, minor.p, minor.u, 8)
  }
  return {
    major: toGeom(major.p, major.u),
    minor: toGeom(minor.p, minor.u),
    foot: toGeom(foot.p, foot.u),
    kerb: toGeom(kerb.p, kerb.u),
  }
}

/** Lane paint along a carriageway path: dashed lane dividers and solid edge lines. */
export function buildLanePaint(path: Path, from = 0, to = path.length, dashes = [-1.75, 1.75], edges = [-5.4, 5.4]) {
  const dash: number[] = []
  const solid: number[] = []
  const du: number[] = []
  const su: number[] = []
  const step = 1.5
  for (let s = from; s < to; s += step) {
    const dashOn = Math.floor(s / 4.5) % 2 === 0
    for (const off of dashes) {
      if (!dashOn) continue
      const a = path.at(s, off)
      const b = path.at(s + step, off)
      ribbon([[a.x, a.z], [b.x, b.z]], 0.16, 0.09, dash, du)
    }
    for (const off of edges) {
      const a = path.at(s, off)
      const b = path.at(s + step, off)
      ribbon([[a.x, a.z], [b.x, b.z]], 0.14, 0.09, solid, su)
    }
  }
  return { dash: toGeom(dash), solid: toGeom(solid) }
}

/** Sidewalk gap: a stretch of the kerb with no footpath, drawn as broken terrain-ink line. */
export function buildKerbGap(path: Path, s0: number, s1: number, off: number) {
  const out: number[] = []
  const uv: number[] = []
  for (let s = s0; s < s1; s += 1.2) {
    if (Math.floor(s / 2.4) % 2) continue
    const a = path.at(s, off)
    const b = path.at(s + 1.2, off)
    ribbon([[a.x, a.z], [b.x, b.z]], 0.5, 0.2, out, uv)
  }
  return toGeom(out)
}

function segDist(px: number, pz: number, a: V2, b: V2) {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const l2 = vx * vx + vz * vz || 1
  const k = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / l2))
  return Math.hypot(px - a[0] - vx * k, pz - a[1] - vz * k)
}

// Spatial index of road segments in 50 m cells, built once per dataset.
const CELL = 50
const roadIndex = new WeakMap<CorridorData, Map<string, { a: V2; b: V2; half: number }[]>>()
function indexRoads(data: CorridorData) {
  let idx = roadIndex.get(data)
  if (idx) return idx
  idx = new Map()
  for (const r of data.roads) {
    if (r.kind === 'footway') continue
    const half = (ROAD_WIDTH[r.kind] ?? 5) / 2
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i]
      const b = r.pts[i + 1]
      const pad = half + 4
      const x0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL)
      const x1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL)
      const z0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL)
      const z1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const k = `${x},${z}`
          const list = idx.get(k) ?? []
          list.push({ a, b, half })
          idx.set(k, list)
        }
    }
  }
  roadIndex.set(data, idx)
  return idx
}

/** True when a point is on any carriageway or within `clear` metres of its edge. */
export function onAnyRoad(data: CorridorData, x: number, z: number, clear = 1.2) {
  const list = indexRoads(data).get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`)
  if (!list) return false
  for (const s of list) if (segDist(x, z, s.a, s.b) < s.half + clear) return true
  return false
}

/** Points every `spacing` metres along the major roads, offset to both sides: for trees and lamps. */
export function roadsidePoints(data: CorridorData, spacing: number, offsetBeyondKerb: number, seed = 1) {
  const pts: { x: number; z: number; heading: number; side: number }[] = []
  for (const r of data.roads) {
    if (!MAJOR.includes(r.kind)) continue
    const w = ROAD_WIDTH[r.kind] ?? 10
    let carry = hash(r.id * seed) * spacing
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i]
      const [bx, bz] = r.pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 0.1) continue
      const tx = (bx - ax) / len
      const tz = (bz - az) / len
      for (let s = carry; s < len; s += spacing) {
        for (const side of [1, -1]) {
          const off = side * (w / 2 + offsetBeyondKerb)
          pts.push({ x: ax + tx * s - tz * off, z: az + tz * s + tx * off, heading: Math.atan2(tx, tz), side })
        }
      }
      carry = (carry - len) % spacing
      if (carry < 0) carry += spacing
    }
  }
  return pts
}
