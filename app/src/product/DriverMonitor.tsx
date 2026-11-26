// The in-cabin monitor panel: the webcam with the face read back over it (eye outlines, irises,
// head direction and gaze), a windshield gauge showing where the eyes land, the attention state,
// a 30 s timeline, and the numbers behind it. All processing is on this device.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsClockwiseIcon, CaretDownIcon, EyeIcon, VideoCameraIcon } from '@phosphor-icons/react'
import { frame, recalibrate, startMonitor, stopMonitor, useFatigue } from '../sense/fatigue'
import { L_EYE, NOSE, R_EYE, ROAD, type Attention, type Gaze } from '../sense/gaze'

export const ATTN: Record<Attention, { word: string; color: string }> = {
  calibrating: { word: 'Calibrating', color: '#7fb6e6' },
  attentive: { word: 'Eyes on the road', color: '#7fb6e6' },
  glance: { word: 'Glance', color: '#a9c7e3' },
  'eyes-off-road': { word: 'Eyes off the road', color: '#d19a1c' },
  'looking-down': { word: 'Looking down', color: '#d19a1c' },
  drowsy: { word: 'Drowsy', color: '#d19a1c' },
  microsleep: { word: 'Microsleep', color: '#e0401f' },
}

// eye outlines, in order around each eye (MediaPipe face mesh)
const LEFT_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
const RIGHT_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const IRIS = { left: [473, 474, 475, 476, 477], right: [468, 469, 470, 471, 472] }
const HIST_COLOR = ['#3c6e98', '#6f8fae', '#d19a1c', '#e0401f']

