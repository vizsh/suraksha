// Road wear on JVLR where the camera goes: asphalt patches, tar seams across the carriageway,
// manhole covers and oil stains down the lane centres. One generated atlas, four instanced decal
// sets laid just above the asphalt and under the lane paint. Kept clear of the scripted pothole.
import { useMemo } from 'react'
import * as THREE from 'three'
import type { World } from '../../world/scenario'

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

type Kind = 'patch' | 'seam' | 'manhole' | 'stain'
const KINDS: Kind[] = ['patch', 'seam', 'manhole', 'stain']

let atlas: THREE.CanvasTexture | null = null
function wearAtlas() {
  if (atlas) return atlas
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  const r = rng(5)
  // 0: patch, a newer, darker rectangle of asphalt with a ragged sealed edge
  g.save()
  g.translate(0, 0)
  g.fillStyle = 'rgba(28,29,31,0.72)'
  g.beginPath()
  g.moveTo(22, 30)
  for (let x = 22; x <= 234; x += 12) g.lineTo(x, 26 + r() * 10)
  for (let y = 30; y <= 226; y += 12) g.lineTo(230 + r() * 10, y)
  for (let x = 234; x >= 22; x -= 12) g.lineTo(x, 222 + r() * 10)
  for (let y = 226; y >= 30; y -= 12) g.lineTo(18 + r() * 10, y)
  g.fill()
  g.strokeStyle = 'rgba(12,12,13,0.8)'
  g.lineWidth = 5
  g.stroke()
  for (let k = 0; k < 400; k++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '70,70,72' : '18,18,20'},${0.15 + r() * 0.2})`
    g.fillRect(30 + r() * 196, 36 + r() * 184, 2, 2)
  }
  g.restore()
  // 1: seam, a black tar line with a wobble, across the cell
  g.save()
  g.translate(256, 0)
  g.strokeStyle = 'rgba(10,10,11,0.85)'
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(128 + (r() - 0.5) * 10, 0)
  for (let y = 0; y <= 256; y += 16) g.lineTo(128 + (r() - 0.5) * 14, y)
  g.stroke()
  g.lineWidth = 2
  g.strokeStyle = 'rgba(10,10,11,0.5)'
  g.beginPath()
  g.moveTo(140, 60)
  g.lineTo(170, 90)
  g.lineTo(178, 130)
  g.stroke()
  g.restore()
  // 2: manhole cover, cast iron with a ring and a cross-hatch
  g.save()
  g.translate(512 + 128, 128)
  g.fillStyle = '#2b2a28'
  g.beginPath()
  g.arc(0, 0, 118, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#4a4741'
  g.beginPath()
  g.arc(0, 0, 104, 0, Math.PI * 2)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(0, 0, 100, 0, Math.PI * 2)
  g.clip()
  g.strokeStyle = '#34322e'
  g.lineWidth = 6
  for (let k = -110; k <= 110; k += 22) {
    g.beginPath()
    g.moveTo(k, -110)
    g.lineTo(k, 110)
    g.stroke()
    g.beginPath()
    g.moveTo(-110, k)
    g.lineTo(110, k)
    g.stroke()
  }
  g.restore()
  g.strokeStyle = '#1d1c1a'
  g.lineWidth = 8
  g.beginPath()
  g.arc(0, 0, 112, 0, Math.PI * 2)
  g.stroke()
  g.restore()
  // 3: oil stain, a soft dark smear
  g.save()
  g.translate(768 + 128, 128)
  for (let k = 0; k < 14; k++) {
    const grd = g.createRadialGradient((r() - 0.5) * 70, (r() - 0.5) * 120, 0, (r() - 0.5) * 70, (r() - 0.5) * 120, 40 + r() * 50)
    grd.addColorStop(0, 'rgba(8,8,10,0.28)')
    grd.addColorStop(1, 'rgba(8,8,10,0)')
    g.fillStyle = grd
    g.fillRect(-128, -128, 256, 256)
  }
  g.restore()
  atlas = new THREE.CanvasTexture(c)
  atlas.colorSpace = THREE.SRGBColorSpace
  atlas.anisotropy = 8
  return atlas
}

function decalGeometry(cell: number) {
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 4)
  return g
}

function layout(world: World) {
  const r = rng(29)
  const out: Record<Kind, THREE.Matrix4[]> = { patch: [], seam: [], manhole: [], stain: [] }
  const up = new THREE.Vector3(0, 1, 0)
  const place = (k: Kind, s: number, off: number, w: number, l: number, extraYaw = 0) => {
    if (world.marks.pothole !== undefined && Math.abs(s - (world.sStart + world.marks.pothole)) < 7) return
    const p = world.path.at(s, off)
    out[k].push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.06, p.z), new THREE.Quaternion().setFromAxisAngle(up, p.heading + extraYaw), new THREE.Vector3(w, 1, l)))
  }
  const from = world.sStart - 160
  const to = world.sStart + 760
  const lanes = [...world.scenario.traffic.lanes, ...(world.scenario.traffic.oncoming ?? []).map((o) => -o)]
  const w = world.halfWidth * 2 - 1
  for (let s = from + r() * 30; s < to; s += 30 + r() * 45) place('patch', s, lanes[Math.floor(r() * lanes.length)] + (r() - 0.5), 1.8 + r() * 2.6, 2.5 + r() * 4)
  for (let s = from + r() * 20; s < to; s += 22 + r() * 30) place('seam', s, (r() - 0.5) * 2, 0.5, w - 1 + r() * 2, Math.PI / 2 + (r() - 0.5) * 0.12)
  for (let s = from + r() * 40; s < to; s += 55 + r() * 40) place('manhole', s, (r() < 0.5 ? -1 : 1) * Math.min(1.75, world.halfWidth / 3), 0.95, 0.95, r() * Math.PI)
  for (const lane of lanes) for (let s = from + r() * 10; s < to; s += 5 + r() * 12) place('stain', s, lane + (r() - 0.5) * 0.4, 0.9 + r() * 0.6, 1.6 + r() * 1.6)
  return out
}

const cache = new WeakMap<World, ReturnType<typeof layout>>()

export function RoadWear({ world, night, wet }: { world: World; night: boolean; wet: boolean }) {
  const sets = useMemo(() => {
    let l = cache.get(world)
    if (!l) {
      l = layout(world)
      cache.set(world, l)
    }
    return l
  }, [world])
  const geos = useMemo(() => KINDS.map((_, i) => decalGeometry(i)), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: wearAtlas(),
        transparent: true,
        depthWrite: false,
        roughness: wet ? 0.25 : 0.88,
        metalness: 0,
        color: night ? '#8d9194' : '#ffffff',
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    [night, wet],
  )
  return (
    <group>
      {KINDS.map((k, i) => (
        <instancedMesh
          key={k}
          ref={(m) => {
            if (!m) return
            sets[k].forEach((mm, j) => m.setMatrixAt(j, mm))
            m.count = sets[k].length
            m.instanceMatrix.needsUpdate = true
          }}
          args={[geos[i], material, Math.max(1, sets[k].length)]}
          receiveShadow
          frustumCulled={false}
          renderOrder={1}
        />
      ))}
    </group>
  )
}
