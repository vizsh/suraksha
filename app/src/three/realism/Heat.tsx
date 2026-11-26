// Near-miss heat: 30 days of harsh-braking events binned into hexagons and raised as columns.
// The events are synthetic (seeded from the risk zones, signals and the JVLR corridor) and the UI
// says so; in production they come from connected cars' telematics.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { World } from '../../world/scenario'
import type { V2 } from '../../world/corridor'

const HEX = 22 // hexagon radius in metres

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r())
}

/** Pointy-top axial hex binning. */
function hexKey(x: number, z: number) {
  const q = ((Math.sqrt(3) / 3) * x - z / 3) / HEX
  const r = ((2 / 3) * z) / HEX
  let rx = Math.round(q)
  let rz = Math.round(r)
  const ry = Math.round(-q - r)
  const dx = Math.abs(rx - q)
  const dz = Math.abs(rz - r)
  const dy = Math.abs(ry + q + r)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dz > dy) rz = -rx - ry
  return [rx, rz] as const
}
function hexCenter(q: number, r: number): V2 {
  return [HEX * Math.sqrt(3) * (q + r / 2), HEX * 1.5 * r]
}

export function nearMissBins(world: World) {
  const r = rand(2026)
  const events: V2[] = []
  const add = (p: V2, sigma: number, n: number) => {
    for (let i = 0; i < n; i++) events.push([p[0] + gauss(r) * sigma, p[1] + gauss(r) * sigma])
  }
  for (const z of world.zones) add(z.pos, 32, 140)
  const signals = world.data.points.filter((p) => p.kind === 'traffic_signals')
  for (const s of signals) add(s.p, 22, 40)
  for (let i = 0; i < 420; i++) {
    const p = world.path.at(world.sStart - 200 + r() * 900, (r() - 0.5) * 10)
    events.push([p.x, p.z])
  }
  const bus = world.path.at(world.sStart + 300, -5)
  add([bus.x, bus.z], 14, 90)
  const bins = new Map<string, { q: number; r: number; n: number }>()
  for (const [x, z] of events) {
    const [q, rr] = hexKey(x, z)
    const k = `${q},${rr}`
    const b = bins.get(k) ?? { q, r: rr, n: 0 }
    b.n++
    bins.set(k, b)
  }
  return [...bins.values()].filter((b) => b.n >= 3)
}

export function NearMissHeat({ world }: { world: World }) {
  const bins = useMemo(() => nearMissBins(world), [world])
  const max = useMemo(() => Math.max(...bins.map((b) => b.n)), [bins])
  const top = useMemo(() => [...bins].sort((a, b) => b.n - a.n)[0], [bins])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const grow = useRef(0)
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(HEX * 0.92, HEX * 0.92, 1, 6, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const colors = useMemo(() => {
    const lo = new THREE.Color('#d19a1c')
    const hi = new THREE.Color('#e0401f')
    return bins.map((b) => lo.clone().lerp(hi, Math.pow(b.n / max, 0.7)))
  }, [bins, max])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m || grow.current >= 1) return
    grow.current = Math.min(1, grow.current + dt * 0.8)
    const k = 1 - Math.pow(1 - grow.current, 3)
    bins.forEach((b, i) => {
      const [x, z] = hexCenter(b.q, b.r)
      tmp.position.set(x, 0.3, z)
      tmp.scale.set(1, Math.max(0.01, (4 + (b.n / max) * 70) * k), 1)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
      m.setColorAt(i, colors[i])
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  const [tx, tz] = hexCenter(top.q, top.r)
  return (
    <group>
      <instancedMesh ref={mesh} args={[geo, undefined, bins.length]} frustumCulled={false} castShadow>
        <meshStandardMaterial transparent opacity={0.82} roughness={0.5} emissive="#e0401f" emissiveIntensity={0.18} />
      </instancedMesh>
      <Html position={[tx, 82, tz]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap border-l-2 border-confirmed bg-clay/90 px-2 py-1 text-[11px] leading-tight text-ink">
          <span className="font-semibold">{top.n} harsh brakes in 30 days</span>
          <span className="block text-ink-3">Near-miss heat, synthetic</span>
        </div>
      </Html>
    </group>
  )
}
