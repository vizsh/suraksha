// Turns noisy per-frame detections into a few trustworthy reports.
// Objects (pedestrian, animal): must be seen in at least `minHits` frames within `windowMs`,
// inside the road region ahead. Road surface (pothole, barricade, waterlogging): the class must
// beat "clear road" by `margin` on `minChecks` consecutive checks. Every class then cools down.
import type { HazardKind } from '../engine/types'

export interface Box {
  x: number // 0..1, left
  y: number // 0..1, top
  w: number
  h: number
}

export type ObjectLabel = 'person' | 'cow' | 'dog' | 'horse' | 'sheep'
export const OBJECT_KIND: Record<ObjectLabel, HazardKind> = { person: 'pedestrian', cow: 'animal', dog: 'animal', horse: 'animal', sheep: 'animal' }
export type SurfaceLabel = 'pothole' | 'barricade' | 'cones' | 'waterlogging' | 'clear'
export const SURFACE_KIND: Record<Exclude<SurfaceLabel, 'clear'>, HazardKind> = { pothole: 'pothole', barricade: 'barricade', cones: 'barricade', waterlogging: 'waterlogging' }

/** Is the box on or near the road ahead: low in the frame and roughly central. */
export function inRoadRegion(b: Box) {
  const cx = b.x + b.w / 2
  const bottom = b.y + b.h
  return bottom > 0.55 && cx > 0.18 && cx < 0.82
}

export interface GateOptions {
  minHits: number
  windowMs: number
  minChecks: number
  margin: number
  minProb: number
  cooldownMs: number
}
// Road-surface thresholds are deliberately strict: zero-shot CLIP is a screen, not a final verdict,
// and a false pothole costs drivers' trust. The engine still needs a second source to confirm.
export const DEFAULT_GATE: GateOptions = { minHits: 3, windowMs: 2000, minChecks: 3, margin: 0.25, minProb: 0.55, cooldownMs: 10_000 }

export function createGate(opts: GateOptions = DEFAULT_GATE) {
  const hits = new Map<string, number[]>()
  const streak = new Map<string, number>()
  const lastEmit = new Map<string, number>()
  const cool = (key: string, t: number) => t - (lastEmit.get(key) ?? -Infinity) < opts.cooldownMs

  return {
    /** One frame's detection of an object. Returns true when it should be reported now. */
    object(label: ObjectLabel, box: Box, t: number): boolean {
      if (!inRoadRegion(box)) return false
      const arr = (hits.get(label) ?? []).filter((x) => t - x <= opts.windowMs)
      arr.push(t)
      hits.set(label, arr)
      if (arr.length < opts.minHits || cool(label, t)) return false
      lastEmit.set(label, t)
      hits.set(label, [])
      return true
    },
    /** One road-surface check: probabilities per class. Returns the class to report, if any. */
    surface(probs: Record<SurfaceLabel, number>, t: number): Exclude<SurfaceLabel, 'clear'> | null {
      const ranked = (Object.entries(probs) as [SurfaceLabel, number][]).sort((a, b) => b[1] - a[1])
      const [top, p] = ranked[0]
      for (const k of streak.keys()) if (k !== top) streak.set(k, 0)
      if (top === 'clear' || p < opts.minProb || p - probs.clear < opts.margin) {
        streak.set(top, 0)
        return null
      }
      const n = (streak.get(top) ?? 0) + 1
      streak.set(top, n)
      if (n < opts.minChecks || cool(top, t)) return null
      lastEmit.set(top, t)
      streak.set(top, 0)
      return top
    },
  }
}

/** Cosine similarity of an L2-normalised image embedding with each class, as CLIP softmax probabilities. */
export function classify(image: Float32Array | number[], classes: Record<string, number[]>, scale = 100) {
  let n = 0
  for (let i = 0; i < image.length; i++) n += image[i] * image[i]
  n = Math.sqrt(n) || 1
  const logits = Object.entries(classes).map(([k, v]) => {
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += (image[i] / n) * v[i]
    return [k, dot * scale] as const
  })
  const max = Math.max(...logits.map(([, l]) => l))
  const exps = logits.map(([k, l]) => [k, Math.exp(l - max)] as const)
  const sum = exps.reduce((a, [, e]) => a + e, 0)
  return Object.fromEntries(exps.map(([k, e]) => [k, e / sum])) as Record<SurfaceLabel, number>
}
