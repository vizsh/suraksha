// Phone as a road sensor: accelerometer spikes become pothole or bump observations.
// Gravity is removed with a low-pass filter, so it works in any phone orientation.
// A shake in the hand triggers the same detector, which makes it demonstrable off the road.
import { create } from 'zustand'

export interface Bump {
  id: string
  at: number // wall ms
  peak: number // m/s² above baseline
}

interface MotionState {
  status: 'off' | 'asking' | 'running' | 'denied' | 'unsupported'
  trace: number[] // recent |a| samples, newest last
  bumps: Bump[]
  threshold: number
}

export const useMotion = create<MotionState>(() => ({ status: 'off', trace: [], bumps: [], threshold: 7.5 }))

const listeners = new Set<(b: Bump) => void>()
export function onBump(fn: (b: Bump) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

let gravity = [0, 0, 9.81]
let lastBump = 0
let attached = false

function handle(e: DeviceMotionEvent) {
  let x = 0
  let y = 0
  let z = 0
  if (e.acceleration && e.acceleration.x !== null) {
    x = e.acceleration.x ?? 0
    y = e.acceleration.y ?? 0
    z = e.acceleration.z ?? 0
  } else if (e.accelerationIncludingGravity) {
    const g = e.accelerationIncludingGravity
    const k = 0.9
    gravity = [k * gravity[0] + (1 - k) * (g.x ?? 0), k * gravity[1] + (1 - k) * (g.y ?? 0), k * gravity[2] + (1 - k) * (g.z ?? 0)]
    x = (g.x ?? 0) - gravity[0]
    y = (g.y ?? 0) - gravity[1]
    z = (g.z ?? 0) - gravity[2]
  }
  const mag = Math.hypot(x, y, z)
  const st = useMotion.getState()
  const trace = st.trace.length > 180 ? st.trace.slice(-180) : st.trace.slice()
  trace.push(mag)
  const now = Date.now()
  if (mag > st.threshold && now - lastBump > 1500) {
    lastBump = now
    const bump = { id: `bump-${now}`, at: now, peak: mag }
    useMotion.setState({ trace, bumps: [bump, ...st.bumps].slice(0, 12) })
    listeners.forEach((l) => l(bump))
  } else {
    useMotion.setState({ trace })
  }
}

/** Must be called from a tap: iOS asks for motion permission only inside a user gesture. */
export async function startMotion() {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
    useMotion.setState({ status: 'unsupported' })
    return
  }
  const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
  if (typeof DME.requestPermission === 'function') {
    useMotion.setState({ status: 'asking' })
    try {
      const r = await DME.requestPermission()
      if (r !== 'granted') {
        useMotion.setState({ status: 'denied' })
        return
      }
    } catch {
      useMotion.setState({ status: 'denied' })
      return
    }
  }
  if (!attached) {
    window.addEventListener('devicemotion', handle)
    attached = true
  }
  useMotion.setState({ status: 'running' })
  // desktops expose the API but never fire events; say so after a moment
  setTimeout(() => {
    if (useMotion.getState().trace.length === 0) useMotion.setState({ status: 'unsupported' })
  }, 2500)
}

export function stopMotion() {
  window.removeEventListener('devicemotion', handle)
  attached = false
  useMotion.setState({ status: 'off', trace: [] })
}

/** For laptops and rehearsals: inject a bump as if the phone had hit a pothole. */
export function simulateBump(peak = 9.2) {
  const now = Date.now()
  const bump = { id: `bump-${now}`, at: now, peak }
  useMotion.setState((s) => ({ bumps: [bump, ...s.bumps].slice(0, 12), trace: [...s.trace.slice(-170), 1, 3, peak, 4, 1] }))
  listeners.forEach((l) => l(bump))
}
