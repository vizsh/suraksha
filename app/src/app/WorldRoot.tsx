import { useEffect, type ReactNode } from 'react'
import { loadCorridor } from '../world/corridor'
import { buildWorld } from '../world/scenario'
import { useSim } from '../world/store'
import { onClockChange } from '../world/clock'
import { useWeather } from '../sense/weather'
import { startRemoteSync, useEvents } from '../sync/events'

/** Loads the corridor once, runs the shared ticker, live weather and cross-device sync. */
export function WorldRoot({ children }: { children: ReactNode }) {
  const world = useSim((s) => s.world)
  const setWorld = useSim((s) => s.setWorld)
  const tick = useSim((s) => s.tick)
  const loadWeather = useWeather((s) => s.load)

  useEffect(() => {
    if (!world) loadCorridor().then((d) => setWorld(buildWorld(d)))
  }, [world, setWorld])

  useEffect(() => {
    const id = setInterval(tick, 1000 / 6)
    const off = onClockChange(tick)
    // new reports should show up immediately, not on the next tick
    const unsub = useEvents.subscribe(() => tick())
    return () => {
      clearInterval(id)
      off()
      unsub()
    }
  }, [tick])

  useEffect(() => {
    void loadWeather()
    startRemoteSync()
  }, [loadWeather])

  return <>{children}</>
}

export function Loading({ label = 'Loading the Powai corridor from OpenStreetMap data' }: { label?: string }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-clay">
      <p className="text-[13px] text-ink-3">{label}</p>
    </main>
  )
}
