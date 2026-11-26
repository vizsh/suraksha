// Animated people (CesiumMan, CC-BY 4.0 Cesium). The person behind the bus is the scenario's
// pedestrian; once the network knows about them, a ghost of the same walking figure is drawn
// through whatever hides them, in the threat's colour. Others walk the footpaths for life.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { sampleAgents, type World } from '../../world/scenario'
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

function useWalker(tint?: string, ghost = false) {
  const gltf = useGLTF(URL)
  return useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Group
    // CesiumMan's mesh is 1.51 m tall in its own units (bounding boxes of a skinned clone are unreliable)
    root.scale.setScalar(TARGET_H / 1.51)
    const ghostMat = ghost ? new THREE.MeshBasicMaterial({ color: '#e0401f', transparent: true, opacity: 0.85, depthTest: false }) : null
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (!m.isMesh) return
      m.castShadow = !ghost
      m.frustumCulled = false
      if (ghostMat) {
        m.material = ghostMat
        m.renderOrder = 45
      } else if (tint) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        mat.color.set(tint)
        m.material = mat
      }
    })
    const holder = new THREE.Group()
    holder.add(root)
    const mixer = new THREE.AnimationMixer(root)
    const action = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]).play() : null
    return { holder, mixer, action, ghostMat }
  }, [gltf, tint, ghost])
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

export function Walkers({ world, xray, ambient = true }: { world: World; xray: boolean; ambient?: boolean }) {
  return (
    <group>
      <KeyPedestrian world={world} xray={xray} />
      {ambient && <Ambient world={world} />}
    </group>
  )
}

useGLTF.preload(URL)
