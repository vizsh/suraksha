// Traffic signals at the map's signalised junctions, on the same cycle the background traffic
// obeys (world/traffic.ts). On JVLR: a mast-arm signal over the lanes on the near side, a pole
// signal on the far side, heads for the cross street, a stop line and a zebra crossing.
// Elsewhere: one pole with a head for each road. Lamps are instanced; their colours update per frame.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { World } from '../../world/scenario'
import { simTime } from '../../world/clock'
import { lightAt, stopLine, type Junction } from '../../world/traffic'
import { ROAD_WIDTH, type V2 } from '../../world/corridor'

interface Head {
  x: number
  y: number
  z: number
  rot: number // yaw; the head's face (+z) points toward the traffic it controls
  j: Junction
  approach: 'main' | 'cross'
}

const KERB = 9.4 // pole offset from the JVLR centreline (carriageway half width 8, plus footpath)

export function nearestRoad(world: World, p: V2) {
  let best = { d: Infinity, dir: [1, 0] as V2, w: 8, foot: [p[0], p[1]] as V2, side: 0 }
  for (const r of world.data.roads) {
    if (r.kind === 'footway' || r.kind === 'service') continue
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i]
      const [bx, bz] = r.pts[i + 1]
      const vx = bx - ax
      const vz = bz - az
      const L2 = vx * vx + vz * vz || 1
      const k = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - az) * vz) / L2))
      const fx = ax + vx * k
      const fz = az + vz * k
      const d = Math.hypot(p[0] - fx, p[1] - fz)
      if (d < best.d) {
        const L = Math.sqrt(L2)
        // side: +1 on the (-dz, dx) normal's side of the road, -1 on the other, 0 on the centreline
        const cross = ((p[0] - fx) * -vz + (p[1] - fz) * vx) / L
        best = { d, dir: [vx / L, vz / L], w: ROAD_WIDTH[r.kind] ?? 8, foot: [fx, fz], side: Math.abs(cross) < 0.5 ? 0 : Math.sign(cross) }
      }
    }
  }
  return best
}

