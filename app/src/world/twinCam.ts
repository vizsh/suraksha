// Camera intent for the city twin. Kept outside the 3D module so light UI (command palette)
// can use it without pulling three.js into the first download.
import { create } from 'zustand'

export type TwinView = 'city' | 'corridor' | 'chase' | 'top'

export const useTwinCam = create<{ view: TwinView; focus: [number, number] | null; setView: (v: TwinView) => void; flyTo: (p: [number, number]) => void }>((set) => ({
  view: 'city',
  focus: null,
  setView: (view) => set({ view, focus: null }),
  flyTo: (focus) => set({ focus }),
}))
