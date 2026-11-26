// Procedural vehicle models: no downloads, physically based materials.
// Local frame: +z forward, +y up, origin on the ground at the vehicle centre.
// Each model is a set of parts, one geometry per material, so every part can be instanced.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export type PartKind = 'paint' | 'glass' | 'tyre' | 'rim' | 'head' | 'tail' | 'trim' | 'accent' | 'rider'
export type Model = Partial<Record<PartKind, THREE.BufferGeometry>>
export type VariantKey = 'hatch' | 'sedan' | 'suv' | 'bus' | 'auto' | 'bike'

function rbox(w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0) {
  const g = new RoundedBoxGeometry(w, h, d, 3, r)
  g.translate(x, y, z)
  return g.toNonIndexed()
}
function box(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g.toNonIndexed()
}

/** Pull the top vertices of a box inward to make a sloped glasshouse or hood. */
function taper(g: THREE.BufferGeometry, yAbove: number, kx: number, kzFront: number, kzBack: number, cz: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y <= yAbove) continue
    p.setX(i, p.getX(i) * kx)
    const z = p.getZ(i) - cz
    p.setZ(i, cz + z * (z > 0 ? kzFront : kzBack))
  }
  g.computeVertexNormals()
  return g
}

function wheels(xs: number[], zs: number[], r: number, w: number) {
  const tyres: THREE.BufferGeometry[] = []
  const rims: THREE.BufferGeometry[] = []
  for (const x of xs)
    for (const z of zs) {
      const t = new THREE.CylinderGeometry(r, r, w, 22, 1)
      t.rotateZ(Math.PI / 2)
      t.translate(x, r, z)
      tyres.push(t.toNonIndexed())
      const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 14, 1)
      rim.rotateZ(Math.PI / 2)
      rim.translate(x + Math.sign(x) * 0.005, r, z)
      rims.push(rim.toNonIndexed())
    }
  return { tyre: mergeGeometries(tyres)!, rim: mergeGeometries(rims)! }
}

const merge = (gs: THREE.BufferGeometry[]) => {
  const m = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))!
  m.computeVertexNormals()
  return m
}

function car(L: number, W: number, bodyH: number, cabinH: number, cabinLen: number, clearance: number, rear: number): Model {
  const y0 = clearance + bodyH / 2
  const body = taper(rbox(W, bodyH, L, 0.16, 0, y0, 0), y0, 0.97, 0.9, 0.96, 0)
  const cabinY = clearance + bodyH + cabinH / 2 - 0.04
  const cabinZ = -L * 0.05 * rear
  const cabin = taper(rbox(W * 0.9, cabinH, cabinLen, 0.12, 0, cabinY, cabinZ), cabinY, 0.86, 0.62, 0.82, cabinZ)
  const roof = taper(rbox(W * 0.78, 0.06, cabinLen * 0.7, 0.03, 0, cabinY + cabinH / 2 - 0.01, cabinZ - 0.05), -10, 1, 1, 1, 0)
  const { tyre, rim } = wheels([-W / 2 + 0.12, W / 2 - 0.12], [L * 0.33, -L * 0.33], 0.31, 0.22)
  const head = merge([box(0.42, 0.09, 0.05, -W / 2 + 0.33, y0 + 0.1, L / 2 - 0.02), box(0.42, 0.09, 0.05, W / 2 - 0.33, y0 + 0.1, L / 2 - 0.02)])
  const tail = merge([box(0.36, 0.1, 0.05, -W / 2 + 0.3, y0 + 0.12, -L / 2 + 0.02), box(0.36, 0.1, 0.05, W / 2 - 0.3, y0 + 0.12, -L / 2 + 0.02)])
  const trim = merge([box(W * 0.92, 0.16, 0.08, 0, clearance + 0.12, L / 2 - 0.03), box(W * 0.92, 0.16, 0.08, 0, clearance + 0.12, -L / 2 + 0.03)])
  return { paint: merge([body, roof]), glass: cabin, tyre, rim, head, tail, trim }
}

function bus(): Model {
  const L = 11.6
  const W = 2.55
  const body = rbox(W, 2.4, L, 0.18, 0, 1.55, 0)
  const roof = rbox(W * 0.96, 0.25, L * 0.96, 0.1, 0, 2.86, 0)
  const glass = merge([box(W + 0.02, 0.95, L * 0.82, 0, 2.05, -0.4), box(W * 0.9, 1.1, 0.06, 0, 2.0, L / 2 + 0.01)])
  const { tyre, rim } = wheels([-W / 2 + 0.2, W / 2 - 0.2], [L * 0.32, -L * 0.3], 0.5, 0.32)
  const head = merge([box(0.35, 0.16, 0.05, -0.85, 0.75, L / 2 + 0.02), box(0.35, 0.16, 0.05, 0.85, 0.75, L / 2 + 0.02)])
  const tail = merge([box(0.25, 0.4, 0.05, -1.05, 0.95, -L / 2 - 0.02), box(0.25, 0.4, 0.05, 1.05, 0.95, -L / 2 - 0.02)])
  const accent = box(1.6, 0.26, 0.05, 0, 2.66, L / 2 + 0.03) // lit destination board
  const trim = box(W + 0.02, 0.18, L, 0, 0.42, 0)
  return { paint: body, trim: merge([roof, trim]), glass, tyre, rim, head, tail, accent }
}

