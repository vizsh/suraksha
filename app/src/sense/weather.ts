// Live weather for the corridor from Open-Meteo (free, no key). Rain and low visibility
// lengthen stopping distance in the driver feed and raise predicted-risk alerts.
import { cachedJson } from './cachedJson'
import { create } from 'zustand'

export interface Weather {
  temperature: number
  precipitation: number // mm in the last hour
  visibility: number // metres
  isDay: boolean
  code: number
  fetchedAt: number
}

interface WeatherState {
  weather: Weather | null
  status: 'idle' | 'loading' | 'ok' | 'error'
  load: () => Promise<void>
}

const POWAI = { lat: 19.122, lon: 72.9097 }

export const useWeather = create<WeatherState>((set, get) => ({
  weather: null,
  status: 'idle',
  load: async () => {
    const { status, weather } = get()
    if (status === 'loading' || (weather && Date.now() - weather.fetchedAt < 10 * 60_000)) return
    set({ status: 'loading' })
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${POWAI.lat}&longitude=${POWAI.lon}&current=temperature_2m,precipitation,visibility,is_day,weather_code&timezone=Asia%2FKolkata`
      const j = await cachedJson<{ current: Record<string, number> }>(url, 10 * 60_000)
      const c = j.current
      set({
        status: 'ok',
        weather: {
          temperature: c.temperature_2m,
          precipitation: c.precipitation ?? 0,
          visibility: c.visibility ?? 10_000,
          isDay: c.is_day === 1,
          code: c.weather_code ?? 0,
          fetchedAt: Date.now(),
        },
      })
    } catch {
      set({ status: 'error' })
    }
  },
}))

export function weatherWords(w: Weather | null) {
  if (!w) return 'Weather unavailable'
  const sky =
    w.code >= 95 ? 'Thunderstorm' : w.code >= 61 ? 'Rain' : w.code >= 51 ? 'Drizzle' : w.code >= 45 ? 'Fog' : w.code >= 2 ? 'Cloudy' : 'Clear'
  const vis = w.visibility >= 10_000 ? '10+ km' : `${(w.visibility / 1000).toFixed(1)} km`
  return `${sky}, ${Math.round(w.temperature)}°C, visibility ${vis}`
}

export function conditionsFrom(w: Weather | null) {
  return {
    wet: !!w && w.precipitation > 0.2,
    night: !!w && !w.isDay,
    visibilityM: w?.visibility,
  }
}
