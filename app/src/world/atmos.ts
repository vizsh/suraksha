// Atmosphere for the 3D views: time of day and rain.
// "Live" follows the real Powai weather from Open-Meteo (day or night, raining or not).
import { create } from 'zustand'
import type { Weather } from '../sense/weather'

export type TimeOfDay = 'day' | 'dusk' | 'night'

interface AtmosState {
  time: TimeOfDay
  rain: boolean
  live: boolean
  heat: boolean
  setTime: (t: TimeOfDay) => void
  setRain: (r: boolean) => void
  setHeat: (h: boolean) => void
  goLive: (w: Weather | null) => void
}

export const useAtmos = create<AtmosState>((set) => ({
  time: 'day',
  rain: false,
  live: false,
  heat: false,
  setTime: (time) => set({ time, live: false }),
  setRain: (rain) => set({ rain, live: false }),
  setHeat: (heat) => set({ heat }),
  goLive: (w) => {
    if (!w) return set({ live: true })
    const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
    const time: TimeOfDay = !w.isDay ? 'night' : hour >= 17 || hour < 7 ? 'dusk' : 'day'
    set({ live: true, time, rain: w.precipitation > 0.1 || (w.code >= 51 && w.code < 70) || w.code >= 80 })
  },
}))

/** Sun direction and colour for each time of day (elevation in degrees). */
export const SUN: Record<TimeOfDay, { elev: number; az: number; color: string; intensity: number; env: number; fog: string; sky: number }> = {
  day: { elev: 18, az: 205, color: '#fff1dc', intensity: 3.1, env: 0.85, fog: '#d6dde0', sky: 0.9 },
  dusk: { elev: 5, az: 250, color: '#ff9a5c', intensity: 2.2, env: 0.32, fog: '#8d8a95', sky: 0.38 },
  night: { elev: 35, az: 160, color: '#9db4d6', intensity: 0.25, env: 0.3, fog: '#0f151c', sky: 0.6 },
}
