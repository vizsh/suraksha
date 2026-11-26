// What a single driver should be told, and how loudly.
// Only threats on the driver's route, ahead of them, in or next to their lane, within
// the time horizon. Tier comes from state, time to reach, stopping distance and conditions.
import type { HazardKind, ThreatState } from './types'

export type Tier = 'critical' | 'advisory' | 'info'
export type Lane = 1 | 2 | 3

export interface DriverState {
  s: number // metres along the route
  offset: number // lateral offset from the carriageway centreline (negative = kerb side)
  speed: number // m/s
}

export interface Conditions {
  wet: boolean
  night: boolean
  visibilityM?: number
}

export interface RouteThreat {
  id: string
  kind: HazardKind | 'risk-zone'
  state: ThreatState
  s: number
  offset: number
  onRoute: boolean
}

export interface FeedItem {
  id: string
  ahead: number
  ttr: number // seconds to reach at current speed
  lane: Lane | 'all'
  sameLane: boolean
  tier: Tier
}

const ALL_LANES = new Set<string>(['pedestrian', 'waterlogging', 'animal', 'risk-zone'])

export function laneOf(offset: number): Lane {
  if (offset < -1.75) return 1
  if (offset > 1.75) return 3
  return 2
}

/** Reaction distance plus braking distance. */
export function stoppingDistance(speed: number, wet: boolean) {
  const decel = wet ? 4.5 : 6.5
  return speed * 1.5 + (speed * speed) / (2 * decel)
}

export function driverFeed(threats: RouteThreat[], d: DriverState, c: Conditions): FeedItem[] {
  const speed = Math.max(d.speed, 3)
  const horizon = Math.max(450, speed * 45)
  const stop = stoppingDistance(speed, c.wet) * (c.night || (c.visibilityM ?? 10_000) < 1500 ? 1.25 : 1)
  const myLane = laneOf(d.offset)
  const out: FeedItem[] = []
  for (const t of threats) {
    if (!t.onRoute || t.state === 'resolved' || t.state === 'faded') continue
    const ahead = t.s - d.s
    if (ahead < -5 || ahead > horizon) continue
    const lane: Lane | 'all' = ALL_LANES.has(t.kind) ? 'all' : laneOf(t.offset)
    const sameLane = lane === 'all' || lane === myLane
    const adjacent = lane === 'all' || Math.abs((lane as number) - myLane) <= 1
    if (!adjacent && t.state !== 'predicted') continue
    const ttr = ahead / speed
    let tier: Tier = 'info'
    if (t.state === 'confirmed') {
      if (sameLane && (ahead < stop * 1.8 || ttr < 8)) tier = 'critical'
      else if (ttr < 30) tier = 'advisory'
    } else if (t.state === 'potential' || t.state === 'noticed') {
      if (ttr < 25) tier = 'advisory'
    } else if (t.state === 'predicted') {
      if (ahead < 300 && (c.night || c.wet)) tier = 'advisory'
    }
    out.push({ id: t.id, ahead, ttr, lane, sameLane, tier })
  }
  return out.sort((a, b) => a.ahead - b.ahead)
}
