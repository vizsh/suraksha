// Where the driver is looking: head pose plus eye direction, from MediaPipe face landmarks.
// Everything is in image terms (x to the right of the unmirrored camera image, which is the
// driver's left; y down), measured relative to a calibration taken while the driver looks at
// the road, so the camera can sit anywhere on the dashboard or laptop.
//
// Head turn: the nose tip shifts sideways relative to the midpoint of the eyes as the head turns.
// Head nod: the nose tip moves toward the mouth as the head pitches down.
// Eyes: the iris centre moves within the eye opening; the model's eye-look scores add up/down,
// which the iris alone measures poorly. Gaze = head + eyes, so a head turned toward a mirror with
// the eyes back on the road still counts as watching the road, and a level head with the eyes
// dropped to a phone does not.

export interface Pt {
  x: number
  y: number
  z?: number
}

/** Raw, uncalibrated measurements from one frame. */
export interface Raw {
  noseX: number // nose offset from the eye midpoint, in eye-distances (+ = driver's left)
  noseY: number // nose drop below the eye line, in eye-distances
  irisX: number // mean iris offset from the eye centre, in eye widths (+ = driver's left)
  eyeUpDown: number // eye-look up minus down, 0..1 scores (+ = up)
  roll: number // head tilt toward a shoulder, degrees (+ = toward the driver's left shoulder)
  closed: number // eye closure, 0..1
}

export interface Calibration {
  noseX: number
  noseY: number
  irisX: number
  eyeUpDown: number
  roll: number
}

export interface Gaze {
  headYaw: number
  headPitch: number
  eyeYaw: number
  eyePitch: number
  yaw: number // head + eyes, degrees (+ = driver's left)
  pitch: number // degrees (+ = up)
  roll: number
}

// MediaPipe face mesh indices
export const L_EYE = { outer: 263, inner: 362, top: 386, bottom: 374, iris: 473 }
export const R_EYE = { outer: 33, inner: 133, top: 159, bottom: 145, iris: 468 }
export const NOSE = 1

// Gains that turn the ratios above into degrees. Chosen so that a head turned until the far
// eye starts to hide reads about 45 degrees, and an iris at the corner of the eye about 30.
const HEAD_YAW_GAIN = 95
const HEAD_PITCH_GAIN = 110
const EYE_YAW_GAIN = 120
const EYE_PITCH_GAIN = 32

/** The road, as seen from the driver's seat: where the eyes must be to count as watching it. */
export const ROAD = { yaw: 22, up: 12, down: -14 }

export function measure(lm: Pt[], blend: (name: string) => number): Raw {
  const l = L_EYE
  const r = R_EYE
  const mid = { x: (lm[l.outer].x + lm[r.outer].x) / 2, y: (lm[l.outer].y + lm[r.outer].y) / 2 }
  const eyeDist = Math.hypot(lm[l.outer].x - lm[r.outer].x, lm[l.outer].y - lm[r.outer].y) || 1e-6
  // put everything in the frame of the eye line, so head roll does not leak into yaw or pitch
  const ang = Math.atan2(lm[l.outer].y - lm[r.outer].y, lm[l.outer].x - lm[r.outer].x)
  const c = Math.cos(-ang)
  const s = Math.sin(-ang)
  const rot = (p: Pt) => ({ x: (p.x - mid.x) * c - (p.y - mid.y) * s, y: (p.x - mid.x) * s + (p.y - mid.y) * c })
  const nose = rot(lm[NOSE])
  const iris = (e: typeof l) => {
    const a = rot(lm[e.outer])
    const b = rot(lm[e.inner])
    const w = Math.abs(a.x - b.x) || 1e-6
    return (rot(lm[e.iris]).x - (a.x + b.x) / 2) / w
  }
  return {
    noseX: nose.x / eyeDist,
    noseY: nose.y / eyeDist,
    irisX: (iris(l) + iris(r)) / 2,
    eyeUpDown: (blend('eyeLookUpLeft') + blend('eyeLookUpRight') - blend('eyeLookDownLeft') - blend('eyeLookDownRight')) / 2,
    roll: (ang * 180) / Math.PI,
    closed: (blend('eyeBlinkLeft') + blend('eyeBlinkRight')) / 2,
  }
}

export function calibrate(samples: Raw[]): Calibration {
  const med = (k: keyof Calibration) => {
    const v = samples.map((x) => x[k]).sort((a, b) => a - b)
    return v[Math.floor(v.length / 2)] ?? 0
  }
  return { noseX: med('noseX'), noseY: med('noseY'), irisX: med('irisX'), eyeUpDown: med('eyeUpDown'), roll: med('roll') }
}

export function gaze(raw: Raw, cal: Calibration): Gaze {
  const headYaw = (raw.noseX - cal.noseX) * HEAD_YAW_GAIN
  const headPitch = -(raw.noseY - cal.noseY) * HEAD_PITCH_GAIN
  const eyeYaw = (raw.irisX - cal.irisX) * EYE_YAW_GAIN
  const eyePitch = (raw.eyeUpDown - cal.eyeUpDown) * EYE_PITCH_GAIN
  return { headYaw, headPitch, eyeYaw, eyePitch, yaw: headYaw + eyeYaw, pitch: headPitch + eyePitch, roll: raw.roll - cal.roll }
}

export function onRoad(g: Gaze) {
  return Math.abs(g.yaw) <= ROAD.yaw && g.pitch <= ROAD.up && g.pitch >= ROAD.down
}

/** Smooth a gaze over frames (exponential), so a jittery landmark does not flicker the state. */
export function smooth(prev: Gaze | null, next: Gaze, k = 0.35): Gaze {
  if (!prev) return next
  const m = (a: number, b: number) => a + (b - a) * k
  return {
    headYaw: m(prev.headYaw, next.headYaw),
    headPitch: m(prev.headPitch, next.headPitch),
    eyeYaw: m(prev.eyeYaw, next.eyeYaw),
    eyePitch: m(prev.eyePitch, next.eyePitch),
    yaw: m(prev.yaw, next.yaw),
    pitch: m(prev.pitch, next.pitch),
    roll: m(prev.roll, next.roll),
  }
}

export type Attention = 'calibrating' | 'attentive' | 'glance' | 'eyes-off-road' | 'looking-down' | 'drowsy' | 'microsleep'

/**
 * Classify the moment. A glance away under 2 s is normal driving (mirrors, a sign); 2 s or more
 * doubles crash risk in naturalistic driving studies, so it becomes a warning. Looking down for
 * that long is called out separately: it is usually a phone.
 */
export function classify(o: { calibrated: boolean; onRoad: boolean; offFor: number; pitch: number; closedFor: number; headDropped: boolean; perclos: number; yawns: number }): Attention {
  if (!o.calibrated) return 'calibrating'
  if (o.closedFor > 1.2 || (o.headDropped && o.closedFor > 0.5)) return 'microsleep'
  if (!o.onRoad && o.offFor >= 2) return o.pitch < ROAD.down ? 'looking-down' : 'eyes-off-road'
  if (o.perclos > 0.15 || o.yawns >= 2) return 'drowsy'
  if (!o.onRoad) return 'glance'
  return 'attentive'
}
