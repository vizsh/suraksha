// What each scenario puts on the road, beyond vehicles and people: standing water, an open
// manhole, an unpainted speed breaker, crash debris. Each draws only where its scenario places it.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { World } from '../../world/scenario'

const time = { value: 0 }

/** A strip of the road surface between two offsets, from s0 to s1, at height y. */
function strip(world: World, s0: number, s1: number, off0: number, off1: number, y: number, step = 1.5) {
  const pos: number[] = []
  const uv: number[] = []
  const n = Math.max(2, Math.ceil((s1 - s0) / step))
  for (let i = 0; i < n; i++) {
    const a = s0 + ((s1 - s0) * i) / n
    const b = s0 + ((s1 - s0) * (i + 1)) / n
    const p = [world.path.at(a, off0), world.path.at(a, off1), world.path.at(b, off0), world.path.at(b, off1)]
    const u = [i / n, (i + 1) / n]
    pos.push(p[0].x, y, p[0].z, p[2].x, y, p[2].z, p[1].x, y, p[1].z, p[1].x, y, p[1].z, p[2].x, y, p[2].z, p[3].x, y, p[3].z)
    uv.push(u[0], 0, u[1], 0, u[0], 1, u[0], 1, u[1], 0, u[1], 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Ragged-edged puddle mask: the water's outline is not a rectangle. */
let puddleTex: THREE.CanvasTexture | null = null
function puddleMask() {
  if (puddleTex) return puddleTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 64)
  let seed = 3
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 70; k++) {
    const x = 18 + r() * 220
    const y = 10 + r() * 44
    const grd = g.createRadialGradient(x, y, 0, x, y, 14 + r() * 26)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.7, 'rgba(255,255,255,0.9)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 64)
  }
  puddleTex = new THREE.CanvasTexture(c)
  return puddleTex
}

function WaterOnRoad({ world, night }: { world: World; night: boolean }) {
  const w = world.marks.water!
  const geo = useMemo(() => strip(world, world.sStart + w.s0, world.sStart + w.s1, w.off0, w.off1, 0.17), [world, w])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      // muddy monsoon water: brown, a little reflective, never a clean blue
      color: night ? '#2a241b' : '#6b5a3e',
      roughness: 0.1,
      metalness: 0,
      envMapIntensity: 0.55,
      transparent: true,
      opacity: 0.9,
      alphaMap: puddleMask(),
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;\nuniform float uTime;').replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  // rain rings and a slow ripple on the standing water
  vec2 p = vRoadXZ;
  vec2 d = vec2(cos(p.x * 1.7 + uTime * 1.3), sin(p.y * 1.9 - uTime * 1.1)) * 0.03;
  vec2 cell = floor(p * 0.9);
  float ph = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 cp = (cell + 0.5) / 0.9;
  float ring = fract(uTime * 0.8 + ph);
  float dist = length(p - cp);
  float wave = sin((dist - ring * 0.6) * 40.0) * smoothstep(0.6, 0.0, abs(dist - ring * 0.6)) * (1.0 - ring);
  d += normalize(p - cp + 1e-4) * wave * 0.08;
  normal = normalize(normal + (viewMatrix * vec4(d.x, 0.0, d.y, 0.0)).xyz);`,
      )
    }
    m.customProgramCacheKey = () => 'road-water'
    return m
  }, [night])
  useFrame((s) => {
    time.value = s.clock.elapsedTime
  })
  return <mesh geometry={geo} material={material} renderOrder={2} />
}

function OpenManhole({ world }: { world: World }) {
  const m = world.marks.manhole!
  const p = world.path.at(world.sStart + m.s, m.off)
  return (
    <group position={[p.x, 0.06, p.z]}>
      {/* the shaft: a dark well with a lip; the lid lies beside it */}
      <mesh position-y={0.05} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.32, 0.42, 28]} />
        <meshStandardMaterial color="#3a3833" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position-y={0.049} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.33, 28]} />
        <meshBasicMaterial color="#020203" />
      </mesh>
      <mesh position={[0.75, 0.04, 0.35]} rotation={[0.1, 0.4, 0.06]}>
        <cylinderGeometry args={[0.36, 0.36, 0.04, 24]} />
        <meshStandardMaterial color="#2e2c28" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  )
}

let breakerTex: THREE.CanvasTexture | null = null
function breakerStripes() {
  if (breakerTex) return breakerTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 8
  const g = c.getContext('2d')!
  // the paint has worn almost entirely away: that is the hazard
  g.fillStyle = '#4b4945'
  g.fillRect(0, 0, 128, 8)
  for (let x = 0; x < 128; x += 32) {
    g.fillStyle = 'rgba(214,180,40,0.28)'
    g.fillRect(x, 0, 16, 8)
  }
  breakerTex = new THREE.CanvasTexture(c)
  breakerTex.colorSpace = THREE.SRGBColorSpace
  breakerTex.wrapS = THREE.RepeatWrapping
  return breakerTex
}

function SpeedBreaker({ world }: { world: World }) {
  const s = world.sStart + world.marks.speedBreaker!
  const p = world.path.at(s, 0)
  const w = world.halfWidth * 2
  return (
    <mesh position={[p.x, 0.04, p.z]} rotation-y={p.heading} scale={[w, 1, 1]} receiveShadow castShadow>
      {/* a low hump across the road: a flattened half-cylinder */}
      <cylinderGeometry args={[0.5, 0.5, 1, 18, 1, false, 0, Math.PI]} />
      <meshStandardMaterial map={breakerStripes()} roughness={0.85} />
    </mesh>
  )
}

function CrashDebris({ world }: { world: World }) {
  const s = world.sStart + world.marks.debris!
  const pieces = useMemo(() => {
    const out: { x: number; z: number; r: number; w: number; l: number; glass: boolean }[] = []
    let seed = 17
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 26; i++) {
      const p = world.path.at(s + (r() - 0.5) * 6, 0.4 + (r() - 0.5) * 4)
      out.push({ x: p.x, z: p.z, r: r() * Math.PI, w: 0.08 + r() * 0.2, l: 0.1 + r() * 0.3, glass: i > 3 })
    }
    return out
  }, [world, s])
  const bumper = world.path.at(s + 1.5, -0.4)
  return (
    <group>
      {pieces.map((q, i) => (
        <mesh key={i} position={[q.x, 0.07, q.z]} rotation={[-Math.PI / 2, 0, q.r]}>
          <planeGeometry args={[q.w, q.l]} />
          <meshStandardMaterial color={q.glass ? '#cfe3ea' : '#2a2a2a'} roughness={q.glass ? 0.05 : 0.6} metalness={q.glass ? 0.3 : 0.1} transparent={q.glass} opacity={q.glass ? 0.7 : 1} />
        </mesh>
      ))}
      <mesh position={[bumper.x, 0.18, bumper.z]} rotation={[0, bumper.heading + 0.7, 0.2]} castShadow>
        <boxGeometry args={[1.5, 0.28, 0.22]} />
        <meshStandardMaterial color="#8c2f24" roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  )
}

export function Hazards({ world, night }: { world: World; night: boolean }) {
  const m = world.marks
  return (
    <group>
      {m.water && <WaterOnRoad world={world} night={night} />}
      {m.manhole && <OpenManhole world={world} />}
      {m.speedBreaker !== undefined && <SpeedBreaker world={world} />}
      {m.debris !== undefined && world.scenario.id === 'asm-crash' && <CrashDebris world={world} />}
    </group>
  )
}
