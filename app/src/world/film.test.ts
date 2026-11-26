import { describe, expect, it } from 'vitest'
import { shotAt } from './film'
import { LOOP } from './clock'
import { SCENARIOS } from './scenarios'

describe('film mode, every scenario', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id}: shots are back to back and cover the whole loop`, () => {
      const S = sc.shots
      expect(S[0].from).toBe(0)
      expect(S[S.length - 1].to).toBe(LOOP)
      for (let i = 1; i < S.length; i++) expect(S[i].from).toBe(S[i - 1].to)
      for (const s of S) for (const [at] of s.subs) expect(at >= s.from && at < s.to).toBe(true)
      expect(shotAt(LOOP - 0.01, S).i).toBe(S.length - 1)
    })
  }

  it('picks the shot and the caption line for a moment', () => {
    const a = shotAt(23, SCENARIOS[0].shots)
    expect(a.shot.title).toBe('Someone behind the bus')
    expect(a.sub).toMatch(/car ahead/)
  })
})
