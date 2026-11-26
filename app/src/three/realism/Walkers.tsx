// Animated people (CesiumMan, CC-BY 4.0 Cesium). The person behind the bus is the scenario's
// pedestrian; once the network knows about them, a ghost of the same walking figure is drawn
// through whatever hides them, in the threat's colour. Others walk the footpaths for life.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { BUS_S, PED_T0, sampleAgents, type World } from '../../world/scenario'
import { shelterSpots } from './Shelters'
import { simTime } from '../../world/clock'
import { useSim } from '../../world/store'

const URL = '/assets/models/walker.glb'
const TARGET_H = 1.68
const STATE_COLOR: Record<string, string> = { confirmed: '#e0401f', potential: '#d19a1c', noticed: '#d19a1c' }
// CesiumMan walks toward its own +Z. At normal speed its planted foot moves back at 0.745 model
// units/s, 0.83 m/s at our scale: the playback rate that keeps feet planted is speed / 0.83.
const STRIDE_MPS = (0.745 * TARGET_H) / 1.51
// clip time with both feet closest to the ground: used as the standing pose
const STAND_T = 1.61

/** Advance the walk cycle so the feet match ground speed; hold a standing pose when still. */
function stride(w: { mixer: THREE.AnimationMixer; action: THREE.AnimationAction | null }, speed: number, dt: number) {
  if (!w.action) return
  if (speed < 0.08) {
    w.action.time = STAND_T
    w.mixer.update(0)
    return
  }
  w.mixer.timeScale = speed / STRIDE_MPS
  w.mixer.update(dt)
}

const _qw = new THREE.Quaternion()
const _qp = new THREE.Quaternion()
const _qy = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)
/** Turn the head about the vertical (positive: toward the person's left). Apply after the mixer. */
function lookYaw(neck: THREE.Object3D | undefined, yaw: number) {
  if (!neck?.parent || Math.abs(yaw) < 1e-3) return
  neck.parent.updateWorldMatrix(true, false)
  neck.updateMatrixWorld()
  neck.getWorldQuaternion(_qw)
  neck.parent.getWorldQuaternion(_qp)
  _qy.setFromAxisAngle(UP, yaw).multiply(_qw)
  neck.quaternion.copy(_qp.invert().multiply(_qy))
}
const ease = (x: number) => x * x * (3 - 2 * x)

