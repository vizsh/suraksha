import { describe, expect, it } from 'vitest'
import { classify, createGate, inRoadRegion } from './gate'

const road = { x: 0.4, y: 0.5, w: 0.1, h: 0.3 } // bottom at 0.8, centred
const sky = { x: 0.4, y: 0.05, w: 0.1, h: 0.2 }

describe('object gate', () => {
  it('ignores objects outside the road region', () => {
    expect(inRoadRegion(sky)).toBe(false)
    const g = createGate()
    expect([0, 100, 200, 300].map((t) => g.object('person', sky, t))).not.toContain(true)
  })

  it('needs three sightings within two seconds', () => {
    const g = createGate()
    expect(g.object('person', road, 0)).toBe(false)
    expect(g.object('person', road, 500)).toBe(false)
    expect(g.object('person', road, 900)).toBe(true)
  })

  it('does not count sightings that are too far apart', () => {
    const g = createGate()
    expect(g.object('person', road, 0)).toBe(false)
    expect(g.object('person', road, 2500)).toBe(false)
    expect(g.object('person', road, 5000)).toBe(false)
  })

  it('cools down after reporting', () => {
    const g = createGate()
    ;[0, 100, 200].forEach((t) => g.object('cow', road, t))
    expect([300, 400, 500].map((t) => g.object('cow', road, t))).not.toContain(true)
    expect([11_000, 11_100, 11_200].map((t) => g.object('cow', road, t))).toContain(true)
  })
})

describe('surface gate', () => {
  const p = (pothole: number, clear: number) => ({ pothole, clear, barricade: 0, cones: 0, waterlogging: 1 - pothole - clear })

  it('needs three consecutive confident checks', () => {
    const g = createGate()
    expect(g.surface(p(0.7, 0.2), 0)).toBeNull()
    expect(g.surface(p(0.7, 0.2), 1500)).toBeNull()
    expect(g.surface(p(0.7, 0.2), 3000)).toBe('pothole')
  })

  it('rejects a lead that is below the minimum probability', () => {
    const g = createGate()
    ;[0, 1500, 3000].forEach((t) => g.surface(p(0.44, 0.13), t))
    expect(g.surface(p(0.44, 0.13), 4500)).toBeNull()
  })

  it('a clear check in between resets the streak', () => {
    const g = createGate()
    g.surface(p(0.7, 0.2), 0)
    g.surface(p(0.7, 0.2), 1500)
    g.surface(p(0.1, 0.8), 3000)
    expect(g.surface(p(0.7, 0.2), 4500)).toBeNull()
  })

  it('ignores weak leads over a clear road', () => {
    const g = createGate()
    g.surface(p(0.45, 0.4), 0)
    expect(g.surface(p(0.45, 0.4), 1500)).toBeNull()
  })
})

describe('zero-shot classification', () => {
  it('picks the class whose embedding matches the image', () => {
    const classes = { pothole: [1, 0, 0], clear: [0, 1, 0], barricade: [0, 0, 1], cones: [0, 0, 1], waterlogging: [0, 0, 1] }
    const probs = classify([0.9, 0.1, 0], classes)
    expect(probs.pothole).toBeGreaterThan(0.9)
    const sum = Object.values(probs).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 5)
  })
})