export function DriverMonitor() {
  const video = useRef<HTMLVideoElement>(null)
  const f = useFatigue()
  const running = f.status === 'running'
  // open on wide screens; on a phone it starts as a single line so the road stays visible
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches)
  const a = ATTN[running && !f.face ? 'calibrating' : f.attention]
  const word = !running ? 'Off' : !f.face ? 'No face in view' : f.attention === 'eyes-off-road' || f.attention === 'looking-down' ? `${a.word} ${f.offFor.toFixed(1)} s` : a.word

  return (
    <div className="absolute left-4 top-16 z-40 w-[min(300px,calc(100vw-2rem))] bg-night-2/95 text-clay backdrop-blur-sm" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.18), 0 24px 48px -24px rgba(0,0,0,0.6)' }}>
      <div className={'flex items-center gap-2 px-3 py-2 text-[13px] ' + (open ? 'border-b border-night-rule' : '')}>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <EyeIcon size={15} />
          <span className="truncate">Driver monitor</span>
          {running && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.color }} />}
          {running && !open && (
            <span className="truncate text-[12px]" style={{ color: a.color }}>
              {word}
            </span>
          )}
          <span className="flex-1" />
          <CaretDownIcon size={13} className={'shrink-0 text-clay/60 transition-transform ' + (open ? 'rotate-180' : '')} />
        </button>
        {running && (
          <>
            <button onClick={recalibrate} title="Look at the road, then press: resets what counts as eyes on the road" className="text-clay/70 hover:text-clay">
              <ArrowsClockwiseIcon size={14} />
            </button>
            <button onClick={stopMonitor} className="text-[12px] text-clay/70 hover:text-clay">
              Stop
            </button>
          </>
        )}
      </div>

      <div className={open ? 'relative aspect-[4/3] overflow-hidden bg-black/50' : 'pointer-events-none absolute h-px w-px overflow-hidden opacity-0'}>
        <video ref={video} className={'h-full w-full -scale-x-100 object-cover ' + (running ? 'opacity-75' : 'opacity-0')} muted playsInline />
        {running && <FaceOverlay video={video} />}
        {running && f.attention === 'calibrating' && f.face && (
          <div className="absolute inset-x-3 bottom-3">
            <div className="mb-1 text-[11px] text-clay/90">Look at the road ahead</div>
            <div className="h-1 bg-clay/20">
              <div className="h-full bg-[#7fb6e6] transition-[width] duration-100" style={{ width: `${Math.round(f.calibration * 100)}%` }} />
            </div>
          </div>
        )}
        {!running && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div>
              <button
                onClick={() => video.current && startMonitor(video.current)}
                disabled={f.status === 'starting'}
                className="inline-flex items-center gap-2 bg-clay px-3 py-2 text-[13px] font-medium text-ink hover:bg-clay-deep disabled:opacity-60"
              >
                <VideoCameraIcon size={15} />
                {f.status === 'starting' ? 'Loading face model' : 'Start monitoring'}
              </button>
              <p className="mt-2 text-[11px] leading-snug text-clay/60">
                {f.error ?? 'Uses your webcam. Watches where your eyes are, not just your head. Video stays on this device.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {running && open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-night-rule">
            <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5">
              <div className="truncate text-[17px] font-semibold" style={{ color: a.color, fontVariationSettings: "'wdth' 110" }}>
                {word}
              </div>
              {f.attention === 'looking-down' && <div className="shrink-0 text-[11px] text-clay/60">phone?</div>}
            </div>
            <GazeGauge gaze={f.gaze} color={a.color} />
            <Timeline history={f.history} />
            <dl className="grid grid-cols-3 border-t border-night-rule text-center">
              <Metric label="eyes on road, 30 s" value={`${Math.round(f.onShare * 100)}%`} />
              <Metric label="eyes closed, 20 s" value={`${Math.round(f.perclos * 100)}%`} />
              <Metric label="yawns, 1 min" value={String(f.yawns)} />
            </dl>
            {f.gaze && (
              <div className="figures grid grid-cols-2 border-t border-night-rule px-3 py-1.5 text-[11px] text-clay/60">
                <span>head {deg(f.gaze.headYaw, 'L', 'R')} · {deg(f.gaze.headPitch, 'up', 'down')}</span>
                <span className="text-right">eyes {deg(f.gaze.eyeYaw, 'L', 'R')} · {deg(f.gaze.eyePitch, 'up', 'down')}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function deg(v: number, pos: string, neg: string) {
  const d = Math.round(Math.abs(v))
  return d < 3 ? '0°' : `${d}° ${v > 0 ? pos : neg}`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-night-rule px-2 py-2 last:border-r-0">
      <dd className="figures text-[15px]">{value}</dd>
      <dt className="text-[10px] leading-tight text-clay/55">{label}</dt>
    </div>
  )
}

/** Draws the face read-back over the mirrored preview, every frame, straight from the monitor. */
function FaceOverlay({ video }: { video: React.RefObject<HTMLVideoElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      const v = video.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx || !v) return
      const w = c.clientWidth
      const h = c.clientHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const lm = frame.landmarks
      if (!lm) return
      // object-cover: map normalised video coordinates into the element, mirrored
      const vw = v.videoWidth || 640
      const vh = v.videoHeight || 480
      const s = Math.max(w / vw, h / vh)
      const ox = (w - vw * s) / 2
      const oy = (h - vh * s) / 2
      const P = (i: number) => ({ x: w - (ox + lm[i].x * vw * s), y: oy + lm[i].y * vh * s })
      const g = frame.gaze
      const color = frame.closed ? '#e0401f' : frame.onRoad ? '#7fb6e6' : '#d19a1c'

      ctx.lineWidth = 1.4
      ctx.strokeStyle = color
      for (const ring of [LEFT_RING, RIGHT_RING]) {
        ctx.beginPath()
        ring.forEach((i, k) => (k ? ctx.lineTo(P(i).x, P(i).y) : ctx.moveTo(P(i).x, P(i).y)))
        ctx.closePath()
        ctx.stroke()
      }
      if (!frame.closed) {
        for (const ids of [IRIS.left, IRIS.right]) {
          const c0 = P(ids[0])
          const r = ids.slice(1).reduce((a, i) => a + Math.hypot(P(i).x - c0.x, P(i).y - c0.y), 0) / 4
          ctx.beginPath()
          ctx.arc(c0.x, c0.y, Math.max(2, r), 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(c0.x, c0.y, 1.6, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }
      if (!g) return
      // rays: on screen the preview is mirrored, so the driver's left is screen left
      const eyes = { x: (P(L_EYE.iris).x + P(R_EYE.iris).x) / 2, y: (P(L_EYE.iris).y + P(R_EYE.iris).y) / 2 }
      const nose = P(NOSE)
      const span = Math.hypot(P(L_EYE.outer).x - P(R_EYE.outer).x, P(L_EYE.outer).y - P(R_EYE.outer).y)
      const ray = (from: { x: number; y: number }, yaw: number, pitch: number, len: number, width: number, alpha: number) => {
        const dx = -Math.sin((yaw * Math.PI) / 180) * len
        const dy = -Math.sin((pitch * Math.PI) / 180) * len
        ctx.globalAlpha = alpha
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(from.x + dx, from.y + dy)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(from.x + dx, from.y + dy, width + 1.5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = '#e7e3d9'
      ray(nose, g.headYaw, g.headPitch, span * 2.4, 1, 0.55)
      ctx.strokeStyle = color
      ray(eyes, g.yaw, g.pitch, span * 3.2, 2, 0.95)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [video])
  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
}

/** A windshield seen from the seat: the road zone, the mirrors and the dash, and where the eyes are. */
function GazeGauge({ gaze, color }: { gaze: Gaze | null; color: string }) {
  const trail = useRef<{ x: number; y: number }[]>([])
  const W = 276
  const H = 92
  const YAW = 60
  const PITCH = 36
  const X = (yaw: number) => W / 2 - (Math.max(-YAW, Math.min(YAW, yaw)) / YAW) * (W / 2 - 6)
  const Y = (pitch: number) => H / 2 - (Math.max(-PITCH, Math.min(PITCH, pitch)) / PITCH) * (H / 2 - 6)
  if (gaze) {
    trail.current = [...trail.current.slice(-14), { x: X(gaze.yaw), y: Y(gaze.pitch) }]
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-3 my-2 block h-auto w-[calc(100%-1.5rem)]" role="img" aria-label="Where the eyes are, on a windshield diagram">
      {/* windshield outline */}
      <path d={`M 10 ${H - 4} L 28 6 L ${W - 28} 6 L ${W - 10} ${H - 4} Z`} fill="rgba(231,227,217,0.04)" stroke="rgba(231,227,217,0.18)" />
      {/* the road zone */}
      <rect x={X(ROAD.yaw)} y={Y(ROAD.up)} width={X(-ROAD.yaw) - X(ROAD.yaw)} height={Y(ROAD.down) - Y(ROAD.up)} fill="rgba(127,182,230,0.12)" stroke="rgba(127,182,230,0.55)" strokeDasharray="3 3" />
      <text x={W / 2} y={Y(ROAD.up) - 3} textAnchor="middle" fontSize="8" fill="rgba(231,227,217,0.5)">
        road
      </text>
      {/* mirrors and the dash */}
      <rect x={X(48) - 13} y={Y(-6) - 7} width={26} height={14} rx={3} fill="none" stroke="rgba(231,227,217,0.25)" />
      <rect x={X(-48) - 13} y={Y(-6) - 7} width={26} height={14} rx={3} fill="none" stroke="rgba(231,227,217,0.25)" />
      <rect x={X(4) - 14} y={Y(16) - 5} width={28} height={8} rx={2} fill="none" stroke="rgba(231,227,217,0.25)" />
      <rect x={X(8)} y={Y(-24)} width={X(-14) - X(8)} height={14} fill="none" stroke="rgba(231,227,217,0.18)" />
      <text x={X(-3)} y={Y(-24) + 10} textAnchor="middle" fontSize="7" fill="rgba(231,227,217,0.4)">
        dash · phone
      </text>
      {/* trail and the gaze point */}
      {trail.current.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={color} opacity={(i + 1) / trail.current.length / 2} />
      ))}
      {gaze && <circle cx={X(gaze.yaw)} cy={Y(gaze.pitch)} r={4} fill={color} stroke="#0b0f12" strokeWidth={1.5} />}
    </svg>
  )
}

function Timeline({ history }: { history: number[] }) {
  const cells = Array.from({ length: 120 }, (_, i) => history[history.length - 120 + i])
  return (
    <div className="px-3 pb-2.5">
      <div className="flex h-2 gap-px" aria-label="Last 30 seconds of attention">
        {cells.map((v, i) => (
          <span key={i} className="flex-1" style={{ background: v === undefined ? 'rgba(231,227,217,0.08)' : HIST_COLOR[v] }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-clay/45">
        <span>30 s ago</span>
        <span>now</span>
      </div>
    </div>
  )
}
