import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWorld, LOOP } from './scenario'
import { DT, lightAt, stopLine } from './traffic'
import type { CorridorData } from './corridor'

const t0 = performance.now()
const world = buildWorld(JSON.parse(readFileSync('public/data/corridor.json', 'utf8')) as CorridorData)
const buildMs = performance.now() - t0
const onJVLR = world.junctions.filter((j) => j.sPath !== null)

describe('signals and background traffic', () => {
  it('builds quickly enough for page load', () => {
    console.log(`buildWorld ${buildMs.toFixed(0)} ms, ${world.junctions.length} signals, ${onJVLR.length} on JVLR`)
    expect(buildMs).toBeLessThan(1500)
    expect(onJVLR.length).toBeGreaterThan(0)
  })

  it('your car and the car ahead always cross JVLR junctions on green', () => {
    for (const tab of [world.egoS, world.scoutS]) {
      for (const j of onJVLR) {
        const line = stopLine(j.sPath!)
        for (let i = 1; i < tab.length; i++) {
          if (tab[i - 1] < line && tab[i] >= line) expect(lightAt(j, i * DT, 'main')).toBe('green')
        }
      }
    }
  })

  it('no background car runs a red light', () => {
    for (const car of world.traffic) {
      if (car.opposite) continue
      for (const j of onJVLR) {
        const line = stopLine(j.sPath!)
        for (let i = 1; i < car.s.length; i++) {
          if (car.s[i - 1] < line && car.s[i] >= line) expect(lightAt(j, i * DT, 'main')).not.toBe('red')
        }
      }
    }
  })

  it('some cars queue at red and pull away later', () => {
    const stopped = world.traffic.filter((c) => {
      let held = 0
      for (let i = 1; i < c.s.length; i++) if (c.s[i] - c.s[i - 1] < 0.02) held++
      return held * DT > 2 && c.s[c.s.length - 1] - c.s[0] > 50
    })
    expect(stopped.length).toBeGreaterThanOrEqual(2)
  })

  it('cars in one lane never drive through each other', () => {
    let worst = Infinity
    const n = world.traffic[0].s.length
    for (let i = 0; i < n; i += 4) {
      for (let a = 0; a < world.traffic.length; a++)
        for (let b = a + 1; b < world.traffic.length; b++) {
          const A = world.traffic[a]
          const B = world.traffic[b]
          if (A.opposite !== B.opposite || A.lane !== B.lane) continue
          const L = (A.opposite ? world.path2! : world.path).length
          const d = Math.abs(((A.s[i] - B.s[i]) % L + L + L / 2) % L - L / 2)
          worst = Math.min(worst, d)
        }
    }
    console.log('closest same-lane spacing', worst.toFixed(2), 'm, loop', LOOP)
    expect(worst).toBeGreaterThan(4)
  })
})