function layout(world: World) {
  const heads: Head[] = []
  const poles: THREE.Matrix4[] = []
  const arms: THREE.Matrix4[] = []
  const stripes: THREE.Matrix4[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const pole = (x: number, z: number, h: number) => poles.push(m.clone().compose(new THREE.Vector3(x, 0, z), q.identity().clone(), new THREE.Vector3(1, h, 1)))
  const paint = (x: number, z: number, yaw: number, w: number, l: number) =>
    stripes.push(m.clone().compose(new THREE.Vector3(x, 0.075, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), new THREE.Vector3(w, 1, l)))

  for (const j of world.junctions) {
    if (j.sPath !== null) {
      const path = world.path
      const line = stopLine(j.sPath)
      const a = path.at(line - 2, -KERB)
      const back = a.heading + Math.PI
      // near side: pole on the kerb, mast arm over the lanes, one head over the lanes and one at eye level
      pole(a.x, a.z, 6.4)
      const armMid = path.at(line - 2, -KERB + 4.2)
      arms.push(m.clone().compose(new THREE.Vector3(armMid.x, 6.2, armMid.z), new THREE.Quaternion().setFromAxisAngle(up, a.heading + Math.PI / 2), new THREE.Vector3(1, 1, 8.4)))
      for (const off of [-4.2, -0.8]) {
        const h = path.at(line - 2, off)
        heads.push({ x: h.x, y: 5.4, z: h.z, rot: back, j, approach: 'main' })
      }
      heads.push({ x: a.x, y: 3.1, z: a.z, rot: back, j, approach: 'main' })
      // the same pole carries a head for the cross street, facing across the junction
      heads.push({ x: a.x, y: 3.1, z: a.z, rot: a.heading - Math.PI / 2, j, approach: 'cross' })
      // far side: a pole signal past the junction, read across it
      const f = path.at(j.sPath + 12, KERB)
      pole(f.x, f.z, 3.6)
      heads.push({ x: f.x, y: 3.1, z: f.z, rot: back, j, approach: 'main' })
      heads.push({ x: f.x, y: 3.1, z: f.z, rot: a.heading + Math.PI / 2, j, approach: 'cross' })
      // stop line across the carriageway, zebra crossing between it and the junction
      const sl = path.at(line, 0)
      paint(sl.x, sl.z, sl.heading + Math.PI / 2, 0.4, 16)
      for (let off = -7.2; off <= 7.2; off += 1.1) {
        const z = path.at(line + 3.5, off)
        paint(z.x, z.z, z.heading, 0.55, 3.2)
      }
    } else {
      const r = nearestRoad(world, j.p)
      const yaw = Math.atan2(r.dir[0], r.dir[1])
      // stand on the left kerb of the nearest road
      const nx = -r.dir[1]
      const nz = r.dir[0]
      const x = j.p[0] - nx * (r.w / 2 + 1.4)
      const z = j.p[1] - nz * (r.w / 2 + 1.4)
      pole(x, z, 3.6)
      heads.push({ x, y: 3.1, z, rot: yaw + Math.PI, j, approach: 'main' })
      heads.push({ x, y: 3.1, z, rot: yaw - Math.PI / 2, j, approach: 'cross' })
    }
  }
  return { heads, poles, arms, stripes }
}

const layoutCache = new WeakMap<World, ReturnType<typeof layout>>()

const ON = { red: new THREE.Color(5, 0.35, 0.2), amber: new THREE.Color(5, 2.4, 0.2), green: new THREE.Color(0.3, 4.2, 1.6) }
const OFF = { red: new THREE.Color(0.08, 0.02, 0.02), amber: new THREE.Color(0.08, 0.06, 0.02), green: new THREE.Color(0.02, 0.07, 0.04) }

export function Signals({ world, night }: { world: World; night: boolean }) {
  const L = useMemo(() => {
    let l = layoutCache.get(world)
    if (!l) {
      l = layout(world)
      layoutCache.set(world, l)
    }
    return l
  }, [world])

  const geo = useMemo(() => {
    const housing = mergeGeometries([new THREE.BoxGeometry(0.34, 0.95, 0.24), new THREE.BoxGeometry(0.5, 1.12, 0.03).translate(0, 0, -0.13)])!
    const visor = new THREE.CylinderGeometry(0.15, 0.15, 0.16, 12, 1, true, -Math.PI / 2, Math.PI)
    visor.rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 0.06, 0.2)
    const visors = mergeGeometries([-0.3, 0, 0.3].map((y) => visor.clone().translate(0, y, 0)))!
    const lamp = new THREE.CircleGeometry(0.11, 16).translate(0, 0, 0.125)
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 1, 10).translate(0, 0.5, 0)
    const arm = new THREE.BoxGeometry(0.12, 0.12, 1)
    const stripe = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    return { housing: mergeGeometries([housing, visors])!, lamp, pole, arm, stripe }
  }, [])

  const lamps = useRef<Record<'red' | 'amber' | 'green', THREE.InstancedMesh | null>>({ red: null, amber: null, green: null })
  const place = (r: THREE.InstancedMesh | null, ms: THREE.Matrix4[]) => {
    if (!r) return
    ms.forEach((mm, i) => r.setMatrixAt(i, mm))
    r.count = ms.length
    r.instanceMatrix.needsUpdate = true
  }
  const headMatrices = useMemo(() => L.heads.map((h) => new THREE.Matrix4().compose(new THREE.Vector3(h.x, h.y, h.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.rot), new THREE.Vector3(1, 1, 1))), [L])
  const lampMatrices = (dy: number) => headMatrices.map((mm) => mm.clone().multiply(new THREE.Matrix4().makeTranslation(0, dy, 0)))
  const lampSetup = (key: 'red' | 'amber' | 'green', dy: number) => (r: THREE.InstancedMesh | null) => {
    lamps.current[key] = r
    if (!r) return
    place(r, lampMatrices(dy))
    if (!r.instanceColor) r.setColorAt(0, OFF[key])
  }

  useFrame(() => {
    const t = simTime()
    L.heads.forEach((h, i) => {
      const s = lightAt(h.j, t, h.approach)
      for (const key of ['red', 'amber', 'green'] as const) lamps.current[key]?.setColorAt(i, key === s ? ON[key] : OFF[key])
    })
    for (const key of ['red', 'amber', 'green'] as const) {
      const r = lamps.current[key]
      if (r?.instanceColor) r.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={(r) => place(r, L.poles)} args={[geo.pole, undefined, L.poles.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#2b2f33" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={(r) => place(r, L.arms)} args={[geo.arm, undefined, Math.max(1, L.arms.length)]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#2b2f33" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={(r) => place(r, headMatrices)} args={[geo.housing, undefined, L.heads.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#16181a" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={lampSetup('red', 0.3)} args={[geo.lamp, undefined, L.heads.length]} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={lampSetup('amber', 0)} args={[geo.lamp, undefined, L.heads.length]} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={lampSetup('green', -0.3)} args={[geo.lamp, undefined, L.heads.length]} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={(r) => place(r, L.stripes)} args={[geo.stripe, undefined, Math.max(1, L.stripes.length)]} receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#efece4" roughness={0.7} polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} emissive="#ffffff" emissiveIntensity={night ? 0.05 : 0} />
      </instancedMesh>
    </group>
  )
}
