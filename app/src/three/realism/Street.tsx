// Street detail: textured roads and footpaths, lamps with light pools, roadside trees,
// the overnight barricade set and the monsoon pothole.
import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { World } from '../../world/scenario'
import { BARRICADE_S, POTHOLE_S } from '../../world/scenario'
import { onAnyRoad, roadsidePoints } from '../geometry'

// ---------- PBR surfaces (Poly Haven, CC0) ----------

function useSurface(name: 'asphalt' | 'pavers' | 'concrete' | 'metal', repeat = 1) {
  const t = useTexture({
    map: `/assets/tex/${name}_diff.jpg`,
    normalMap: `/assets/tex/${name}_nor.jpg`,
    aoMap: `/assets/tex/${name}_arm.jpg`,
  })
  return useMemo(() => {
    for (const k of ['map', 'normalMap', 'aoMap'] as const) {
      const tex = t[k]
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(repeat, repeat)
      tex.anisotropy = 8
      if (k === 'map') tex.colorSpace = THREE.SRGBColorSpace
    }
    return t
  }, [t, repeat])
}

export function useSurfaceMaterials(night: boolean) {
  const asphalt = useSurface('asphalt')
  const pavers = useSurface('pavers', 1)
  const concrete = useSurface('concrete')
  return useMemo(
    () => ({
      // wet at night: lower roughness so lamps and headlights glint off the road
      road: new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...asphalt, roughness: night ? 0.42 : 0.92, color: night ? '#6f7478' : '#a6a39e', normalScale: new THREE.Vector2(0.6, 0.6) }),
      minor: new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...asphalt, roughness: night ? 0.5 : 0.95, color: night ? '#5f6366' : '#b4b0a8' }),
      foot: new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, ...pavers, roughness: 0.85, color: night ? '#7c7a76' : '#d8d2c8' }),
      kerb: new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...concrete, roughness: 0.8, color: night ? '#9a9a94' : '#e9e6df' }),
    }),
    [asphalt, pavers, concrete, night],
  )
}

// ---------- Lamps and light pools ----------

function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 9, 10).translate(0, 4.5, 0)
  const arm = new THREE.BoxGeometry(0.08, 0.08, 2.2).translate(0, 8.9, 1.05)
  return mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()])!
}

let poolTex: THREE.CanvasTexture | null = null
function lightPoolTexture() {
  if (poolTex) return poolTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,214,150,0.9)')
  grd.addColorStop(0.35, 'rgba(255,190,120,0.38)')
  grd.addColorStop(1, 'rgba(255,170,90,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  poolTex = new THREE.CanvasTexture(c)
  return poolTex
}

