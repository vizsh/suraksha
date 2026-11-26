import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWorld, sampleAgents } from './scenario'
import { SCENARIOS } from './scenarios'
import { fuse } from '../engine/fusion'
import { implicitObstacles } from '../engine/implicit'
import type { CorridorData } from './corridor'
import type { Observation } from '../engine/types'

const data = JSON.parse(readFileSync('public/data/corridor.json', 'utf8')) as CorridorData

describe.each(SCENARIOS.map((s) => [s.id] as const))('scenario %s', (id) => {
  const world = buildWorld(data, id)
  it('builds on its road', () => {
    expect(world.scenario.id).toBe(id)
    expect(world.path.length).toBeGreaterThan(world.sStart + 300)
  })

  it('your car never drives through anything on the road', () => {
    const report: string[] = []
    let worst = { d: Infinity, what: '', t: 0 }
    // footprints: length along the road, width across it
    const SIZE: Record<string, [number, number]> = { car: [4.4, 1.8], bus: [11.6, 2.55], ped: [0.6, 0.6], cow: [2.1, 0.9], bike: [2.0, 0.8] }
    for (let t = 0; t < 48; t += 0.1) {
      const agents = sampleAgents(world, t)
      const ego = agents.find((a) => a.id === 'ego')!
      const pe = world.path.project(ego.x, ego.z)
      for (const a of agents) {
        if (a.id === 'ego' || a.role === 'ambient' || a.kind === 'cone') continue
        const pa = world.path.project(a.x, a.z)
        const [l, w] = SIZE[a.kind] ?? SIZE.car
        // a cow crossing the road is long across it, not along it
        const along = Math.abs(pa.s - pe.s) - (l + 4.4) / 2
        const across = Math.abs(pa.offset - pe.offset) - (w + 1.8) / 2
        const gap = Math.max(along, across)
        if (gap < worst.d) worst = { d: gap, what: a.id, t: +t.toFixed(1) }
      }
    }
    report.push(`${id}: closest margin ${worst.d.toFixed(2)} m to ${worst.what} at ${worst.t}s`)
    console.log(report.join('\n'))
    expect(worst.d).toBeGreaterThan(0)
  })

  it('no swerve or braking cluster is left as an unknown obstacle beside a named hazard', () => {
    for (let t = 0; t < 48; t += 1) {
      const obs: Observation[] = world.script.filter((o) => o.at <= t).map(({ at, key, ...o }) => ({ ...o, id: key, t: at * 1000 }))
      const man = world.manoeuvres.filter((m) => m.at <= t).map((m) => ({ id: m.key, t: m.at * 1000, vehicleId: m.vehicleId, pos: m.pos, type: m.type }))
      const threats = fuse([...obs, ...implicitObstacles(man, t * 1000)], t * 1000).filter((th) => th.state !== 'faded' && th.state !== 'resolved')
      for (const u of threats.filter((th) => th.kind === 'unknown'))
        for (const n of threats.filter((th) => th.kind !== 'unknown')) {
          const d = Math.hypot(u.pos[0] - n.pos[0], u.pos[1] - n.pos[1])
          expect(d, `${id} t=${t}: unknown obstacle ${d.toFixed(0)} m from ${n.kind}`).toBeGreaterThan(30)
        }
    }
  })

  it('every hazard it describes is confirmed by the network at some point', () => {
    const kinds = [...new Set(world.script.filter((o) => (o.polarity ?? 1) === 1 && !o.resolve).map((o) => o.kind))]
    const seen = new Set<string>()
    for (let t = 0; t < 48; t += 1) {
      const obs: Observation[] = world.script.filter((o) => o.at <= t).map(({ at, key, ...o }) => ({ ...o, id: key, t: at * 1000 }))
      const man = world.manoeuvres.filter((m) => m.at <= t).map((m) => ({ id: m.key, t: m.at * 1000, vehicleId: m.vehicleId, pos: m.pos, type: m.type }))
      for (const th of fuse([...obs, ...implicitObstacles(man, t * 1000)], t * 1000)) if (th.state === 'confirmed') seen.add(th.kind)
    }
    console.log(`${id}: confirmed ${[...seen].join(', ')}`)
    for (const k of kinds) expect(seen.has(k), `${k} never confirmed`).toBe(true)
  })
})
