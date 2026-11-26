// Monsoon early warning. Rain forecast for the next 6 hours (Open-Meteo) plus the lowest points
// on the corridor's roads (Open-Meteo elevation, Copernicus DEM). Heavy rain forecast over a low
// point raises a predicted waterlogging threat before any water is on the road.
import { create } from 'zustand'
import type { V2 } from '../engine/types'
import { toLatLon } from '../world/corridor'
import type { World } from '../world/scenario'

export interface LowPoint {
  id: string
  pos: V2
  elev: number
  road: string
}
export interface HourRain {
  time: string // HH:00
  mm: number
  prob: number
}

interface MonsoonState {
  status: 'idle' | 'loading' | 'ok' | 'error'
  lowPoints: LowPoint[]
  hours: HourRain[]
  simulated: boolean
  load: (w: World) => Promise<void>
  simulate: (on: boolean) => void
}

export const WARN_MM = 8 // rain in the next 6 hours that floods low points on this corridor
const CLOUDBURST: HourRain[] = [12, 18, 14, 9, 6, 5].map((mm, i) => ({ time: '', mm, prob: 90 - i * 4 }))

export const useMonsoon = create<MonsoonState>((set, get) => ({
  status: 'idle',
  lowPoints: [],
  hours: [],
  simulated: false,
  simulate: (simulated) => set({ simulated }),
  load: async (w) => {
    if (get().status === 'loading' || get().status === 'ok') return
    set({ status: 'loading' })
    try {
      // sample major roads every ~70 m, up to 100 points (one API call)
      const samples: { pos: V2; road: string }[] = []
      for (const r of w.data.roads) {
        if (!r.name || !['primary', 'secondary', 'tertiary', 'trunk'].includes(r.kind)) continue
        let carry = 0
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, az] = r.pts[i]
          const [bx, bz] = r.pts[i + 1]
          const len = Math.hypot(bx - ax, bz - az)
          for (let s = carry; s < len; s += 70) samples.push({ pos: [ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len], road: r.name ?? 'Unnamed road' })
          carry = (carry - len) % 70
          if (carry < 0) carry += 70
        }
      }
      const step = Math.max(1, Math.ceil(samples.length / 100))
      const pick = samples.filter((_, i) => i % step === 0).slice(0, 100)
      const ll = pick.map((p) => toLatLon(w.data, p.pos[0], p.pos[1]))
      const lat0 = w.data.origin.lat.toFixed(4)
      const lon0 = w.data.origin.lon.toFixed(4)
      const [elevRes, rainRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/elevation?latitude=${ll.map((p) => p.lat.toFixed(5)).join(',')}&longitude=${ll.map((p) => p.lon.toFixed(5)).join(',')}`),
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat0}&longitude=${lon0}&hourly=precipitation,precipitation_probability&forecast_hours=6&timezone=Asia%2FKolkata`),
      ])
      const elev = (await elevRes.json()).elevation as number[]
      const rain = await rainRes.json()
      const ranked = pick.map((p, i) => ({ ...p, elev: elev[i] })).sort((a, b) => a.elev - b.elev)
      const low: LowPoint[] = []
      for (const r of ranked) {
        if (low.length === 3) break
        if (low.some((l) => Math.hypot(l.pos[0] - r.pos[0], l.pos[1] - r.pos[1]) < 180)) continue
        low.push({ id: `low-${low.length}`, pos: r.pos, elev: r.elev, road: r.road })
      }
      const hours: HourRain[] = (rain.hourly?.time ?? []).map((t: string, i: number) => ({
        time: t.slice(11, 16),
        mm: rain.hourly.precipitation[i] ?? 0,
        prob: rain.hourly.precipitation_probability?.[i] ?? 0,
      }))
      set({ status: 'ok', lowPoints: low, hours })
    } catch {
      set({ status: 'error' })
    }
  },
}))

/** The forecast the warning uses: real, or the simulated cloudburst for rehearsal. */
export function activeForecast(s: Pick<MonsoonState, 'hours' | 'simulated'>): HourRain[] {
  if (!s.simulated) return s.hours
  return CLOUDBURST.map((h, i) => ({ ...h, time: s.hours[i]?.time ?? `+${i + 1}h` }))
}

export function totalMm(hours: HourRain[]) {
  return hours.reduce((a, h) => a + h.mm, 0)
}
