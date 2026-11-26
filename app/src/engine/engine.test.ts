import { describe, expect, it } from 'vitest'
import { fuse, evidence } from './fusion'
import { implicitObstacles } from './implicit'
import { driverFeed, laneOf, stoppingDistance } from './relevance'
import type { Manoeuvre, Observation } from './types'

let n = 0
function obs(p: Partial<Observation> & Pick<Observation, 'kind' | 'source' | 'sourceId'>): Observation {
  return { id: `o${n++}`, t: 0, pos: [0, 0], conf: 0.9, who: 'test', how: 'test', ...p }
}

describe('fusion', () => {
  it('a single report from a new citizen is only noticed', () => {
    const [t] = fuse([obs({ kind: 'barricade', source: 'citizen', sourceId: 'c1', reputation: 0.6 })], 1000)
    expect(t.state).toBe('noticed')
    expect(t.sources).toBe(1)
  })

  it('two independent dashcams confirm a threat', () => {
    const list = [
      obs({ kind: 'pedestrian', source: 'vision', sourceId: 'carA', conf: 0.88, t: 0 }),
      obs({ kind: 'pedestrian', source: 'vision', sourceId: 'carB', conf: 0.81, t: 600, pos: [2, 1] }),
    ]
    const [t] = fuse(list, 700)
    expect(t.state).toBe('confirmed')
    expect(t.confidence).toBeGreaterThan(0.75)
  })

  it('repeated reports from the same device count once', () => {
    const list = [1, 2, 3, 4].map((i) => obs({ kind: 'pothole', source: 'imu', sourceId: 'phone1', t: i * 1000 }))
    const [t] = fuse(list, 5000)
    expect(t.sources).toBe(1)
    expect(t.state).not.toBe('confirmed')
  })

  it('a second independent phone moves a pothole forward', () => {
    const one = fuse([obs({ kind: 'pothole', source: 'imu', sourceId: 'p1', conf: 0.9 })], 10)
    const two = fuse(
      [obs({ kind: 'pothole', source: 'imu', sourceId: 'p1', conf: 0.9 }), obs({ kind: 'pothole', source: 'imu', sourceId: 'p2', conf: 0.9, pos: [3, 0] })],
      10,
    )
    expect(two[0].confidence).toBeGreaterThan(one[0].confidence)
    expect(two).toHaveLength(1)
  })

  it('a confirmed pedestrian resolves once nobody sees them any more', () => {
    const list = [
      obs({ kind: 'pedestrian', source: 'vision', sourceId: 'a', t: 0 }),
      obs({ kind: 'pedestrian', source: 'vision', sourceId: 'b', t: 300 }),
    ]
    expect(fuse(list, 400)[0].state).toBe('confirmed')
    expect(fuse(list, 15_000)[0].state).toBe('resolved')
  })

  it('a decaying confirmed threat never reads as possible again', () => {
    const list = [
      obs({ kind: 'pedestrian', source: 'vision', sourceId: 'a', t: 0 }),
      obs({ kind: 'pedestrian', source: 'vision', sourceId: 'b', t: 300 }),
    ]
    for (let now = 400; now < 30_000; now += 500) {
      const st = fuse(list, now)[0].state
      expect(['confirmed', 'resolved']).toContain(st)
    }
  })

  it('an unconfirmed weak report fades instead of resolving', () => {
    const list = [obs({ kind: 'unknown', source: 'citizen', sourceId: 'c', conf: 0.5 })]
    const [t] = fuse(list, 6 * 3600_000)
    expect(t.state).toBe('faded')
  })

  it('cars passing and seeing nothing resolve a confirmed static hazard', () => {
    const base = [
      obs({ kind: 'debris', source: 'vision', sourceId: 'a', t: 0 }),
      obs({ kind: 'debris', source: 'vision', sourceId: 'b', t: 100 }),
    ]
    expect(fuse(base, 200)[0].state).toBe('confirmed')
    const clears = ['x', 'y', 'z'].map((id, i) => obs({ kind: 'debris', source: 'vision', sourceId: id, polarity: -1, t: 1000 + i }))
    expect(fuse([...base, ...clears], 2000)[0].state).toBe('resolved')
  })

  it('an operator closes a threat and a newer report reopens it', () => {
    const base = [
      obs({ kind: 'barricade', source: 'vision', sourceId: 'a', t: 0 }),
      obs({ kind: 'barricade', source: 'citizen', sourceId: 'c', t: 50 }),
      obs({ kind: 'barricade', source: 'operator', sourceId: 'ops', resolve: true, t: 1000 }),
    ]
    expect(fuse(base, 1100)[0].state).toBe('resolved')
    const reopened = [...base, obs({ kind: 'barricade', source: 'citizen', sourceId: 'c2', t: 5000 })]
    expect(fuse(reopened, 5100)[0].state).not.toBe('resolved')
  })

  it('different hazards far apart stay separate threats', () => {
    const list = [
      obs({ kind: 'pothole', source: 'imu', sourceId: 'a', pos: [0, 0] }),
      obs({ kind: 'pothole', source: 'imu', sourceId: 'b', pos: [60, 0] }),
      obs({ kind: 'barricade', source: 'citizen', sourceId: 'c', pos: [1, 1] }),
    ]
    expect(fuse(list, 10)).toHaveLength(3)
  })

  it('evidence ignores observations from the future', () => {
    const list = [obs({ kind: 'pothole', source: 'vision', sourceId: 'a', t: 5000 })]
    expect(evidence(list, 'pothole', 1000).conf).toBe(0)
  })
})