function auto(): Model {
  const lower = taper(rbox(1.3, 0.75, 2.5, 0.2, 0, 0.62, 0), 0.62, 0.96, 0.7, 1, 0)
  const canopy = rbox(1.36, 0.9, 1.9, 0.22, 0, 1.45, -0.2)
  const t1 = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 18)
  t1.rotateZ(Math.PI / 2)
  const front = t1.clone().translate(0, 0.22, 1.05)
  const rl = t1.clone().translate(-0.55, 0.22, -0.8)
  const rr = t1.clone().translate(0.55, 0.22, -0.8)
  const rims = [front, rl, rr].map((g) => g.clone().scale(1.02, 0.6, 0.6))
  const glass = box(1.0, 0.45, 0.05, 0, 1.4, 0.78)
  return {
    trim: lower, // Mumbai autos: black lower body
    accent: canopy, // and a yellow canopy
    glass,
    tyre: merge([front, rl, rr]),
    rim: merge(rims),
    head: box(0.2, 0.12, 0.05, 0, 0.85, 1.26),
    tail: merge([box(0.12, 0.08, 0.04, -0.5, 0.6, -1.26), box(0.12, 0.08, 0.04, 0.5, 0.6, -1.26)]),
  }
}

function bike(): Model {
  const frame = merge([rbox(0.28, 0.32, 1.25, 0.1, 0, 0.62, 0), rbox(0.3, 0.12, 0.6, 0.05, 0, 0.84, -0.15)])
  const t = new THREE.TorusGeometry(0.29, 0.07, 10, 22)
  t.rotateY(Math.PI / 2)
  const tyre = merge([t.clone().translate(0, 0.33, 0.66), t.clone().translate(0, 0.33, -0.62)])
  const torso = new THREE.CapsuleGeometry(0.19, 0.5, 4, 10).translate(0, 1.25, -0.1)
  torso.rotateX(0.18)
  const helmet = new THREE.SphereGeometry(0.15, 14, 10).translate(0, 1.72, 0.02)
  const legs = merge([new THREE.CapsuleGeometry(0.08, 0.5, 3, 8).rotateX(1.2).translate(-0.17, 0.82, 0.12), new THREE.CapsuleGeometry(0.08, 0.5, 3, 8).rotateX(1.2).translate(0.17, 0.82, 0.12)])
  return {
    paint: frame,
    tyre,
    rim: tyre.clone().scale(0.5, 0.5, 0.5).translate(0, 0.16, 0),
    rider: merge([torso, legs]),
    accent: helmet,
    head: box(0.14, 0.1, 0.05, 0, 0.92, 0.68),
    tail: box(0.12, 0.06, 0.04, 0, 0.86, -0.66),
  }
}

let cache: Record<VariantKey, Model> | null = null
export function vehicleModels(): Record<VariantKey, Model> {
  cache ??= {
    hatch: car(3.85, 1.73, 0.62, 0.55, 2.0, 0.2, 0.6),
    sedan: car(4.45, 1.76, 0.6, 0.52, 2.2, 0.18, 0.2),
    suv: car(4.4, 1.82, 0.78, 0.62, 2.45, 0.26, 0.9),
    bus: bus(),
    auto: auto(),
    bike: bike(),
  }
  return cache
}

/** Factory paint shades that read as real cars on Indian roads: whites, silvers, greys, a few colours. */
export const PAINTS = ['#f2f1ee', '#e9e9e7', '#b9bcbf', '#8d9195', '#4b4f54', '#1f2226', '#a32a2a', '#2f4a73', '#c9b48f', '#f4f3f0', '#d7d8d6']

export function makeMaterials(night: boolean): Record<PartKind, THREE.Material> {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#0e1418', metalness: 0.9, roughness: 0.06, clearcoat: 1 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#b8bcc0', metalness: 1, roughness: 0.3 }),
    head: new THREE.MeshStandardMaterial({ color: '#f7f4ea', emissive: '#fff6df', emissiveIntensity: night ? 6 : 0.4 }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a0d0d', emissive: '#ff2a1a', emissiveIntensity: night ? 4 : 0.3 }),
    trim: new THREE.MeshStandardMaterial({ color: '#1b1d1f', roughness: 0.6, metalness: 0.2 }),
    accent: new THREE.MeshStandardMaterial({ color: '#f2c21b', roughness: 0.5, emissive: '#ffb84d', emissiveIntensity: night ? 0.6 : 0 }),
    rider: new THREE.MeshStandardMaterial({ color: '#3b4046', roughness: 0.85 }),
  }
}
