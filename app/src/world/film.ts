// Film mode: a fixed six-shot flythrough of the scenario loop, for recording the pitch video.
// Shots are cut to the story's own beats, so the camera is always where the network is acting.
// Captions live here (light, no three.js); the camera moves for each shot live in three/Canvases.tsx.
import { create } from "zustand";
import { play, seek } from "./clock";

export interface Shot {
  from: number; // scenario seconds
  to: number;
  title: string;
  /** caption lines, each shown from its scenario second until the next */
  subs: [number, string][];
}

export const SHOTS: Shot[] = [
  {
    from: 0,
    to: 4,
    title: "Powai, tonight",
    subs: [[0, "A live twin of the corridor from IIT Bombay to Hiranandani"]],
  },
  {
    from: 4,
    to: 10,
    title: "A fallen branch, reported an hour ago",
    subs: [
      [4, "Two dashcams and a resident reported it this evening"],
      [6, "Cars that pass with cameras on see an empty lane and vote it away"],
    ],
  },
  {
    from: 10,
    to: 19.5,
    title: "A barricade on no map",
    subs: [
      [10, "A resident reported it at second 6. Now cars start to swerve"],
      [15, "Five swerves in one spot are evidence too"],
      [18, "A dashcam names it. Two kinds of source: confirmed"],
    ],
  },
  {
    from: 19.5,
    to: 31,
    title: "Someone behind the bus",
    subs: [
      [19.5, "Your car, on the corridor"],
      [22.3, "The car ahead sees a pedestrian your driver cannot"],
      [24.5, "The warning reaches your car while the bus still hides them"],
      [27.5, "Now your own camera sees them. The warning was already there"],
    ],
  },
  {
    from: 31,
    to: 40,
    title: "One picture of the road",
    subs: [
      [31, "Every connected car nearby shares the same picture"],
      [36, "Built from dashcams, phones, city cameras and swerves"],
    ],
  },
  {
    from: 40,
    to: 48,
    title: "SuRaksha Mesh",
    subs: [[40, "Every car a sensor, every sensor shared"]],
  },
];

export function shotAt(t: number) {
  const i = Math.max(
    0,
    SHOTS.findIndex((s) => t >= s.from && t < s.to),
  );
  const shot = SHOTS[i];
  const sub =
    [...shot.subs].reverse().find(([at]) => t >= at)?.[1] ?? shot.subs[0][1];
  return {
    i,
    shot,
    sub,
    k: Math.min(1, Math.max(0, (t - shot.from) / (shot.to - shot.from))),
  };
}

export const useFilm = create<{
  on: boolean;
  start: () => void;
  stop: () => void;
}>((set) => ({
  on: false,
  start: () => {
    seek(0);
    play();
    set({ on: true });
  },
  stop: () => set({ on: false }),
}));
