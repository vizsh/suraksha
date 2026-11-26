// Film mode: a six-shot flythrough of the scenario loop, for recording the pitch video.
// Each scenario defines its own shots, cut to its own beats (scenarios.ts), so the camera is
// always where the network is acting. The camera moves live in three/Canvases.tsx.
import { create } from 'zustand'
import { play, seek } from './clock'
import type { ShotDef } from './scenarios'

export type Shot = ShotDef

export function shotAt(t: number, shots: Shot[]) {
  const i = Math.max(0, shots.findIndex((s) => t >= s.from && t < s.to))
  const shot = shots[i]
  const sub = [...shot.subs].reverse().find(([at]) => t >= at)?.[1] ?? shot.subs[0][1]
  return { i, shot, sub, k: Math.min(1, Math.max(0, (t - shot.from) / (shot.to - shot.from))) }
}

export const useFilm = create<{ on: boolean; start: () => void; stop: () => void }>((set) => ({
  on: false,
  start: () => {
    seek(0)
    play()
    set({ on: true })
  },
  stop: () => set({ on: false }),
}))
