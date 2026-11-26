// Roadside trees of three species common on Mumbai streets, built from leaf cards:
// rain tree (wide umbrella crown), gulmohar (spreading, with orange-red blossom) and ashoka
// (tall and columnar). Each crown is a few dozen alpha-cut cards whose normals point out of the
// crown, so light falls on it as on a soft mass; a vertex shader sways the cards in the wind.
// Everything is generated here: no downloads. One instanced mesh per species per part.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { World } from '../../world/scenario'
import { treePoints } from './Street'

type Species = 'rain' | 'gulmohar' | 'ashoka'
const SPECIES: Species[] = ['rain', 'gulmohar', 'ashoka']

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

// ---------- leaf atlas: one 256 px cell per species ----------

let atlas: THREE.CanvasTexture | null = null
function leafAtlas() {
  if (atlas) return atlas
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 256
  const g = c.getContext('2d')!
  const r = rng(3)
  const cell = (i: number, n: number, leaf: (x: number, y: number) => void) => {
    g.save()
    g.translate(i * 256, 0)
    g.beginPath()
    g.rect(0, 0, 256, 256)
    g.clip()
    for (let k = 0; k < n; k++) {
      // denser in the middle, ragged at the edge, so a card's outline is a clump, not a square
      const a = r() * Math.PI * 2
      const d = Math.pow(r(), 0.7) * 118
      leaf(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.92)
    }
    g.restore()
  }
  const ellipse = (x: number, y: number, rx: number, ry: number, rot: number, col: string) => {
    g.fillStyle = col
    g.beginPath()
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
    g.fill()
  }
  const green = (h: number, s: number, l: number) => `hsl(${h + (r() - 0.5) * 14}, ${s}%, ${l + (r() - 0.5) * 14}%)`
  // rain tree: many small paired leaflets, mid green
  cell(0, 900, (x, y) => ellipse(x, y, 5 + r() * 4, 2.4 + r() * 1.6, r() * Math.PI, green(92, 42, 34)))
  // gulmohar: fine feathery leaves, brighter green, with clusters of flame-red blossom
  cell(1, 820, (x, y) => (r() < 0.17 ? ellipse(x, y, 4.5 + r() * 3, 3.5 + r() * 2.5, r() * Math.PI, `hsl(${8 + r() * 12}, 78%, ${44 + r() * 8}%)`) : ellipse(x, y, 4 + r() * 3, 1.8 + r() * 1.2, r() * Math.PI, green(88, 48, 38))))
  // ashoka: long narrow drooping leaves, dark and glossy
  cell(2, 520, (x, y) => ellipse(x, y, 2.6 + r() * 1.4, 12 + r() * 7, (r() - 0.5) * 0.5, green(110, 46, 22)))
  atlas = new THREE.CanvasTexture(c)
  atlas.colorSpace = THREE.SRGBColorSpace
  atlas.anisotropy = 4
  return atlas
}

// ---------- geometry per species ----------

interface Shape {
  cell: number
  centre: [number, number] // crown centre height, and trunk height
  radius: [number, number] // horizontal, vertical
  cards: number
  size: [number, number]
  tilt: number // how far cards lean from vertical; the rain tree's lie flatter, in layers
  trunk: [number, number] // base radius, top radius
  branches: number
}

const SHAPE: Record<Species, Shape> = {
  rain: { cell: 0, centre: [7.2, 4.6], radius: [5.2, 2.2], cards: 64, size: [2.6, 3.6], tilt: 1.05, trunk: [0.34, 0.22], branches: 4 },
  gulmohar: { cell: 1, centre: [5.6, 3.4], radius: [4.0, 1.9], cards: 56, size: [2.2, 3.0], tilt: 0.8, trunk: [0.26, 0.16], branches: 3 },
  ashoka: { cell: 2, centre: [6.8, 2.2], radius: [1.25, 4.6], cards: 46, size: [1.4, 2.0], tilt: 0.25, trunk: [0.14, 0.1], branches: 0 },
}

