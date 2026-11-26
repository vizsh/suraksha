// Where a report or a bump happened. Real GPS when the device is inside the demo corridor;
// otherwise a "virtual" spot on JVLR ahead of the demo car, so judges anywhere can take part.
import type { V2 } from '../engine/types'
import type { World } from '../world/scenario'
import { virtualSpotAhead } from '../world/scenario'
import { simTime } from '../world/clock'

export interface Placed {
  pos: V2
  virtual: boolean
}

let lastFix: GeolocationPosition | null = null
let watching = false

export function watchLocation() {
  if (watching || typeof navigator === 'undefined' || !navigator.geolocation) return
  watching = true
  navigator.geolocation.watchPosition(
    (p) => (lastFix = p),
    () => (lastFix = null),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  )
}

/** Convert lat/lon to the corridor's local metres. */
export function toLocal(world: World, lat: number, lon: number): V2 {
  const { bbox } = world.data
  const lat0 = (bbox.s + bbox.n) / 2
  const lon0 = (bbox.w + bbox.e) / 2
  const mPerLat = 110574
  const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  return [(lon - lon0) * mPerLon, -(lat - lat0) * mPerLat]
}

export function placeReport(world: World): Placed {
  if (lastFix) {
    const p = toLocal(world, lastFix.coords.latitude, lastFix.coords.longitude)
    const [W, H] = world.data.size
    if (Math.abs(p[0]) < W / 2 && Math.abs(p[1]) < H / 2) return { pos: p, virtual: false }
  }
  return { pos: virtualSpotAhead(world, simTime()), virtual: true }
}