export function Lamps({ world, night }: { world: World; night: boolean }) {
  const pts = useMemo(() => roadsidePoints(world.data, 34, 0.7, 3).filter((p) => !onAnyRoad(world.data, p.x, p.z, 0.2)), [world])
  const { poles, heads, pools } = useMemo(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const poles: THREE.Matrix4[] = []
    const heads: THREE.Matrix4[] = []
    const pools: THREE.Matrix4[] = []
    for (const p of pts) {
      // arm points toward the carriageway
      e.set(0, p.heading + (p.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0)
      q.setFromEuler(e)
      poles.push(m.clone().compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1)))
      const dir = new THREE.Vector3(0, 0, 2.1).applyQuaternion(q)
      heads.push(m.clone().compose(new THREE.Vector3(p.x + dir.x, 8.82, p.z + dir.z), q, new THREE.Vector3(1, 1, 1)))
      pools.push(m.clone().compose(new THREE.Vector3(p.x + dir.x * 1.4, 0.18, p.z + dir.z * 1.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)))
    }
    return { poles, heads, pools }
  }, [pts])
  const lampGeo = useMemo(() => lampGeometry(), [])
  const headGeo = useMemo(() => new THREE.BoxGeometry(0.42, 0.14, 0.75), [])
  const poolGeo = useMemo(() => new THREE.PlaneGeometry(17, 17), [])
  const set = (r: THREE.InstancedMesh | null, ms: THREE.Matrix4[]) => {
    if (!r) return
    ms.forEach((mm, i) => r.setMatrixAt(i, mm))
    r.count = ms.length
    r.instanceMatrix.needsUpdate = true
  }
  return (
    <group>
      <instancedMesh ref={(r) => set(r, poles)} args={[lampGeo, undefined, poles.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#5c6166" metalness={0.7} roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={(r) => set(r, heads)} args={[headGeo, undefined, heads.length]} frustumCulled={false}>
        <meshStandardMaterial color="#d9d4c7" emissive="#ffcf8a" emissiveIntensity={night ? 9 : 0} />
      </instancedMesh>
      {night && (
        <instancedMesh ref={(r) => set(r, pools)} args={[poolGeo, undefined, pools.length]} frustumCulled={false} renderOrder={2}>
          <meshBasicMaterial map={lightPoolTexture()} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.75} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  )
}

// ---------- Trees ----------

function pointInPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function Trees({ world, night }: { world: World; night: boolean }) {
  const pts = useMemo(() => {
    const raw = roadsidePoints(world.data, 13, 4.2, 7)
    return raw.filter((p) => !onAnyRoad(world.data, p.x, p.z, 2.2) && !world.data.buildings.some((b) => pointInPoly(p.x, p.z, b.pts as [number, number][])))
  }, [world])
  const { trunk, crown } = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.4, 7).translate(0, 1.7, 0)
    const a = new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.6, 0)
    const b = new THREE.IcosahedronGeometry(1.8, 1).translate(1.1, 5.4, 0.4)
    const c = new THREE.IcosahedronGeometry(1.7, 1).translate(-0.9, 5.2, -0.6)
    const crown = mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()])!
    // jitter vertices so the crowns read as foliage, not polyhedra
    const p = crown.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.5 + 0.5) * 0.18
      p.setXYZ(i, p.getX(i) * k, 4.6 + (p.getY(i) - 4.6) * k, p.getZ(i) * k)
    }
    crown.computeVertexNormals()
    return { trunk, crown }
  }, [])
  const setup = (r: THREE.InstancedMesh | null, colored: boolean) => {
    if (!r) return
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    pts.forEach((p, i) => {
      const s = 0.8 + ((i * 37) % 10) / 22
      m.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3(s, s, s))
      r.setMatrixAt(i, m)
      if (colored) r.setColorAt(i, c.setHSL(0.25 + ((i * 13) % 10) / 160, 0.45, night ? 0.06 : 0.13 + ((i * 7) % 10) / 160))
    })
    r.count = pts.length
    r.instanceMatrix.needsUpdate = true
    if (r.instanceColor) r.instanceColor.needsUpdate = true
  }
  return (
    <group>
      <instancedMesh ref={(r) => setup(r, false)} args={[trunk, undefined, pts.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#4a3b2e" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={(r) => setup(r, true)} args={[crown, undefined, pts.length]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

// ---------- The overnight barricade set ----------

let stripeTex: THREE.CanvasTexture | null = null
function stripes() {
  if (stripeTex) return stripeTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  for (let i = -2; i < 12; i++) {
    g.fillStyle = i % 2 ? '#f4f1ea' : '#e0401f'
    g.beginPath()
    g.moveTo(i * 32, 64)
    g.lineTo(i * 32 + 32, 64)
    g.lineTo(i * 32 + 64, 0)
    g.lineTo(i * 32 + 32, 0)
    g.fill()
  }
  stripeTex = new THREE.CanvasTexture(c)
  stripeTex.colorSpace = THREE.SRGBColorSpace
  return stripeTex
}

export function BarricadeSet({ world, night }: { world: World; night: boolean }) {
  const metal = useSurface('metal')
  const items = useMemo(() => {
    const out: { kind: 'water' | 'frame' | 'cone'; x: number; z: number; h: number }[] = []
    const base = world.sStart + BARRICADE_S
    // water-filled barriers closing lane 1 on a diagonal, a metal frame barricade, cones leading in
    for (let i = 0; i < 4; i++) {
      const p = world.path.at(base - 1 + i * 2.1, -5.4 + i * 0.75)
      out.push({ kind: 'water', x: p.x, z: p.z, h: p.heading })
    }
    const f = world.path.at(base + 7, -4.2)
    out.push({ kind: 'frame', x: f.x, z: f.z, h: f.heading })
    for (let i = 0; i < 5; i++) {
      const p = world.path.at(base - 16 + i * 3.2, -5.6 + i * 0.5)
      out.push({ kind: 'cone', x: p.x, z: p.z, h: p.heading })
    }
    return out
  }, [world])
  const glow = night ? 0.5 : 0
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, 0.05, it.z]} rotation={[0, it.h + (it.kind === 'cone' ? 0 : 0.35), 0]}>
          {it.kind === 'water' && (
            <mesh castShadow position={[0, 0.5, 0]}>
              <boxGeometry args={[0.55, 1.0, 1.95]} />
              <meshPhysicalMaterial color={i % 2 ? '#f2eee6' : '#e0401f'} roughness={0.45} clearcoat={0.5} emissive={i % 2 ? '#000000' : '#e0401f'} emissiveIntensity={glow * 0.3} />
            </mesh>
          )}
          {it.kind === 'frame' && (
            <group>
              {[-0.9, 0.9].map((x) => (
                <mesh key={x} castShadow position={[x, 0.55, 0]}>
                  <boxGeometry args={[0.06, 1.1, 0.06]} />
                  <meshStandardMaterial {...metal} color="#9aa0a4" metalness={0.8} roughness={0.4} />
                </mesh>
              ))}
              <mesh castShadow position={[0, 0.92, 0]}>
                <boxGeometry args={[2.0, 0.32, 0.04]} />
                <meshStandardMaterial map={stripes()} roughness={0.4} emissive="#ffffff" emissiveMap={stripes()} emissiveIntensity={night ? 0.9 : 0} />
              </mesh>
              <mesh position={[0, 0.25, 0]}>
                <boxGeometry args={[1.9, 0.05, 0.05]} />
                <meshStandardMaterial {...metal} color="#9aa0a4" metalness={0.8} roughness={0.4} />
              </mesh>
            </group>
          )}
          {it.kind === 'cone' && (
            <group>
              <mesh castShadow position={[0, 0.38, 0]}>
                <coneGeometry args={[0.2, 0.72, 18]} />
                <meshStandardMaterial color="#ef4a1f" roughness={0.55} />
              </mesh>
              <mesh position={[0, 0.42, 0]}>
                <cylinderGeometry args={[0.105, 0.135, 0.12, 18, 1, true]} />
                <meshStandardMaterial color="#f4f4f0" emissive="#ffffff" emissiveIntensity={night ? 1.2 : 0} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, 0.025, 0]}>
                <boxGeometry args={[0.46, 0.05, 0.46]} />
                <meshStandardMaterial color="#222" roughness={0.9} />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  )
}

