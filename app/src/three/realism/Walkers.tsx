// Animated people (CesiumMan, CC-BY 4.0 Cesium). The person behind the bus is the scenario's
// pedestrian; once the network knows about them, a ghost of the same walking figure is drawn
// through whatever hides them, in the threat's colour. Others walk the footpaths for life.
import { useEffect, useMemo } from 'react'
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
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play()
    return { holder, mixer, ghostMat }
  }, [gltf, tint, ghost])
}

/** The scenario pedestrian, plus their X-ray ghost. */
function KeyPedestrian({ world, xray }: { world: World; xray: boolean }) {
  const body = useWalker('#d7c6a6')
  const ghost = useWalker(undefined, true)
  useFrame((_, dt) => {
    const p = sampleAgents(world, simTime()).find((a) => a.id === 'ped')
    const th = useSim.getState().threats.find((x) => x.kind === 'pedestrian' && x.state !== 'resolved')
    for (const w of [body, ghost]) {
      w.holder.visible = !!p
      if (!p) continue
      w.holder.position.set(p.x, 0.15, p.z)
      // walking across the carriageway, from the kerb toward the median
      w.holder.rotation.y = p.heading + Math.PI / 2
      w.mixer.update(dt)
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
  useEffect(() => {
    w.mixer.timeScale = speed / 1.2
  }, [w, speed])
  useFrame((_, dt) => {
    const t = simTime()
    const s = s0 + dir * speed * t
    const p = world.path.at(s, side * 9.1)
    w.holder.position.set(p.x, 0.15, p.z)
    w.holder.rotation.y = p.heading + (dir > 0 ? 0 : Math.PI)
    w.mixer.update(dt)
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
