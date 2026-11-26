// BEST-style bus shelters at the map's bus stops (OSM highway=bus_stop): steel frame, a sloping
// roof, a glass back panel, a bench, the red route sign, and an advert panel lit at night.
// The open side faces the road. People wait at the shelters near the story (see Walkers).
import { useMemo } from 'react'
import * as THREE from 'three'
import type { World } from '../../world/scenario'
import { nearestRoad } from './Signals'

export interface ShelterSpot {
  x: number
  z: number
  yaw: number // local +z (the open front) faces the road
}

const cache = new WeakMap<World, ShelterSpot[]>()

/** One shelter per stop (OSM often has a node per platform, so nearby nodes are merged). */
export function shelterSpots(world: World): ShelterSpot[] {
  const hit = cache.get(world)
  if (hit) return hit
  const stops: [number, number][] = []
  for (const f of world.data.points) {
    if (f.kind !== 'bus_stop') continue
    if (stops.some((s) => Math.hypot(s[0] - f.p[0], s[1] - f.p[1]) < 18)) continue
    stops.push([f.p[0], f.p[1]])
  }
  const out: ShelterSpot[] = []
  for (const p of stops) {
    const r = nearestRoad(world, p)
    if (r.d > 30) continue
    // which side of the road the stop is on; on the road itself, the left kerb (traffic keeps left)
    const nx = -r.dir[1]
    const nz = r.dir[0]
    const side = r.side !== 0 ? r.side : -1
    const x = r.foot[0] + nx * side * (r.w / 2 + 2.6)
    const z = r.foot[1] + nz * side * (r.w / 2 + 2.6)
    out.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) })
  }
  cache.set(world, out)
  return out
}

function parts() {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z)
  const merge = (gs: THREE.BufferGeometry[]) => {
    // all parts are plain boxes: concatenate their attributes
    const g = new THREE.BufferGeometry()
    const pos: number[] = []
    const nor: number[] = []
    for (const p of gs.map((q) => q.toNonIndexed())) {
      pos.push(...(p.getAttribute('position').array as Float32Array))
      nor.push(...(p.getAttribute('normal').array as Float32Array))
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    return g
  }
  const post = (x: number, z: number) => new THREE.CylinderGeometry(0.05, 0.05, 2.62, 8).translate(x, 1.31, z)
  return {
    frame: merge([post(-2.1, -0.8), post(2.1, -0.8), post(-2.1, 0.62), post(2.1, 0.62), box(3.3, 0.06, 0.4, 0, 0.48, -0.5), box(0.06, 0.45, 0.3, -1.4, 0.24, -0.5), box(0.06, 0.45, 0.3, 1.4, 0.24, -0.5)]),
    roof: box(4.7, 0.1, 1.95, 0, 2.66, -0.08, -0.06),
    glass: box(4.2, 1.75, 0.03, 0, 1.25, -0.82),
    sign: box(1.5, 0.42, 0.06, -1.2, 2.96, 0.72),
    ad: box(0.05, 1.7, 1.25, 2.12, 1.3, -0.12),
  }
}

export function Shelters({ world, night }: { world: World; night: boolean }) {
  const spots = useMemo(() => shelterSpots(world), [world])
  const geo = useMemo(() => parts(), [])
  const mats = useMemo(
    () => ({
      frame: new THREE.MeshStandardMaterial({ color: '#8a9096', metalness: 0.7, roughness: 0.4 }),
      roof: new THREE.MeshStandardMaterial({ color: '#3b4146', metalness: 0.3, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#cfe0e6', metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false }),
      sign: new THREE.MeshStandardMaterial({ color: '#c8261f', roughness: 0.5, emissive: '#c8261f', emissiveIntensity: night ? 0.9 : 0 }),
      ad: new THREE.MeshStandardMaterial({ color: '#efe9da', roughness: 0.4, emissive: '#fff1d6', emissiveIntensity: night ? 2.2 : 0.05 }),
    }),
    [night],
  )
  const matrices = useMemo(
    () => spots.map((s) => new THREE.Matrix4().compose(new THREE.Vector3(s.x, 0.14, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1))),
    [spots],
  )
  const place = (r: THREE.InstancedMesh | null) => {
    if (!r) return
    matrices.forEach((m, i) => r.setMatrixAt(i, m))
    r.count = matrices.length
    r.instanceMatrix.needsUpdate = true
  }
  if (!spots.length) return null
  return (
    <group>
      {(Object.keys(geo) as (keyof typeof geo)[]).map((k) => (
        <instancedMesh key={k} ref={place} args={[geo[k], mats[k], spots.length]} castShadow={k !== 'glass'} receiveShadow={k === 'roof'} frustumCulled={false} />
      ))}
    </group>
  )
}
