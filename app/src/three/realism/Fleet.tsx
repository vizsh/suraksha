// Every vehicle in the scenario, drawn with the procedural models: one instanced mesh per part
// per model, all sharing the same per-vehicle matrices. Connected cars carry a survey-blue
// ground ring; the ego car a stronger one.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sampleAgents, type Agent, type World } from '../../world/scenario'
import { simTime } from '../../world/clock'
import { PAINTS, TAIL_CRUISE, makeMaterials, vehicleModels, type PartKind, type VariantKey } from './vehicles'

const MAX: Record<VariantKey, number> = { hatch: 40, sedan: 30, suv: 24, bus: 4, auto: 20, bike: 20, cow: 6, cowLying: 6 }
const BEST_RED = '#c8261f'

function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function variantOf(a: Agent): VariantKey | null {
  if (a.kind === 'bus') return 'bus'
  if (a.kind === 'auto') return 'auto'
  if (a.kind === 'bike') return 'bike'
  if (a.kind === 'cow') return a.lying ? 'cowLying' : 'cow'
  if (a.kind !== 'car') return null
  if (a.role === 'ego') return 'hatch'
  const h = hashStr(a.id)
  return h < 0.45 ? 'hatch' : h < 0.75 ? 'sedan' : 'suv'
}

export function Fleet({ world, night = false, rings = true, hide }: { world: World; night?: boolean; rings?: boolean; hide?: string }) {
  const models = useMemo(() => vehicleModels(), [])
  const mats = useMemo(() => makeMaterials(night), [night])
  const refs = useRef<Partial<Record<`${VariantKey}:${PartKind}`, THREE.InstancedMesh>>>({})
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  const ringGeo = useMemo(() => {
    const g = new THREE.RingGeometry(2.6, 3.1, 40)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useFrame(() => {
    const agents = sampleAgents(world, simTime())
    const counts: Partial<Record<VariantKey, number>> = {}
    let rc = 0
    for (const a of agents) {
      const v = variantOf(a)
      if (!v || a.id === hide) continue
      const i = counts[v] ?? 0
      if (i >= MAX[v]) continue
      counts[v] = i + 1
      tmp.position.set(a.x, 0.02, a.z)
      tmp.rotation.set(0, a.heading, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      const paint = a.paint ?? (v === 'bus' ? BEST_RED : a.role === 'ego' ? '#d9dde0' : PAINTS[Math.floor(hashStr(a.id + 'p') * PAINTS.length)])
      for (const part of Object.keys(models[v]) as PartKind[]) {
        const m = refs.current[`${v}:${part}`]
        if (!m) continue
        m.setMatrixAt(i, tmp.matrix)
        if (part === 'paint' || part === 'hide') m.setColorAt(i, col.set(paint))
        else if (part === 'tail') m.setColorAt(i, col.setScalar(a.brake ? 1 : TAIL_CRUISE))
      }
      if (rings && a.connected && ringRef.current && rc < 64) {
        tmp.position.y = 0.12
        tmp.scale.setScalar(a.role === 'ego' ? 1.25 : 1)
        tmp.updateMatrix()
        ringRef.current.setMatrixAt(rc, tmp.matrix)
        ringRef.current.setColorAt(rc, col.set(a.role === 'ego' ? '#1f6fb2' : '#5d9bd0'))
        rc++
      }
    }
    for (const v of Object.keys(models) as VariantKey[]) {
      for (const part of Object.keys(models[v]) as PartKind[]) {
        const m = refs.current[`${v}:${part}`]
        if (!m) continue
        m.count = counts[v] ?? 0
        m.instanceMatrix.needsUpdate = true
        if (m.instanceColor) m.instanceColor.needsUpdate = true
      }
    }
    if (ringRef.current) {
      ringRef.current.count = rc
      ringRef.current.instanceMatrix.needsUpdate = true
      if (ringRef.current.instanceColor) ringRef.current.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      {(Object.keys(models) as VariantKey[]).flatMap((v) =>
        (Object.entries(models[v]) as [PartKind, THREE.BufferGeometry][]).map(([part, geo]) => (
          <instancedMesh
            key={`${v}:${part}`}
            ref={(r) => {
              if (!r) return
              refs.current[`${v}:${part}`] = r
              // per-instance colour from the start, so the shader is compiled with it before the first frame
              if ((part === 'paint' || part === 'tail' || part === 'hide') && !r.instanceColor) r.setColorAt(0, new THREE.Color(1, 1, 1))
            }}
            args={[geo, mats[part], MAX[v]]}
            castShadow={part === 'paint' || part === 'trim' || part === 'accent'}
            receiveShadow={part === 'paint'}
            frustumCulled={false}
          />
        )),
      )}
      {rings && (
        <instancedMesh ref={ringRef} args={[ringGeo, undefined, 64]} frustumCulled={false} renderOrder={5}>
          <meshBasicMaterial transparent opacity={0.85} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  )
}
