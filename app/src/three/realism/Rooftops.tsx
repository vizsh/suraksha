// Mumbai rooftops: black plastic water tanks on stands (the most recognisable detail of the
// city's roofline), AC units, and a stair room on taller blocks. Placed inside each OSM building
// footprint with a fixed seed; everything instanced.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { World } from '../../world/scenario'
import { pointInPoly } from './Street'

type Part = 'tank' | 'stand' | 'ac' | 'stair'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function layout(world: World) {
  const out: Record<Part, THREE.Matrix4[]> = { tank: [], stand: [], ac: [], stair: [] }
  const r = rng(71)
  const up = new THREE.Vector3(0, 1, 0)
  for (const b of world.data.buildings) {
    const pts = b.pts as [number, number][]
    if (pts.length < 4) continue
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    let area = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      x0 = Math.min(x0, ax)
      x1 = Math.max(x1, ax)
      z0 = Math.min(z0, az)
      z1 = Math.max(z1, az)
      area += ax * bz - bx * az
    }
    area = Math.abs(area) / 2
    if (area < 40) continue
    // a spot whose whole footprint (radius rad) sits inside the roof
    const spot = (rad: number): [number, number] | null => {
      for (let k = 0; k < 12; k++) {
        const x = x0 + rad + r() * Math.max(0, x1 - x0 - 2 * rad)
        const z = z0 + rad + r() * Math.max(0, z1 - z0 - 2 * rad)
        if ([[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]].every(([dx, dz]) => pointInPoly(x + dx, z + dz, pts))) return [x, z]
      }
      return null
    }
    const yaw = r() * Math.PI
    const q = new THREE.Quaternion().setFromAxisAngle(up, yaw)
    const put = (part: Part, x: number, y: number, z: number, s = 1) => out[part].push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)))
    // tanks: one to four, often in a row on a shared stand
    const tanks = area > 600 ? 2 + Math.floor(r() * 3) : area > 150 ? 1 + Math.floor(r() * 2) : r() < 0.6 ? 1 : 0
    const at = spot(1.2 + tanks * 0.7)
    if (at) {
      const dir = new THREE.Vector3(1.45, 0, 0).applyQuaternion(q)
      for (let k = 0; k < tanks; k++) {
        const o = k - (tanks - 1) / 2
        const x = at[0] + dir.x * o
        const z = at[1] + dir.z * o
        const s = 0.85 + r() * 0.3
        put('stand', x, b.h, z)
        put('tank', x, b.h + 0.55, z, s)
      }
    }
    // AC units on most roofs
    const acs = area > 300 ? 1 + Math.floor(r() * 4) : r() < 0.5 ? 1 : 0
    for (let k = 0; k < acs; k++) {
      const p = spot(0.7)
      if (p) put('ac', p[0], b.h, p[1])
    }
    // a stair room on taller blocks
    if (b.h > 15 && area > 220) {
      const p = spot(2.2)
      if (p) put('stair', p[0], b.h, p[1])
    }
  }
  return out
}

const cache = new WeakMap<World, ReturnType<typeof layout>>()

function geometries(): Record<Part, THREE.BufferGeometry> {
  // a ribbed black cylinder with a domed lid and an inlet cap
  const body = new THREE.CylinderGeometry(0.62, 0.62, 1.25, 18, 4).translate(0, 0.625, 0)
  const p = body.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.03 * Math.cos(p.getY(i) * 15)
    p.setX(i, p.getX(i) * k)
    p.setZ(i, p.getZ(i) * k)
  }
  body.computeVertexNormals()
  const lid = new THREE.SphereGeometry(0.62, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, 1.25, 0)
  const cap = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10).translate(0, 1.45, 0)
  const tank = mergeGeometries([body.toNonIndexed(), lid.toNonIndexed(), cap.toNonIndexed()])!
  const leg = (x: number, z: number) => new THREE.BoxGeometry(0.08, 0.55, 0.08).translate(x, 0.275, z)
  const stand = mergeGeometries([new THREE.BoxGeometry(1.4, 0.06, 1.4).translate(0, 0.55, 0), leg(-0.6, -0.6), leg(0.6, -0.6), leg(-0.6, 0.6), leg(0.6, 0.6)])!
  const ac = new THREE.BoxGeometry(0.95, 0.65, 0.4).translate(0, 0.33, 0)
  const stair = new THREE.BoxGeometry(3.2, 2.7, 3.4).translate(0, 1.35, 0)
  return { tank, stand, ac, stair }
}

export function Rooftops({ world, night }: { world: World; night: boolean }) {
  const sets = useMemo(() => {
    let l = cache.get(world)
    if (!l) {
      l = layout(world)
      cache.set(world, l)
    }
    return l
  }, [world])
  const geo = useMemo(() => geometries(), [])
  const mats = useMemo(
    () => ({
      tank: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.55 }),
      stand: new THREE.MeshStandardMaterial({ color: '#5d5a55', roughness: 0.7, metalness: 0.4 }),
      ac: new THREE.MeshStandardMaterial({ color: night ? '#8c8e8f' : '#d8d9d6', roughness: 0.6 }),
      stair: new THREE.MeshStandardMaterial({ color: night ? '#77736c' : '#cfc8bb', roughness: 0.9 }),
    }),
    [night],
  )
  return (
    <group>
      {(Object.keys(geo) as Part[]).map((k) => (
        <instancedMesh
          key={k}
          ref={(m) => {
            if (!m) return
            sets[k].forEach((mm, j) => m.setMatrixAt(j, mm))
            m.count = sets[k].length
            m.instanceMatrix.needsUpdate = true
          }}
          args={[geo[k], mats[k], Math.max(1, sets[k].length)]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  )
}
