// Real-world ground.
// 1. Satellite: Esri World Imagery tiles for the corridor, stitched at runtime into one texture
//    and laid under the 3D model in the same local metres as the OSM data. No key needed.
// 2. Photoreal: Google Photorealistic 3D Tiles when VITE_GOOGLE_MAPS_API_KEY is set, oriented to
//    the corridor origin and dropped so the road at the bus stop sits at y = 0.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { CorridorData } from '../../world/corridor'

export const GOOGLE_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || undefined

const Z = 18
const MARGIN = 0.0016 // degrees of imagery beyond the OSM box, about 170 m

function tileX(lon: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** Z)
}
function tileY(lat: number) {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z)
}
function lonOf(x: number) {
  return (x / 2 ** Z) * 360 - 180
}
function latOf(y: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** Z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

export interface SatelliteImage {
  texture: THREE.CanvasTexture
  center: [number, number]
  size: [number, number]
}

const cache = new Map<string, Promise<SatelliteImage>>()
let pending = 0
/** Satellite stitches still in flight: views wait for them before compiling shaders once. */
export const satellitePending = () => pending

/** Stitch Esri World Imagery tiles covering the corridor into one texture, positioned in local metres. */
export function loadSatellite(data: CorridorData): Promise<SatelliteImage> {
  const key = JSON.stringify(data.bbox)
  const hit = cache.get(key)
  if (hit) return hit
  pending++
  const p = (async (): Promise<SatelliteImage> => {
    const { s, w, n, e } = data.bbox
    const x0 = tileX(w - MARGIN)
    const x1 = tileX(e + MARGIN)
    const y0 = tileY(n + MARGIN)
    const y1 = tileY(s - MARGIN)
    const cols = x1 - x0 + 1
    const rows = y1 - y0 + 1
    const canvas = document.createElement('canvas')
    canvas.width = cols * 256
    canvas.height = rows * 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#7d7f70'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const jobs: (() => Promise<void>)[] = []
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        jobs.push(async () => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`
          try {
            await img.decode()
            ctx.drawImage(img, (x - x0) * 256, (y - y0) * 256)
          } catch {
            /* a missing tile stays neutral */
          }
        })
    // eight at a time
    const queue = [...jobs]
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (queue.length) await queue.shift()!()
      }),
    )
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    // same local projection as scripts/fetch-osm.mjs
    const lat0 = data.origin.lat
    const lon0 = data.origin.lon
    const mPerLat = 110574
    const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
    const west = (lonOf(x0) - lon0) * mPerLon
    const east = (lonOf(x1 + 1) - lon0) * mPerLon
    const north = -(latOf(y0) - lat0) * mPerLat
    const south = -(latOf(y1 + 1) - lat0) * mPerLat
    return { texture, center: [(west + east) / 2, (north + south) / 2], size: [east - west, south - north] }
  })()
  p.then(() => pending--, () => pending--)
  cache.set(key, p)
  return p
}

const halfCache = new WeakMap<SatelliteImage, SatelliteImage>()
/** The same imagery at half resolution: a quarter of the GPU memory and upload time. */
function half(img: SatelliteImage): SatelliteImage {
  let h = halfCache.get(img)
  if (h) return h
  const src = img.texture.image as HTMLCanvasElement
  const c = document.createElement('canvas')
  c.width = Math.round(src.width / 2)
  c.height = Math.round(src.height / 2)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  h = { ...img, texture }
  halfCache.set(img, h)
  return h
}

export function useSatellite(data: CorridorData, lowRes = false) {
  const [img, setImg] = useState<SatelliteImage | null>(null)
  useEffect(() => {
    let live = true
    loadSatellite(data).then((i) => live && setImg(lowRes ? half(i) : i))
    return () => {
      live = false
    }
  }, [data, lowRes])
  return img
}

/** Satellite imagery as the ground plane. Uses the given material so the X-ray patch still applies. */
export function SatelliteGround({ data, material, night, tone }: { data: CorridorData; material: THREE.MeshStandardMaterial; night: boolean; tone?: string }) {
  const img = useSatellite(data, night)
  useEffect(() => {
    if (!img) return
    material.map = img.texture
    material.color.set(tone ?? (night ? '#3a4144' : '#e8e6e0'))
    material.needsUpdate = true
  }, [img, material, night, tone])
  if (!img) return null
  return (
    <mesh material={material} position={[img.center[0], 0.01, img.center[1]]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[img.size[0], img.size[1]]} />
    </mesh>
  )
}

