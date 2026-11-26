// Events created by people and devices during the demo: citizen reports, phone IMU spikes,
// driver-monitor alerts, operator work orders. Persisted locally, shared across tabs with
// BroadcastChannel, and shared across devices through /api/events when it is configured
// (Vercel function backed by Upstash Redis). Without it everything still works per browser.
import { create } from 'zustand'
import type { Manoeuvre, Observation, V2 } from '../engine/types'
import { applyClock, clockState, onClockChange, type ClockState } from '../world/clock'

export interface WorkOrder {
  id: string
  threatId: string
  label: string
  pos: V2
  createdAt: number
  status: 'dispatched' | 'repaired'
  crew: string
  repairedAt?: number
}

type Envelope =
  | { type: 'obs'; obs: Observation; thumb?: string }
  | { type: 'man'; man: Manoeuvre }
  | { type: 'wo'; wo: WorkOrder }
  | { type: 'reset'; at: number }

export type RemoteStatus = 'off' | 'checking' | 'on' | 'unavailable'

interface EventsState {
  deviceId: string
  observations: Observation[]
  manoeuvres: Manoeuvre[]
  workOrders: WorkOrder[]
  thumbs: Record<string, string>
  remote: RemoteStatus
  addObservation: (o: Observation, thumb?: string) => void
  addManoeuvre: (m: Manoeuvre) => void
  upsertWorkOrder: (w: WorkOrder) => void
  resetAll: () => void
  apply: (e: Envelope) => void
}

const KEY = 'suraksha.events.v1'
const MAX = 400

function deviceId() {
  try {
    let id = localStorage.getItem('suraksha.device')
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem('suraksha.device', id)
    }
    return id
  } catch {
    return 'dev-' + Math.random().toString(36).slice(2, 10)
  }
}

function load(): Pick<EventsState, 'observations' | 'manoeuvres' | 'workOrders' | 'thumbs'> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { observations: [], manoeuvres: [], workOrders: [], thumbs: {} }
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('suraksha-events') : null

export const useEvents = create<EventsState>((set, get) => ({
  deviceId: deviceId(),
  ...load(),
  remote: 'off',
  addObservation: (obs, thumb) => share({ type: 'obs', obs, thumb }),
  addManoeuvre: (man) => share({ type: 'man', man }),
  upsertWorkOrder: (wo) => share({ type: 'wo', wo }),
  resetAll: () => share({ type: 'reset', at: Date.now() }),
  apply: (e) => {
    const s = get()
    if (e.type === 'obs') {
      if (s.observations.some((o) => o.id === e.obs.id)) return
      set({
        observations: [...s.observations, e.obs].slice(-MAX),
        thumbs: e.thumb ? { ...s.thumbs, [e.obs.id]: e.thumb } : s.thumbs,
      })
    } else if (e.type === 'man') {
      if (s.manoeuvres.some((m) => m.id === e.man.id)) return
      set({ manoeuvres: [...s.manoeuvres, e.man].slice(-MAX) })
    } else if (e.type === 'wo') {
      const rest = s.workOrders.filter((w) => w.id !== e.wo.id)
      set({ workOrders: [...rest, e.wo] })
    } else if (e.type === 'reset') {
      set({ observations: [], manoeuvres: [], workOrders: [], thumbs: {} })
    }
    persist()
  },
}))

function persist() {
  const { observations, manoeuvres, workOrders, thumbs } = useEvents.getState()
  try {
    localStorage.setItem(KEY, JSON.stringify({ observations, manoeuvres, workOrders, thumbs }))
  } catch {
    // thumbnails can exceed the quota; drop them before giving up
    try {
      localStorage.setItem(KEY, JSON.stringify({ observations, manoeuvres, workOrders, thumbs: {} }))
    } catch {
      /* ignore */
    }
  }
}

function share(e: Envelope) {
  useEvents.getState().apply(e)
  channel?.postMessage(e)
  if (useEvents.getState().remote === 'on') void post({ envelope: e })
}

channel?.addEventListener('message', (m: MessageEvent<Envelope>) => useEvents.getState().apply(m.data))

// ---------- cross-device sync through /api/events ----------

let since = 0
let started = false

async function post(body: unknown) {
  try {
    await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    /* offline: local copy is still correct */
  }
}

async function poll() {
  try {
    const res = await fetch(`/api/events?since=${since}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { configured: boolean; events: { stamp: number; envelope: Envelope }[]; clock: ClockState | null }
    if (!data.configured) {
      useEvents.setState({ remote: 'unavailable' })
      return false
    }
    useEvents.setState({ remote: 'on' })
    for (const ev of data.events) {
      since = Math.max(since, ev.stamp)
      useEvents.getState().apply(ev.envelope)
    }
    if (data.clock) applyClock(data.clock)
    return true
  } catch {
    if (useEvents.getState().remote !== 'on') useEvents.setState({ remote: 'unavailable' })
    return useEvents.getState().remote === 'on'
  }
}

/** Start cross-device sync if the deployment has a shared store. Safe to call many times. */
export function startRemoteSync() {
  if (started || typeof window === 'undefined') return
  started = true
  useEvents.setState({ remote: 'checking' })
  void poll().then((ok) => {
    if (!ok) return
    // push anything this device created before sync was available
    const { observations, manoeuvres, workOrders } = useEvents.getState()
    for (const obs of observations) void post({ envelope: { type: 'obs', obs } })
    for (const man of manoeuvres) void post({ envelope: { type: 'man', man } })
    for (const wo of workOrders) void post({ envelope: { type: 'wo', wo } })
    // poll only while the page is visible, to keep the shared store's usage small
    setInterval(() => {
      if (document.visibilityState === 'visible') void poll()
    }, 2000)
    onClockChange(() => void post({ clock: clockState() }))
  })
}
