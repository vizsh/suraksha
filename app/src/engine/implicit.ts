// Implicit obstacle detection.
// Nobody has to recognise the object: if several different vehicles swerve or brake hard
// at the same spot within a short window, something is there. The cluster becomes an
// "unknown obstacle" observation, which can later merge with a named hazard nearby.
import type { Manoeuvre, Observation, V2 } from './types'

export const IMPLICIT = { radius: 15, windowMs: 10 * 60_000, minVehicles: 3, cell: 20 }

export function implicitObstacles(events: Manoeuvre[], now: number): Observation[] {
  const known = events.filter((e) => e.t <= now).sort((a, b) => a.t - b.t)
  const out: Observation[] = []
  for (const e of known) {
    const near = known.filter(
      (o) => o.t <= e.t && o.t >= e.t - IMPLICIT.windowMs && Math.hypot(o.pos[0] - e.pos[0], o.pos[1] - e.pos[1]) <= IMPLICIT.radius,
    )
    const vehicles = new Set(near.map((o) => o.vehicleId))
    if (vehicles.size < IMPLICIT.minVehicles) continue
    const c: V2 = [near.reduce((s, o) => s + o.pos[0], 0) / near.length, near.reduce((s, o) => s + o.pos[1], 0) / near.length]
    const key = `${Math.round(c[0] / IMPLICIT.cell)}:${Math.round(c[1] / IMPLICIT.cell)}`
    out.push({
      id: `implicit-${e.id}`,
      t: e.t,
      kind: 'unknown',
      source: 'swerve',
      sourceId: `swerve@${key}`,
      pos: c,
      conf: Math.min(0.95, 0.55 + 0.1 * (vehicles.size - IMPLICIT.minVehicles)),
      who: 'Swerve cluster',
      how: `${vehicles.size} cars changed course within ${IMPLICIT.radius} m`,
    })
  }
  return out
}
