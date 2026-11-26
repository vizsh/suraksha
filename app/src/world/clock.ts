// One clock for every surface and every device.
// Engine time is wall-clock based, so a phone, a laptop and a projector that open the app
// independently all show the same moment of the scenario without any server.
// The director can pause or seek; that state is shared across tabs (BroadcastChannel)
// and, when the shared event API is configured, across devices.

export const LOOP = 48 // seconds per scenario loop
const LOOP_MS = LOOP * 1000

export interface ClockState {
  offsetMs: number // engine time = Date.now() - offsetMs
  paused: boolean
  pausedAt: number // engine ms frozen while paused
  stamp: number // wall ms when this state was set; newest wins
}

const KEY = 'suraksha.clock'
const listeners = new Set<() => void>()
let state: ClockState = read() ?? { offsetMs: 0, paused: false, pausedAt: 0, stamp: 0 }

function read(): ClockState | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    return raw ? (JSON.parse(raw) as ClockState) : null
  } catch {
    return null
  }
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('suraksha-clock') : null
channel?.addEventListener('message', (e: MessageEvent<ClockState>) => applyClock(e.data, false))

/** Adopt a clock state from another tab or device if it is newer than ours. */
export function applyClock(next: ClockState, broadcast = true) {
  if (!next || next.stamp <= state.stamp) return
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage may be unavailable in private mode */
  }
  if (broadcast) channel?.postMessage(state)
  listeners.forEach((l) => l())
}

export function onClockChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function clockState() {
  return state
}

// A page can drive the scenario itself (the landing page scrubs it with scroll).
// The override is local to this tab and never broadcast.
let override: number | null = null
let overrideLoop = 0
export function setOverride(t: number | null) {
  if (t !== null && override === null) overrideLoop = Math.floor((Date.now() - state.offsetMs) / LOOP_MS)
  override = t
}

/** Engine time in ms. */
export function engineNow() {
  if (override !== null) return overrideLoop * LOOP_MS + override * 1000
  return state.paused ? state.pausedAt : Date.now() - state.offsetMs
}

/** Seconds into the current scenario loop. */
export function simTime() {
  const s = engineNow() / 1000
  return ((s % LOOP) + LOOP) % LOOP
}

/** Engine ms at which the current loop started. */
export function loopStart() {
  const now = engineNow()
  return now - (((now % LOOP_MS) + LOOP_MS) % LOOP_MS)
}

export function loopIndex() {
  return Math.floor(engineNow() / LOOP_MS)
}

/** Jump to second t of the current loop, keeping play or pause. */
export function seek(t: number) {
  const target = loopStart() + Math.max(0, Math.min(LOOP - 0.01, t)) * 1000
  const now = Date.now()
  applyClock(
    state.paused
      ? { ...state, pausedAt: target, stamp: now }
      : { offsetMs: now - target, paused: false, pausedAt: 0, stamp: now },
  )
}

export function pause() {
  if (state.paused) return
  applyClock({ ...state, paused: true, pausedAt: engineNow(), stamp: Date.now() })
}

export function play() {
  if (!state.paused) return
  const now = Date.now()
  applyClock({ offsetMs: now - state.pausedAt, paused: false, pausedAt: 0, stamp: now })
}

/** Back to the shared wall-clock timeline that every device follows by default. */
export function resync() {
  applyClock({ offsetMs: 0, paused: false, pausedAt: 0, stamp: Date.now() })
}
