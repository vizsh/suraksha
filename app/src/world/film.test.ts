import { describe, expect, it } from 'vitest'
import { SHOTS, shotAt } from './film'
import { LOOP } from './clock'

describe('film mode', () => {
  it('shots are back to back and cover the whole loop', () => {
    expect(SHOTS[0].from).toBe(0)
    expect(SHOTS[SHOTS.length - 1].to).toBe(LOOP)
    for (let i = 1; i < SHOTS.length; i++) expect(SHOTS[i].from).toBe(SHOTS[i - 1].to)
  })

  it('every caption line falls inside its own shot', () => {
    for (const s of SHOTS) for (const [at] of s.subs) expect(at >= s.from && at < s.to).toBe(true)
  })

  it('picks the shot and the caption line for a moment', () => {
    const a = shotAt(23)
    expect(a.shot.title).toBe('Someone behind the bus')
    expect(a.sub).toMatch(/car ahead/)
    expect(shotAt(47.99).i).toBe(SHOTS.length - 1)
  })
})
