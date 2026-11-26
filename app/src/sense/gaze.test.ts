import { describe, expect, it } from 'vitest'
import { L_EYE, NOSE, R_EYE, calibrate, classify, gaze, measure, onRoad, type Pt } from './gaze'

// A synthetic face in image coordinates (x right = driver's left in the unmirrored image).
function face({ nose = 0, irisL = 0, irisR = 0, noseDrop = 0.55, tilt = 0 } = {}) {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  const put = (i: number, x: number, y: number) => {
    // optional roll about the face centre
    const c = Math.cos(tilt)
    const s = Math.sin(tilt)
    lm[i] = { x: 0.5 + (x - 0.5) * c - (y - 0.45) * s, y: 0.45 + (x - 0.5) * s + (y - 0.45) * c }
  }
  // eyes 0.2 apart, each 0.06 wide
  put(R_EYE.outer, 0.4, 0.45)
  put(R_EYE.inner, 0.46, 0.45)
  put(L_EYE.inner, 0.54, 0.45)
  put(L_EYE.outer, 0.6, 0.45)
  put(R_EYE.iris, 0.43 + irisR * 0.06, 0.45)
  put(L_EYE.iris, 0.57 + irisL * 0.06, 0.45)
  put(NOSE, 0.5 + nose * 0.2, 0.45 + noseDrop * 0.2)
  return lm
}
const none = () => 0
const cal = calibrate([measure(face(), none)])

describe('gaze: head plus eyes', () => {
  it('reads straight ahead as on the road after calibration', () => {
    const g = gaze(measure(face(), none), cal)
    expect(Math.abs(g.yaw)).toBeLessThan(1)
    expect(onRoad(g)).toBe(true)
  })

  it('a head turned away is off the road', () => {
    const g = gaze(measure(face({ nose: 0.4 }), none), cal)
    expect(g.headYaw).toBeGreaterThan(30)
    expect(onRoad(g)).toBe(false)
  })

  it('a head turned away with the eyes turned back is still on the road', () => {
    const g = gaze(measure(face({ nose: 0.4, irisL: -0.3, irisR: -0.3 }), none), cal)
    expect(g.headYaw).toBeGreaterThan(30)
    expect(g.eyeYaw).toBeLessThan(-30)
    expect(onRoad(g)).toBe(true)
  })

  it('a level head with the eyes dropped is off the road', () => {
    const down = (n: string) => (n.startsWith('eyeLookDown') ? 0.9 : 0)
    const g = gaze(measure(face(), down), cal)
    expect(g.pitch).toBeLessThan(-14)
    expect(onRoad(g)).toBe(false)
  })

  it('head roll alone does not read as looking away', () => {
    const g = gaze(measure(face({ tilt: 0.35 }), none), cal)
    expect(Math.abs(g.roll)).toBeGreaterThan(15)
    expect(onRoad(g)).toBe(true)
  })
})

describe('attention states', () => {
  const base = { calibrated: true, onRoad: true, offFor: 0, pitch: 0, closedFor: 0, headDropped: false, perclos: 0, yawns: 0 }
  it('a short glance is normal driving', () => expect(classify({ ...base, onRoad: false, offFor: 1.2 })).toBe('glance'))
  it('two seconds away is a warning', () => expect(classify({ ...base, onRoad: false, offFor: 2.1 })).toBe('eyes-off-road'))
  it('two seconds looking down reads as a phone', () => expect(classify({ ...base, onRoad: false, offFor: 2.5, pitch: -30 })).toBe('looking-down'))
  it('long closure is a microsleep, whatever else', () => expect(classify({ ...base, onRoad: false, offFor: 3, closedFor: 1.5 })).toBe('microsleep'))
  it('waits for calibration', () => expect(classify({ ...base, calibrated: false })).toBe('calibrating'))
})
