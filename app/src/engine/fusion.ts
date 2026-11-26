// Evidence fusion: observations -> threats with a confidence and a lifecycle state.
//
// 1. Association: observations of compatible kinds close in space (and, for moving
//    objects, in time) belong to the same threat.
// 2. Evidence: each independent source contributes reliability x confidence x
//    reputation x time decay. Several reports from the same device count once.
// 3. Fusion: noisy-OR over independent sources; "passed and saw nothing" reports
//    from other sources pull confidence down.
// 4. Lifecycle: noticed -> potential -> confirmed -> resolved (or faded if it was
//    never confirmed and the evidence decays away).
import type { HazardKind, Observation, SourceKind, Threat, ThreatState, V2 } from './types'

export const RELIABILITY: Record<SourceKind, number> = {
  vision: 0.8,
  cctv: 0.85,
  imu: 0.45,
  swerve: 0.4,
  citizen: 0.55,
  history: 0.75,
  operator: 1,
  'driver-monitor': 0.7,
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** How long evidence stays fresh, per hazard. Moving things fade in seconds, potholes in weeks. */
export const HALF_LIFE: Record<HazardKind, number> = {
  pedestrian: 4_000,
  animal: 3 * MIN,
  'erratic-vehicle': 20_000,
  'stalled-vehicle': 20 * MIN,
  debris: 2 * HOUR,
  barricade: 12 * HOUR,
  waterlogging: 3 * HOUR,
  pothole: 45 * DAY,
  'speed-breaker': 365 * DAY,
  manhole: 7 * DAY,
  footpath: 180 * DAY,
  unknown: 30 * MIN,
}

/** Association radius in metres. */
export const RADIUS: Record<HazardKind, number> = {
  pedestrian: 14,
  animal: 25,
  'erratic-vehicle': 60,
  'stalled-vehicle': 25,
  debris: 15,
  barricade: 20,
  waterlogging: 40,
  pothole: 8,
  'speed-breaker': 8,
  manhole: 6,
  footpath: 30,
  unknown: 18,
}

const MOVING = new Set<HazardKind>(['pedestrian', 'animal', 'erratic-vehicle'])
const STATIC_OBSTACLE = new Set<HazardKind>([
  'pothole',
  'barricade',
  'speed-breaker',
  'debris',
  'manhole',
  'stalled-vehicle',
  'waterlogging',
])
const MOVING_GAP = 20_000 // a moving object unseen for 20 s is a new sighting

export const THRESHOLD = { notice: 0.12, potential: 0.35, confirm: 0.75, strong: 0.92, resolve: 0.2 }

const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function compatible(a: HazardKind, b: HazardKind) {
  if (a === b) return true
  // a swerve cluster is something in the road: a static obstacle, or an animal standing in it
  if (a === 'unknown') return STATIC_OBSTACLE.has(b) || b === 'animal'
  if (b === 'unknown') return STATIC_OBSTACLE.has(a) || a === 'animal'
  return false
}

export function decay(ageMs: number, kind: HazardKind) {
  if (ageMs <= 0) return 1
  return Math.pow(0.5, ageMs / HALF_LIFE[kind])
}

/** The most specific kind in a cluster: a named hazard beats "unknown"; the latest named one wins. */
export function clusterKind(obs: Observation[]): HazardKind {
  let kind: HazardKind = 'unknown'
  for (const o of obs) if (o.kind !== 'unknown' && !o.resolve) kind = o.kind
  return kind
}

interface Cluster {
  obs: Observation[]
  kind: HazardKind
  anchor: V2
  lastT: number
}

/** Group observations into candidate threats. Input order does not matter. */
export function associate(observations: Observation[]): Observation[][] {
  const sorted = [...observations].sort((a, b) => a.t - b.t)
  const clusters: Cluster[] = []
  for (const o of sorted) {
    let best: Cluster | null = null
    let bestD = Infinity
    for (const c of clusters) {
      if (!compatible(c.kind, o.kind)) continue
      const k = c.kind === 'unknown' ? o.kind : c.kind
      if (MOVING.has(k) && o.t - c.lastT > MOVING_GAP) continue
      const d = dist(c.anchor, o.pos)
      if (d <= Math.max(RADIUS[k], RADIUS[o.kind]) && d < bestD) {
        best = c
        bestD = d
      }
    }
    if (!best) {
      clusters.push({ obs: [o], kind: o.kind, anchor: o.pos, lastT: o.t })
      continue
    }
    best.obs.push(o)
    best.lastT = Math.max(best.lastT, o.t)
    if (best.kind === 'unknown' && o.kind !== 'unknown') best.kind = o.kind
    if (o.polarity === -1 || o.resolve) continue
    if (MOVING.has(best.kind)) best.anchor = o.pos
    else {
      const pos = best.obs.filter((x) => x.polarity !== -1 && !x.resolve)
      best.anchor = [pos.reduce((s, x) => s + x.pos[0], 0) / pos.length, pos.reduce((s, x) => s + x.pos[1], 0) / pos.length]
    }
  }
  return clusters.map((c) => c.obs)
}

/** Fused confidence of one cluster at time `now`. */
export function evidence(obs: Observation[], kind: HazardKind, now: number) {
  const perSource = new Map<string, number>()
  let lastPositive = -Infinity
  for (const o of obs) {
    if (o.t > now || o.polarity === -1 || o.resolve) continue
    const e = RELIABILITY[o.source] * o.conf * (o.reputation ?? 1) * decay(now - o.t, kind)
    perSource.set(o.sourceId, Math.max(perSource.get(o.sourceId) ?? 0, e))
    lastPositive = Math.max(lastPositive, o.t)
  }
  let miss = 1
  let sources = 0
  for (const e of perSource.values()) {
    miss *= 1 - e
    if (e > 0.05) sources++
  }
  let conf = 1 - miss

  // "Passed and saw nothing" from sources that are not the reporters themselves.
  const clears = new Map<string, number>()
  for (const o of obs) {
    if (o.t > now || o.polarity !== -1 || o.t < lastPositive || perSource.has(o.sourceId)) continue
    clears.set(o.sourceId, Math.max(clears.get(o.sourceId) ?? 0, RELIABILITY[o.source] * o.conf * 0.6))
  }
  for (const c of clears.values()) conf *= 1 - c

  const resolvedByOperator = obs.some((o) => o.resolve && o.t <= now && o.t >= lastPositive)
  return { conf, sources, lastPositive, resolvedByOperator, clears: clears.size }
}

export function classify(conf: number, sources: number, wasConfirmed: boolean, resolved: boolean): ThreatState {
  if (resolved) return 'resolved'
  // Once confirmed, a threat never slides back to "possible": it stays confirmed while the
  // evidence holds and is resolved when it decays below the potential band.
  if (wasConfirmed) return conf >= THRESHOLD.potential ? 'confirmed' : 'resolved'
  if ((conf >= THRESHOLD.confirm && sources >= 2) || conf >= THRESHOLD.strong) return 'confirmed'
  if (conf >= THRESHOLD.potential) return 'potential'
  if (conf >= THRESHOLD.notice) return 'noticed'
  return 'faded'
}

/** Fuse every observation known at `now` into the current list of threats. */
export function fuse(observations: Observation[], now: number): Threat[] {
  const known = observations.filter((o) => o.t <= now)
  const out: Threat[] = []
  for (const obs of associate(known)) {
    const positives = obs.filter((o) => o.polarity !== -1 && !o.resolve)
    if (positives.length === 0) continue
    const kind = clusterKind(obs)

    // Peak confidence over the threat's history decides whether it was ever confirmed.
    let peak = 0
    let wasConfirmed = false
    for (const o of positives) {
      const e = evidence(obs, kind, o.t)
      peak = Math.max(peak, e.conf)
      if ((e.conf >= THRESHOLD.confirm && e.sources >= 2) || e.conf >= THRESHOLD.strong) wasConfirmed = true
    }
    const now_ = evidence(obs, kind, now)
    const state = classify(now_.conf, now_.sources, wasConfirmed, now_.resolvedByOperator)

    const latest = positives.reduce((a, b) => (b.t > a.t ? b : a))
    const pos: V2 = MOVING.has(kind)
      ? latest.pos
      : [positives.reduce((s, o) => s + o.pos[0], 0) / positives.length, positives.reduce((s, o) => s + o.pos[1], 0) / positives.length]
    out.push({
      id: positives[0].id,
      kind,
      pos,
      state,
      confidence: now_.conf,
      peak,
      sources: now_.sources,
      observations: obs,
      firstSeen: positives[0].t,
      lastSeen: latest.t,
      clearedBy: now_.clears,
      note: [...positives].reverse().find((o) => o.note)?.note,
    })
  }
  return out
}
