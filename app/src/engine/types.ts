// Threat Intelligence Engine: shared types.
// Positions are local metres around the corridor origin (x east, z south).

export type V2 = [number, number]

export type HazardKind =
  | 'pedestrian'
  | 'pothole'
  | 'barricade'
  | 'speed-breaker'
  | 'debris'
  | 'waterlogging'
  | 'stalled-vehicle'
  | 'animal'
  | 'manhole'
  | 'footpath'
  | 'erratic-vehicle'
  | 'unknown'

export type SourceKind =
  | 'vision' // dashcam detector on a connected car
  | 'cctv' // fixed city camera
  | 'imu' // accelerometer spike from a car or phone
  | 'swerve' // implicit: cluster of avoidance manoeuvres
  | 'citizen' // photo report from a resident
  | 'history' // past records for this spot
  | 'operator' // city operator action
  | 'driver-monitor' // in-cabin fatigue or distraction monitor

/** One piece of evidence about the road. Everything the network learns arrives as one of these. */
export interface Observation {
  id: string
  t: number // engine ms
  kind: HazardKind
  source: SourceKind
  sourceId: string // device, person or cluster. One vote per sourceId.
  pos: V2
  conf: number // detector or reporter confidence, 0..1
  polarity?: 1 | -1 // -1: "passed this spot and saw nothing"
  resolve?: boolean // operator closes the threat (for example after repair)
  reputation?: number // trust in this source, 0..1 (new reporters start lower)
  who: string
  how: string
  note?: string
}

/** A swerve or harsh-brake event. On its own it is not a hazard; clusters of them are. */
export interface Manoeuvre {
  id: string
  t: number
  vehicleId: string
  pos: V2
  type: 'swerve' | 'harsh-brake'
}

export type ThreatState = 'noticed' | 'potential' | 'confirmed' | 'resolved' | 'faded' | 'predicted'

export interface Threat {
  id: string
  kind: HazardKind
  pos: V2
  state: ThreatState
  confidence: number
  peak: number
  sources: number // independent sources currently contributing
  observations: Observation[]
  firstSeen: number
  lastSeen: number
  clearedBy: number // distinct passers since the last sighting whose sensors saw nothing there
  note?: string
}
