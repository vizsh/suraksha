// Powai lake as water. The OSM extract has no water polygons, so the lake is found in the
// satellite imagery that is already loaded: water there is very dark and smooth
// (forest is brighter and textured, roofs far brighter). Pixels that pass are cleaned up (blur, threshold, and only
// large connected regions kept) into a soft mask, and a reflective surface with moving ripples
// is drawn over them. No extra download.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CorridorData } from '../../world/corridor'
import { holdSatellite, loadSatellite, type SatelliteImage } from './Ground'

const CELL = 4 // source pixels per mask pixel (about 2.4 m at zoom 18)
const MIN_AREA_PX = 2500 // connected water smaller than this (about 1.5 ha) is a shadow or a tank, not the lake

export interface WaterMask {
  canvas: HTMLCanvasElement
  coverage: number // fraction of the image that is water
}

const maskCache = new WeakMap<SatelliteImage, WaterMask>()

export function waterMask(img: SatelliteImage): WaterMask {
  const hit = maskCache.get(img)
  if (hit) return hit
  const src = img.texture.image as HTMLCanvasElement
  const W = Math.floor(src.width / CELL)
  const H = Math.floor(src.height / CELL)
  // let the browser average the imagery down to mask resolution, then read that small image
  const small = document.createElement('canvas')
  small.width = W
  small.height = H
  const sctx = small.getContext('2d', { willReadFrequently: true })!
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(src, 0, 0, W, H)
  const px = sctx.getImageData(0, 0, W, H).data
  const lumOf = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) lumOf[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3
  const isWater = new Uint8Array(W * H)
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      // texture: brightness spread over the 3 x 3 neighbourhood
      let m = 0
      let m2 = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const l = lumOf[i + dy * W + dx]
          m += l
          m2 += l * l
        }
      m /= 9
      const spread = Math.sqrt(Math.max(0, m2 / 9 - m * m))
      // measured on the Esri imagery: lake 13-15 brightness and smooth; forest about 30 and textured
      isWater[i] = lumOf[i] < 23 && spread < 4 && px[i * 4 + 1] >= px[i * 4] ? 1 : 0
    }
  // smooth: 5 x 5 vote, so glints on water count and single dark roofs do not (two 1-D box sums)
  const rows = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    let run = 0
    for (let x = 0; x < W; x++) {
      run += isWater[y * W + x] - (x >= 5 ? isWater[y * W + x - 5] : 0)
      if (x >= 2) rows[y * W + x - 2] = run
    }
  }
  const voted = new Uint8Array(W * H)
  for (let x = 0; x < W; x++) {
    let run = 0
    for (let y = 0; y < H; y++) {
      run += rows[y * W + x] - (y >= 5 ? rows[(y - 5) * W + x] : 0)
      if (y >= 2) voted[(y - 2) * W + x] = run >= 13 ? 1 : 0
    }
  }
  // keep only large connected regions
  const label = new Int32Array(W * H)
  const keep = new Uint8Array(W * H)
  const stack: number[] = []
  let next = 1
  let total = 0
  for (let i = 0; i < W * H; i++) {
    if (!voted[i] || label[i]) continue
    const members: number[] = []
    label[i] = next
    stack.push(i)
    while (stack.length) {
      const j = stack.pop()!
      members.push(j)
      const x = j % W
      const y = (j - x) / W
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) {
        if (k < 0 || !voted[k] || label[k]) continue
        label[k] = next
        stack.push(k)
      }
    }
    if (members.length >= MIN_AREA_PX) {
      for (const j of members) keep[j] = 1
      total += members.length
    }
    next++
  }
  // soft edge: draw at mask resolution, then blur when scaling up
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const out = ctx.createImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const v = keep[i] ? 255 : 0
    out.data[i * 4] = v
    out.data[i * 4 + 1] = v
    out.data[i * 4 + 2] = v
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  const soft = document.createElement('canvas')
  soft.width = W
  soft.height = H
  const sx = soft.getContext('2d')!
  sx.filter = 'blur(1.5px)'
  sx.drawImage(c, 0, 0)
  const m = { canvas: soft, coverage: total / (W * H) }
  maskCache.set(img, m)
  return m
}

const time = { value: 0 }

function waterMaterial(mask: THREE.Texture, night: boolean) {
  const m = new THREE.MeshStandardMaterial({
    color: night ? '#0b1416' : '#2c4a4a',
    roughness: 0.06,
    metalness: 0.0,
    envMapIntensity: night ? 0.5 : 1.25,
    transparent: true,
    alphaMap: mask,
    opacity: 0.92,
    depthWrite: false,
    // just above the imagery, below every road surface (roads sit at 0.04 m and up with larger offsets)
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;\nuniform float uTime;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  // ripples: a few travelling waves in world space, tilting the normal
  vec2 p = vWaterXZ;
  float t = uTime;
  vec2 d = vec2(0.0);
  // several directions and lengths, each bent by a slow warp, so no single stripe pattern shows
  vec2 w = p + 6.0 * vec2(sin(p.y * 0.031 + t * 0.2), cos(p.x * 0.027 - t * 0.17));
  d += vec2(0.8, 0.6) * cos(dot(w, vec2(0.8, 0.6)) * 0.33 + t * 1.1) * 0.022;
  d += vec2(-0.5, 0.86) * cos(dot(w, vec2(-0.5, 0.86)) * 0.57 + t * 1.6) * 0.018;
  d += vec2(0.97, -0.24) * cos(dot(w, vec2(0.97, -0.24)) * 1.21 + t * 2.3) * 0.012;
  d += vec2(-0.71, -0.7) * cos(dot(w, vec2(-0.71, -0.7)) * 2.3 + t * 3.1) * 0.008;
  d += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 3.7 + t * 4.0) * 0.006;
  normal = normalize(normal + (viewMatrix * vec4(d.x, 0.0, d.y, 0.0)).xyz);`,
      )
  }
  m.customProgramCacheKey = () => 'powai-water'
  return m
}

export function Water({ data, night }: { data: CorridorData; night: boolean }) {
  const [img, setImg] = useState<SatelliteImage | null>(null)
  // the view waits to compile its shaders until the water mesh exists (or is known not to)
  const hold = useRef<(() => void) | null>(null)
  useEffect(() => {
    let live = true
    const release = holdSatellite()
    hold.current = release
    loadSatellite(data).then((i) => (live ? setImg(i) : release()), release)
    return () => {
      live = false
      release()
    }
  }, [data])
  const tex = useMemo(() => {
    if (!img) return null
    const mask = waterMask(img)
    if (mask.coverage < 0.01) return null
    const t = new THREE.CanvasTexture(mask.canvas)
    t.colorSpace = THREE.NoColorSpace
    return t
  }, [img])
  const material = useMemo(() => (tex ? waterMaterial(tex, night) : null), [tex, night])
  useEffect(() => {
    if (img) hold.current?.()
  }, [img, material])
  useFrame((s) => {
    time.value = s.clock.elapsedTime
  })
  if (!img || !material) return null
  return (
    <mesh material={material} position={[img.center[0], 0.025, img.center[1]]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[img.size[0], img.size[1]]} />
    </mesh>
  )
}
