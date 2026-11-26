// "What one car sees vs what the network sees": the same moment rendered twice from the driver's
// seat. Left: only this car's own cameras. Right: the fused network, drawn through the bus.
// Drag the divider (or use the arrow keys on it) to compare.
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { DriverCanvas } from '../three/Canvases'
import type { World } from '../world/scenario'
import { useSim } from '../world/store'
import { clockState, onClockChange, pause, play, seek } from '../world/clock'
import { STATE, StateGlyph } from './bits'

export function SplitView({ world }: { world: World }) {
  const box = useRef<HTMLDivElement>(null)
  const [pct, setPct] = useState(50)
  const x = useMotionValue(50)
  const clip = useTransform(x, (v) => `inset(0 ${100 - v}% 0 0)`)
  const left = useTransform(x, (v) => `${v}%`)
  const feed = useSim((s) => s.feed)
  const threats = useSim((s) => s.threats)
  const mine = threats.filter((t) => t.sources.some((s) => s.who === 'Your car') && t.state !== 'resolved')
  const network = feed.filter((f) => f.threat.state !== 'predicted')

  const [paused, setPaused] = useState(clockState().paused)
  useEffect(() => onClockChange(() => setPaused(clockState().paused)), [])

  const set = useCallback(
    (v: number) => {
      const c = Math.max(4, Math.min(96, v))
      x.set(c)
      setPct(c)
    },
    [x],
  )
  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r) set(((clientX - r.left) / r.width) * 100)
  }

  return (
    <div>
      <div
        ref={box}
        className="relative aspect-[16/7] w-full touch-none select-none overflow-hidden bg-night"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          fromPointer(e.clientX)
        }}
        onPointerMove={(e) => e.buttons && fromPointer(e.clientX)}
        style={{ boxShadow: '0 50px 100px -40px rgba(10,14,16,0.6)' }}
      >
        <DriverCanvas world={world} className="absolute inset-0" />
        <motion.div className="absolute inset-0" style={{ clipPath: clip }}>
          <DriverCanvas world={world} own className="absolute inset-0" />
        </motion.div>

        {/* labels */}
        <div className="pointer-events-none absolute left-4 top-4 max-w-[40%] text-clay">
          <div className="text-[13px] font-semibold" style={{ fontVariationSettings: "'wdth' 112" }}>
            Your car alone
          </div>
          <div className="mt-0.5 text-[12px] text-clay/65">{mine.length === 0 ? 'Its cameras see nothing ahead yet' : `${mine.length} threat${mine.length === 1 ? '' : 's'} from its own cameras`}</div>
        </div>
        <div className="pointer-events-none absolute right-4 top-4 max-w-[40%] text-right text-clay">
          <div className="text-[13px] font-semibold" style={{ fontVariationSettings: "'wdth' 112" }}>
            With the network
          </div>
          <div className="mt-0.5 text-[12px] text-clay/65">{network.length} threat{network.length === 1 ? '' : 's'} on your route</div>
          <ul className="mt-2 space-y-1">
            {network.slice(0, 3).map((f) => (
              <li key={f.id} className="flex items-center justify-end gap-1.5 text-[12px]">
                {f.threat.label}
                <span className="figures text-clay/60">{Math.max(0, Math.round(f.ahead))} m</span>
                <StateGlyph state={f.threat.state} size={11} night />
              </li>
            ))}
          </ul>
        </div>

        {/* divider */}
        <motion.div className="absolute inset-y-0 w-px bg-clay/80" style={{ left }}>
          <button
            aria-label="Drag to compare your car alone with the network"
            aria-valuenow={Math.round(pct)}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') set(pct - 4)
              if (e.key === 'ArrowRight') set(pct + 4)
            }}
            className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-clay text-ink"
            style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}
          >
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
              <path d="M6 1 1 6l5 5M12 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </motion.div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
        <span>Jump to:</span>
        {[
          [18.5, 'Barricade confirmed'],
          [23.4, 'Pedestrian behind the bus'],
          [28.5, 'Your camera finally sees them'],
        ].map(([t, label]) => (
          <button
            key={label}
            onClick={() => {
              seek(t as number)
              pause()
            }}
            className="border border-ink/25 px-2.5 py-1 hover:bg-clay-deep"
          >
            {label}
          </button>
        ))}
        <button onClick={() => (paused ? play() : pause())} className="bg-ink px-2.5 py-1 text-clay hover:bg-ink-2">
          {paused ? 'Play' : 'Pause'}
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
          <StateGlyph state="confirmed" size={11} />
          {STATE.confirmed.word} by the network, drawn through what hides it
        </span>
      </div>
    </div>
  )
}
