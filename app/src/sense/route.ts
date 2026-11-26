// Safer routing: real road routes from OSRM (open source routing on OpenStreetMap), each scored
// against the predicted risk field and the live threats on the network.
import type { V2 } from '../engine/types'
import { fromLatLon, toLatLon } from '../world/corridor'
import type { World } from '../world/scenario'
import type { ThreatView } from '../world/store'

export interface Place {
  name: string
  lat: number
  lon: number
}
export const PLACES: Place[] = [
  { name: 'IIT Bombay main gate', lat: 19.1249, lon: 72.9149 },
  { name: 'Hiranandani Gardens', lat: 19.1173, lon: 72.9074 },
]

export interface ScoredRoute {
  id: string
  name: string
  pts: V2[]
  km: number
  minutes: number
  risk: number // risk index per km, lower is safer
  hits: { label: string; state: ThreatView['state'] }[]
}

async function osrm(coords: { lat: number; lon: number }[]): Promise<{ geometry: { coordinates: [number, number][] }; distance: number; duration: number } | null> {
  const path = coords.map((c) => `${c.lon.toFixed(5)},${c.lat.toFixed(5)}`).join(';')
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`)
  if (!res.ok) return null
  const j = await res.json()
  return j.routes?.[0] ?? null
}

function resample(pts: V2[], step: number) {
  const out: V2[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    for (let s = 0; s < len; s += step) out.push([ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len])
  }
  return out
}

export function scoreRoute(world: World, pts: V2[], threats: ThreatView[]) {
  const samples = resample(pts, 15)
  let risk = 0
  for (const [x, z] of samples) risk += world.risk.at(x, z) * 15
  const hits: ScoredRoute['hits'] = []
  for (const t of threats) {
    if (t.state === 'resolved' || t.state === 'faded') continue
    const near = samples.some(([x, z]) => Math.hypot(x - t.pos[0], z - t.pos[1]) < (t.kind === 'risk-zone' ? 35 : 15))
    if (!near) continue
    hits.push({ label: t.label, state: t.state })
    risk += t.state === 'confirmed' ? 400 : t.state === 'predicted' ? 150 : 180
  }
  const km = (samples.length * 15) / 1000
  return { risk: risk / Math.max(0.3, km), hits }
}

/** The direct route and one through Central Avenue, scored and ranked. */
export async function compareRoutes(world: World, threats: ThreatView[]): Promise<ScoredRoute[]> {
  const [from, to] = PLACES
  const central = world.data.roads
    .filter((r) => r.name === 'Central Avenue')
    .sort((a, b) => b.pts.length - a.pts.length)[0]
  const via = central ? central.pts[Math.floor(central.pts.length / 2)] : null
  const viaLL = via ? toLatLon(world.data, via[0], via[1]) : null
  const [a, b] = await Promise.all([osrm([from, to]), viaLL ? osrm([from, viaLL, to]) : Promise.resolve(null)])
  const out: ScoredRoute[] = []
  for (const [id, name, r] of [
    ['direct', 'Fastest', a],
    ['central', 'Via Central Avenue', b],
  ] as const) {
    if (!r) continue
    const pts = r.geometry.coordinates.map(([lon, lat]) => fromLatLon(world.data, lat, lon))
    const s = scoreRoute(world, pts, threats)
    out.push({ id, name, pts, km: r.distance / 1000, minutes: r.duration / 60, ...s })
  }
  return out.sort((x, y) => x.risk - y.risk)
}
