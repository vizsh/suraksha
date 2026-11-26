import { useEffect, type ReactNode } from 'react'
import { loadCorridor } from '../world/corridor'
import { buildWorld } from '../world/scenario'
import { useSim } from '../world/store'
import { currentScenario, onClockChange } from '../world/clock'
import { scenarioById } from '../world/scenarios'
import { useAtmos } from '../world/atmos'
import type { CorridorData } from '../world/corridor'

let corridor: CorridorData | null = null

/** Build the world for the scenario on the shared clock, and set the scenario's time and weather. */
function applyScenario(data: CorridorData, setWorld: (w: ReturnType<typeof buildWorld>) => void, atmos = true) {
  const id = currentScenario()
  const sc = scenarioById(id)
  setWorld(buildWorld(data, sc.id))
  if (atmos) {
    const a = useAtmos.getState()
    a.setTime(sc.time)
    a.setRain(sc.rain)
  }
}
import { useWeather } from '../sense/weather'
import { startRemoteSync, useEvents } from '../sync/events'
import { useMonsoon } from '../sense/monsoon'

/** Loads the corridor once, runs the shared ticker, live weather and cross-device sync. */
export function WorldRoot({ children }: { children: ReactNode }) {
  const world = useSim((s) => s.world)
  const setWorld = useSim((s) => s.setWorld)
  const tick = useSim((s) => s.tick)
  const loadWeather = useWeather((s) => s.load)

  useEffect(() => {
    if (!world)
      loadCorridor().then((d) => {
        corridor = d
        applyScenario(d, setWorld, currentScenario() !== undefined)
      })
  }, [world, setWorld])

  // another scenario chosen here or on another device: rebuild the world for it
  useEffect(
    () =>
      onClockChange(() => {
        const w = useSim.getState().world
        if (corridor && w && w.scenario.id !== scenarioById(currentScenario()).id) applyScenario(corridor, setWorld)
      }),
    [setWorld],
  )

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

  useEffect(() => {
    if (world) void useMonsoon.getState().load(world)
  }, [world])

  return <>{children}</>
}

export function Loading({ label = 'Loading the Powai corridor from OpenStreetMap data' }: { label?: string }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-clay">
      <p className="text-[13px] text-ink-3">{label}</p>
    </main>
  )
}