function crownGeometry(sp: Species) {
  const S = SHAPE[sp]
  const r = rng(SPECIES.indexOf(sp) + 11)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const c = new THREE.Vector3(0, S.centre[0], 0)
  const u0 = S.cell / 3
  for (let k = 0; k < S.cards; k++) {
    // a point in the crown, biased toward its surface
    const th = r() * Math.PI * 2
    const ph = Math.acos(2 * r() - 1)
    const rr = 0.45 + 0.55 * Math.sqrt(r())
    const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * S.radius[0] * rr, Math.cos(ph) * S.radius[1] * rr, Math.sin(ph) * Math.sin(th) * S.radius[0] * rr).add(c)
    const size = S.size[0] + r() * (S.size[1] - S.size[0])
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.6 - S.tilt * (0.6 + r() * 0.4), r() * Math.PI * 2, (r() - 0.5) * 0.5, 'YXZ'))
    // normal: out of the crown, lifted toward the sky
    const n = p.clone().sub(c).divide(new THREE.Vector3(S.radius[0], S.radius[1], S.radius[0])).normalize().multiplyScalar(0.75).add(new THREE.Vector3(0, 0.35, 0)).normalize()
    const base = pos.length / 3
    for (const [dx, dy, uu, vv] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]]) {
      const v = new THREE.Vector3(dx * size, dy * size, 0).applyQuaternion(q).add(p)
      pos.push(v.x, v.y, v.z)
      nor.push(n.x, n.y, n.z)
      uv.push(u0 + (uu * 0.98 + 0.01) / 3, vv)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

function trunkGeometry(sp: Species) {
  const S = SHAPE[sp]
  const H = S.centre[1] + (sp === 'ashoka' ? 4.5 : 0.6)
  const parts = [new THREE.CylinderGeometry(S.trunk[1], S.trunk[0], H, 8).translate(0, H / 2, 0)]
  const r = rng(SPECIES.indexOf(sp) + 31)
  for (let b = 0; b < S.branches; b++) {
    // limbs splay from the top of the trunk into the crown
    const len = S.radius[0] * (0.55 + r() * 0.25)
    const g = new THREE.CylinderGeometry(S.trunk[1] * 0.45, S.trunk[1] * 0.8, len, 6).translate(0, len / 2, 0)
    g.rotateZ(0.75 + r() * 0.35)
    g.rotateY((b / S.branches) * Math.PI * 2 + r() * 0.6)
    g.translate(0, S.centre[1] - 0.4, 0)
    parts.push(g)
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!
}

// ---------- materials ----------

const wind = { value: 0 }

function crownMaterial(night: boolean) {
  const m = new THREE.MeshStandardMaterial({ map: leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, color: night ? '#56625a' : '#ffffff' })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
  vec2 wp = vec2(0.0);
#endif
  float sway = max(0.0, position.y - 2.5);
  transformed.x += sin(uWind * 1.1 + wp.x * 0.05 + position.y * 0.4) * 0.022 * sway;
  transformed.z += cos(uWind * 0.9 + wp.y * 0.05 + position.x * 0.5) * 0.018 * sway;`,
    )
  }
  m.customProgramCacheKey = () => 'tree-crown'
  return m
}

function speciesOf(i: number, x: number, z: number) {
  const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233 + i) * 43758.5453) % 1
  return h < 0.45 ? 'rain' : h < 0.72 ? 'gulmohar' : 'ashoka'
}

export function Trees({ world, night }: { world: World; night: boolean }) {
  const pts = useMemo(() => treePoints(world), [world])
  const groups = useMemo(() => {
    const out: Record<Species, { m: THREE.Matrix4; tint: THREE.Color }[]> = { rain: [], gulmohar: [], ashoka: [] }
    const up = new THREE.Vector3(0, 1, 0)
    pts.forEach((p, i) => {
      const sp = speciesOf(i, p.x, p.z)
      const s = 0.78 + ((i * 37) % 10) / 24
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(up, i * 1.7), new THREE.Vector3(s, s * (0.92 + ((i * 11) % 7) / 40), s))
      const k = 0.82 + ((i * 13) % 10) / 40
      out[sp].push({ m, tint: new THREE.Color(k, k * (0.98 + ((i * 7) % 5) / 60), k * 0.94) })
    })
    return out
  }, [pts])
  const geo = useMemo(() => Object.fromEntries(SPECIES.map((sp) => [sp, { crown: crownGeometry(sp), trunk: trunkGeometry(sp) }])) as Record<Species, { crown: THREE.BufferGeometry; trunk: THREE.BufferGeometry }>, [])
  const mats = useMemo(() => {
    const crown = crownMaterial(night)
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafAtlas(), alphaTest: 0.42 })
    const bark = new THREE.MeshStandardMaterial({ color: night ? '#2c2520' : '#4d3f33', roughness: 0.95 })
    return { crown, depth, bark }
  }, [night])
  useFrame((s) => {
    wind.value = s.clock.elapsedTime
  })
  const setup = (sp: Species, tinted: boolean) => (r: THREE.InstancedMesh | null) => {
    if (!r) return
    groups[sp].forEach((g, i) => {
      r.setMatrixAt(i, g.m)
      if (tinted) r.setColorAt(i, g.tint)
    })
    r.count = groups[sp].length
    r.instanceMatrix.needsUpdate = true
    if (r.instanceColor) r.instanceColor.needsUpdate = true
  }
  return (
    <group>
      {SPECIES.map((sp) =>
        groups[sp].length ? (
          <group key={sp}>
            <instancedMesh ref={setup(sp, false)} args={[geo[sp].trunk, mats.bark, groups[sp].length]} castShadow frustumCulled={false} />
            <instancedMesh ref={setup(sp, true)} args={[geo[sp].crown, mats.crown, groups[sp].length]} customDepthMaterial={mats.depth} castShadow receiveShadow frustumCulled={false} />
          </group>
        ) : null,
      )}
    </group>
  )
}
