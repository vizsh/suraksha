import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWorld } from './scenario'
import { fuse } from '../engine/fusion'
import type { CorridorData } from './corridor'
import type { Observation } from '../engine/types'

const world = buildWorld(JSON.parse(readFileSync('public/data/corridor.json', 'utf8')) as CorridorData)
const at = (t: number): Observation[] =>
  world.script.filter((o) => o.at <= t).map(({ at: a, key, ...o }) => ({ ...o, id: `script:${key}`, t: a * 1000 }))
const debris = (t: number) => fuse(at(t), t * 1000).find((th) => th.kind === 'debris')

describe('scripted night: pass-by verification', () => {
  it('the fallen branch starts the loop confirmed', () => {
    const th = debris(0)!
    expect(th.state).toBe('confirmed')
    expect(th.clearedBy).toBe(0)
  })

  it('one empty-lane pass is not enough to clear it', () => {
    const th = debris(5)!
    expect(th.state).toBe('confirmed')
    expect(th.clearedBy).toBe(1)
  })

  it('cars passing and seeing nothing clear it before the ego car arrives', () => {
    const th = debris(13)!
    expect(th.state).toBe('resolved')
    expect(th.clearedBy).toBe(3)
  })
})