// ---------- The monsoon pothole ----------

function potholeGeometry(r: number, seed: number) {
  const shape = new THREE.Shape()
  const n = 28
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = r * (0.78 + 0.22 * Math.sin(a * 3 + seed) * Math.cos(a * 5 - seed * 2))
    const x = Math.cos(a) * k * 1.3
    const y = Math.sin(a) * k
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const g = new THREE.ShapeGeometry(shape, 8)
  g.rotateX(-Math.PI / 2)
  return g
}

export function Pothole({ world }: { world: World }) {
  const p = useMemo(() => world.path.at(world.sStart + POTHOLE_S, 0), [world])
  const rim = useMemo(() => potholeGeometry(0.85, 1.3), [])
  const hole = useMemo(() => potholeGeometry(0.66, 1.3), [])
  const water = useMemo(() => potholeGeometry(0.5, 2.1), [])
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, p.heading, 0]}>
      <mesh geometry={rim} position={[0, 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#3d3a36" roughness={1} />
      </mesh>
      <mesh geometry={hole} position={[0, 0.105, 0]}>
        <meshStandardMaterial color="#1f1d1b" roughness={1} />
      </mesh>
      <mesh geometry={water} position={[0.08, 0.11, 0.05]}>
        <meshPhysicalMaterial color="#2c3134" roughness={0.04} metalness={0.2} clearcoat={1} />
      </mesh>
      {/* loose gravel around the edge */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[Math.cos(i * 2.3) * (1.1 + (i % 3) * 0.15), 0.12, Math.sin(i * 2.3) * (0.85 + (i % 4) * 0.1)]} rotation={[i, i * 2, 0]}>
          <dodecahedronGeometry args={[0.04 + (i % 3) * 0.015, 0]} />
          <meshStandardMaterial color="#4a4640" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