describe('implicit obstacles', () => {
  const m = (vehicleId: string, t: number, x = 0): Manoeuvre => ({ id: `${vehicleId}-${t}`, t, vehicleId, pos: [x, 0], type: 'swerve' })

  it('two swerving cars are not enough', () => {
    expect(implicitObstacles([m('a', 0), m('b', 1000)], 2000)).toHaveLength(0)
  })

  it('three different cars swerving at one spot create an unknown obstacle', () => {
    const out = implicitObstacles([m('a', 0), m('b', 1000), m('c', 2000, 4)], 3000)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('unknown')
  })

  it('one car swerving three times does not count', () => {
    expect(implicitObstacles([m('a', 0), m('a', 1000), m('a', 2000)], 3000)).toHaveLength(0)
  })

  it('a swerve cluster merges with a nearby barricade report', () => {
    const swerves = implicitObstacles([m('a', 0, 2), m('b', 500, 3), m('c', 900, 1)], 1000)
    const report = obs({ kind: 'barricade', source: 'citizen', sourceId: 'cit', reputation: 0.6, t: 0 })
    const threats = fuse([report, ...swerves], 1000)
    expect(threats).toHaveLength(1)
    expect(threats[0].kind).toBe('barricade')
    expect(threats[0].sources).toBe(2)
  })
})

describe('driver relevance', () => {
  const driver = { s: 100, offset: -3.5, speed: 11 }
  const dry = { wet: false, night: false }

  it('lanes follow left-hand traffic offsets', () => {
    expect(laneOf(-3.5)).toBe(1)
    expect(laneOf(0)).toBe(2)
    expect(laneOf(3.5)).toBe(3)
  })

  it('a confirmed hazard close ahead in my lane is critical', () => {
    const [f] = driverFeed([{ id: 'x', kind: 'barricade', state: 'confirmed', s: 150, offset: -3.5, onRoute: true }], driver, dry)
    expect(f.tier).toBe('critical')
  })

  it('a potential hazard far ahead is not critical', () => {
    const [f] = driverFeed([{ id: 'x', kind: 'pothole', state: 'potential', s: 450, offset: 0, onRoute: true }], driver, dry)
    expect(f.tier).not.toBe('critical')
  })

  it('threats behind me, resolved or off my route are dropped', () => {
    const feed = driverFeed(
      [
        { id: 'behind', kind: 'pothole', state: 'confirmed', s: 50, offset: 0, onRoute: true },
        { id: 'done', kind: 'pothole', state: 'resolved', s: 200, offset: 0, onRoute: true },
        { id: 'away', kind: 'pothole', state: 'confirmed', s: 200, offset: 0, onRoute: false },
      ],
      driver,
      dry,
    )
    expect(feed).toHaveLength(0)
  })

  it('a wet road needs more stopping distance', () => {
    expect(stoppingDistance(14, true)).toBeGreaterThan(stoppingDistance(14, false))
  })
})
