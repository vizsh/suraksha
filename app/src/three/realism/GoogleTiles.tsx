// Google Photorealistic 3D Tiles: loaded only when a key is configured (keeps the tiles library
// out of the default download).
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin, ReorientationPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins'
import type { CorridorData } from '../../world/corridor'
import { GOOGLE_KEY } from './Ground'

// ---------- Google Photorealistic 3D Tiles ----------

const DEG = Math.PI / 180

/** Photoreal Powai. Ground is calibrated by a downward ray at `calibrateAt` so our road layer meets theirs. */
export default function GoogleTiles({ data, calibrateAt }: { data: CorridorData; calibrateAt: [number, number] }) {
  const group = useRef<THREE.Group>(null)
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const done = useRef(false)
  const frames = useRef(0)
  const draco = useMemo(() => new DRACOLoader().setDecoderPath('/draco/'), [])
  const auth = useMemo(() => [{ apiToken: GOOGLE_KEY, autoRefreshToken: true }], [])
  const ext = useMemo(() => [{ dracoLoader: draco }], [draco])
  const orient = useMemo(() => [{ lat: data.origin.lat * DEG, lon: data.origin.lon * DEG, height: 0, recenter: true }], [data])
  useFrame(() => {
    if (done.current || !group.current || frames.current++ % 20) return
    ray.set(new THREE.Vector3(calibrateAt[0], 2000, calibrateAt[1]), new THREE.Vector3(0, -1, 0))
    const hit = ray.intersectObject(group.current, true)[0]
    if (hit) {
      group.current.position.y -= hit.point.y
      done.current = true
    }
  })
  if (!GOOGLE_KEY) return null
  return (
    <group ref={group}>
      <TilesRenderer errorTarget={8}>
        <TilesPlugin plugin={GoogleCloudAuthPlugin} args={auth} />
        <TilesPlugin plugin={GLTFExtensionsPlugin} args={ext} />
        <TilesPlugin plugin={ReorientationPlugin} args={orient} />
        <TilesPlugin plugin={TilesFadePlugin} />
      </TilesRenderer>
    </group>
  )
}
