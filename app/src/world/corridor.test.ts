import { describe, expect, it } from 'vitest'
import { Path, fromLatLon, snapToRoad, toLatLon, type CorridorData } from './corridor'

const data: CorridorData = {
  source: 'test',
  bbox: { s: 19.11, w: 72.9, n: 19.13, e: 72.92 },
  origin: { lat: 19.12, lon: 72.91 },
  size: [2000, 2000],
  roads: [
    { id: 1, kind: 'primary', name: 'Main', lanes: 3, oneway: true, sidewalk: null, pts: [[0, 0], [500, 0]] },
    { id: 2, kind: 'residential', name: 'Lane A', lanes: null, oneway: false, sidewalk: null, pts: [[0, 200], [0, 400]] },
  ],
  buildings: [],
  points: [],
}
const route = new Path([[0, 0], [500, 0]])

describe('coordinates', () => {
  it('round-trips local metres through latitude and longitude', () => {
    const { lat, lon } = toLatLon(data, 123.4, -56.7)
    const [x, z] = fromLatLon(data, lat, lon)
    expect(x).toBeCloseTo(123.4, 3)
    expect(z).toBeCloseTo(-56.7, 3)
  })
  it('north is negative z', () => {
    expect(toLatLon(data, 0, -100).lat).toBeGreaterThan(data.origin.lat)
  })
})

describe('map matching', () => {
  it('snaps a point near the route onto the nearest lane centre', () => {
    // right of travel is +offset; 3 m right should land on lane 3 (offset 3.5)
    const p = route.at(200, 3)
    const s = snapToRoad(data, route, [p.x, p.z])
    expect(s.road).toBe('JVLR')
    expect(s.lane).toBe(3)
    const q = route.project(s.pos[0], s.pos[1])
    expect(q.offset).toBeCloseTo(3.5, 1)
  })
  it('snaps to another named road when far from the route', () => {
    const s = snapToRoad(data, route, [6, 300])
    expect(s.road).toBe('Lane A')
    expect(s.pos[0]).toBeCloseTo(0, 5)
  })
  it('leaves points far from any road alone', () => {
    const s = snapToRoad(data, route, [300, 900])
    expect(s.road).toBeNull()
    expect(s.moved).toBe(0)
  })
})