// Clothes instead of the model's texture (which carries Cesium's logo and suit). The mesh stands
// Z-up in its own units, 1.51 tall, arms out to the sides along y: regions are picked by height,
// plus distance from the centreline for hands. One shader program for every walker.
const SKIN = ['#8d5a3b', '#a86b45', '#6e4530', '#b77b52', '#9b6442', '#c48a5f']
const PANTS = ['#2b3140', '#3a3328', '#1d1f22', '#5b5446', '#2e3b52', '#4a4038']
function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}
function clothes(shirt: string, seed: string) {
  const pick = <T,>(a: T[], k: string) => a[Math.floor(hashStr(seed + k) * a.length)]
  const u = {
    uSkin: { value: new THREE.Color(pick(SKIN, 's')) },
    uShirt: { value: new THREE.Color(shirt) },
    uPants: { value: new THREE.Color(pick(PANTS, 'p')) },
    uHair: { value: new THREE.Color('#15110e') },
    uShoe: { value: new THREE.Color(hashStr(seed + 'f') < 0.5 ? '#2a221c' : '#6b5a48') },
  }
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vRaw;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRaw = position;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRaw;
uniform vec3 uSkin, uShirt, uPants, uHair, uShoe;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float z = vRaw.z;
  vec3 c = uShoe;
  if (z > 0.085) c = uPants;
  if (z > 0.70) c = uShirt;
  if (abs(vRaw.y) > 0.40 && z > 0.9) c = uSkin;
  if (z > 1.15) c = uSkin;
  if (z > 1.45 || (z > 1.33 && vRaw.x < -0.02)) c = uHair;
  diffuseColor.rgb = c;`,
      )
  }
  m.customProgramCacheKey = () => 'walker-clothes'
  return m
}

function useWalker(tint?: string, ghost = false, height = TARGET_H) {
  const gltf = useGLTF(URL)
  return useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Group
    // CesiumMan's mesh is 1.51 m tall in its own units (bounding boxes of a skinned clone are unreliable)
    root.scale.setScalar(height / 1.51)
    const ghostMat = ghost ? new THREE.MeshBasicMaterial({ color: '#e0401f', transparent: true, opacity: 0.85, depthTest: false }) : null
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (!m.isMesh) return
      m.castShadow = !ghost
      m.frustumCulled = false
      if (ghostMat) {
        m.material = ghostMat
        m.renderOrder = 45
      } else {
        m.material = clothes(tint ?? '#d7c6a6', `${tint}-${height}`)
      }
    })
    const holder = new THREE.Group()
    holder.add(root)
    const mixer = new THREE.AnimationMixer(root)
    const action = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]).play() : null
    const neck = root.getObjectByName('Skeleton_neck_joint_1') ?? undefined
    return { holder, mixer, action, ghostMat, neck }
  }, [gltf, tint, ghost, height])
}

/** The scenario pedestrian, plus their X-ray ghost. */
function KeyPedestrian({ world, xray }: { world: World; xray: boolean }) {
  const body = useWalker('#d7c6a6')
  const ghost = useWalker(undefined, true)
  useFrame((_, dt) => {
    const t = simTime()
    const p = sampleAgents(world, t).find((a) => a.id === 'ped')
    // crossing speed from the scripted path, in metres per scenario second
    const q = p && sampleAgents(world, t + 0.1).find((a) => a.id === 'ped')
    const speed = p && q ? Math.hypot(q.x - p.x, q.z - p.z) / 0.1 : 0
    const th = useSim.getState().threats.find((x) => x.kind === 'pedestrian' && x.state !== 'resolved')
    for (const w of [body, ghost]) {
      w.holder.visible = !!p
      if (!p) continue
      w.holder.position.set(p.x, 0.15, p.z)
      // facing across the carriageway, from the kerb toward the median: the path's right-hand
      // normal (-dz, dx) is (sin, cos) of heading - 90 degrees
      w.holder.rotation.y = p.heading - Math.PI / 2
      stride(w, speed, dt)
      // at the kerb: look right (traffic in the near lanes comes from the right), then left, then go
      const k = t - (PED_T0 - 2)
      const yaw = k < 0 || k > 2 ? 0 : k < 0.7 ? -1.0 * ease(k / 0.7) : k < 1.4 ? -1.0 + 1.9 * ease((k - 0.7) / 0.7) : 0.9 * (1 - ease((k - 1.4) / 0.6))
      lookYaw(w.neck, yaw)
    }
    ghost.holder.visible = !!p && xray && !!th
    if (th && ghost.ghostMat) ghost.ghostMat.color.set(STATE_COLOR[th.state] ?? '#e0401f')
  })
  return (
    <>
      <primitive object={body.holder} />
      <primitive object={ghost.holder} />
    </>
  )
}

/** A few people walking the footpaths of JVLR, back and forth. */
function Ambient({ world, n = 8 }: { world: World; n?: number }) {
  const tints = ['#3d4a5c', '#8c3b2f', '#e6e1d6', '#2f5d50', '#6b5a7a', '#c78f3d', '#33373c', '#9fa7ad']
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <AmbientOne key={i} world={world} i={i} tint={tints[i % tints.length]} />
      ))}
    </>
  )
}

function AmbientOne({ world, i, tint }: { world: World; i: number; tint: string }) {
  const w = useWalker(tint)
  const speed = 1.1 + (i % 3) * 0.15
  const side = i % 2 ? 1 : -1
  const s0 = world.sStart + 40 + i * 62
  const dir = i % 3 === 0 ? -1 : 1
  useFrame((_, dt) => {
    const t = simTime()
    const s = s0 + dir * speed * t
    const p = world.path.at(s, side * 9.1)
    w.holder.position.set(p.x, 0.15, p.z)
    w.holder.rotation.y = p.heading + (dir > 0 ? 0 : Math.PI)
    stride(w, speed, dt)
  })
  return <primitive object={w.holder} />
}

/** People waiting at the bus shelters nearest the story, glancing up the road for their bus. */
function Waiting({ world }: { world: World }) {
  const people = useMemo(() => {
    const bus = world.path.at(world.sStart + BUS_S, 0)
    const [fx, fz] = [bus.x, bus.z]
    const tints = ['#7a3b52', '#2f4f6b', '#d8cfbd', '#4f6b3a', '#a2552c', '#3e3a46', '#c9a14a', '#5b6f7c']
    const out: { x: number; z: number; yaw: number; tint: string; h: number; seed: number }[] = []
    shelterSpots(world)
      .map((s) => ({ s, d: Math.hypot(s.x - fx, s.z - fz) }))
      .filter((q) => q.d < 900)
      .sort((a, b) => a.d - b.d)
      .slice(0, 7)
      .forEach(({ s }, i) => {
        const n = i % 3 === 2 ? 1 : 2
        for (let k = 0; k < n; k++) {
          const lx = k === 0 ? -1.1 + (i % 2) * 0.5 : 1.0
          const lz = 0.25
          const c = Math.cos(s.yaw)
          const sn = Math.sin(s.yaw)
          // shelter local (lx, lz) to world: +z is the open front
          out.push({ x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c, yaw: s.yaw + (k ? -0.5 : 0.35), tint: tints[(i * 2 + k) % tints.length], h: 1.56 + ((i * 3 + k * 5) % 7) * 0.04, seed: i * 2 + k })
        }
      })
    return out
  }, [world])
  return (
    <>
      {people.map((p) => (
        <Stander key={p.seed} {...p} />
      ))}
    </>
  )
}

function Stander({ x, z, yaw, tint, h, seed }: { x: number; z: number; yaw: number; tint: string; h: number; seed: number }) {
  const w = useWalker(tint, false, h)
  useFrame((st) => {
    w.holder.position.set(x, 0.15, z)
    w.holder.rotation.y = yaw
    stride(w, 0, 0)
    // a slow glance up the road every few seconds, different for each person
    const t = st.clock.elapsedTime * 0.35 + seed * 1.9
    const glance = Math.max(0, Math.sin(t)) ** 3
    lookYaw(w.neck, (seed % 2 ? 0.8 : -0.8) * glance + Math.sin(t * 0.5) * 0.12)
  })
  return <primitive object={w.holder} />
}

export function Walkers({ world, xray, ambient = true }: { world: World; xray: boolean; ambient?: boolean }) {
  return (
    <group>
      <KeyPedestrian world={world} xray={xray} />
      {ambient && <Ambient world={world} />}
      {ambient && <Waiting world={world} />}
    </group>
  )
}

useGLTF.preload(URL)
