// Dashcam AI: the phone on the dashboard (or any video or photo) becomes a connected-car sensor.
// Detection runs on this device; only the resulting observation is shared, then fused by the engine.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CameraIcon, CpuIcon, FilmStripIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { SurfaceNav } from '../app/SurfaceNav'
import { useSim, threatForObservation, hazardLabel } from '../world/store'
import { useEvents } from '../sync/events'
import { engineNow } from '../world/clock'
import { snapToRoad } from '../world/corridor'
import { placeReport, watchLocation } from '../sense/location'
import { classifySurface, detectObjects, loadObjects, loadSurface, useDetector } from '../sense/detector'
import { createGate, OBJECT_KIND, SURFACE_KIND, type ObjectLabel, type SurfaceLabel } from '../sense/gate'
import { STATE, StateGlyph } from '../product/bits'
import type { HazardKind } from '../engine/types'

const COLOR: Record<string, string> = { person: '#e0401f', cow: '#d19a1c', dog: '#d19a1c', horse: '#d19a1c', sheep: '#d19a1c' }
const SURF: { key: SurfaceLabel; label: string }[] = [
  { key: 'pothole', label: 'Pothole' },
  { key: 'barricade', label: 'Barricade' },
  { key: 'cones', label: 'Cones' },
  { key: 'waterlogging', label: 'Waterlogging' },
  { key: 'clear', label: 'Clear road' },
]

export default function Dashcam() {
  const world = useSim((s) => s.world)!
  const threats = useSim((s) => s.threats)
  const add = useEvents((s) => s.addObservation)
  const deviceId = useEvents((s) => s.deviceId)
  const obs = useEvents((s) => s.observations)
  const det = useDetector()
  const video = useRef<HTMLVideoElement>(null)
  const image = useRef<HTMLImageElement | null>(null)
  const work = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const [source, setSource] = useState<'none' | 'camera' | 'file'>('none')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const gate = useMemo(() => createGate(), [])
  const stream = useRef<MediaStream | null>(null)

  useEffect(() => {
    void loadObjects()
    watchLocation()
    return () => stream.current?.getTracks().forEach((t) => t.stop())
  }, [])

  const report = (kind: HazardKind, score: number, how: string) => {
    const place = placeReport(world)
    const snap = snapToRoad(world.data, world.path, place.pos)
    add({
      id: `dash-${deviceId}-${Date.now()}`,
      t: engineNow(),
      kind,
      source: 'vision',
      sourceId: deviceId,
      pos: snap.pos,
      conf: Math.min(0.95, score),
      who: `Phone dashcam ${deviceId.slice(-4).toUpperCase()}`,
      how: `${how}, ${score.toFixed(2)}${snap.road ? `, ${snap.road}${snap.lane ? ` lane ${snap.lane}` : ''}` : ''}`,
    })
    setFlash(hazardLabel(kind))
    setTimeout(() => setFlash(null), 1800)
  }

  // the detection loop
  useEffect(() => {
    if (source === 'none') return
    let raf = 0
    let lastObj = 0
    let lastSurf = 0
    let busy = false
    let frames = 0
    let fpsT = performance.now()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const c = work.current
      if (!c) return
      const src = source === 'file' && image.current ? image.current : video.current
      if (!src) return
      const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth
      const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight
      if (!sw || !sh) return
      const now = performance.now()
      if (now - lastObj < 66) return // ~15 checks a second is plenty
      lastObj = now
      c.width = 640
      c.height = Math.round((640 * sh) / sw)
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
      const dets = detectObjects(c, now)
      useDetector.setState({ dets })
      for (const d of dets) {
        if (d.label in OBJECT_KIND && gate.object(d.label as ObjectLabel, d.box, now)) {
          report(OBJECT_KIND[d.label as ObjectLabel], d.score, `On-device detector: ${d.label}`)
        }
      }
      frames++
      if (now - fpsT > 1000) {
        useDetector.setState({ fps: Math.round((frames * 1000) / (now - fpsT)) })
        frames = 0
        fpsT = now
      }
      if (useDetector.getState().surface === 'ready' && !busy && now - lastSurf > 1500) {
        lastSurf = now
        busy = true
        void classifySurface(c)
          .then((probs) => {
            if (!probs) return
            const hit = gate.surface(probs, performance.now())
            if (hit) report(SURFACE_KIND[hit], probs[hit], `Road-surface model: ${hit}`)
          })
          .finally(() => (busy = false))
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // draw the overlay
  useEffect(() => {
    const o = overlay.current
    if (!o) return
    const r = o.getBoundingClientRect()
    o.width = r.width * devicePixelRatio
    o.height = r.height * devicePixelRatio
    const ctx = o.getContext('2d')!
    ctx.scale(devicePixelRatio, devicePixelRatio)
    const W = r.width
    const H = r.height
    // the road-ahead zone a detection must fall in
    ctx.setLineDash([8, 7])
    ctx.strokeStyle = 'rgba(127,182,230,0.9)'
    ctx.fillStyle = 'rgba(31,111,178,0.08)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W * 0.18, H)
    ctx.lineTo(W * 0.4, H * 0.55)
    ctx.lineTo(W * 0.6, H * 0.55)
    ctx.lineTo(W * 0.82, H)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '600 12px "Mona Sans Variable", sans-serif'
    for (const d of det.dets) {
      const col = COLOR[d.label] ?? '#7fb6e6'
      const x = d.box.x * W
      const y = d.box.y * H
      const w = d.box.w * W
      const h = d.box.h * H
      const k = Math.min(16, w / 3, h / 3)
      ctx.strokeStyle = col
      ctx.lineWidth = COLOR[d.label] ? 2.5 : 1.5
      ctx.beginPath()
      for (const [px, py, dx, dy] of [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ]) {
        ctx.moveTo(px + dx * k, py)
        ctx.lineTo(px, py)
        ctx.lineTo(px, py + dy * k)
      }
      ctx.stroke()
      const text = `${d.label} ${Math.round(d.score * 100)}`
      const tw = ctx.measureText(text).width + 10
      ctx.fillStyle = col
      ctx.fillRect(x, y - 18, tw, 18)
      ctx.fillStyle = '#11161a'
      ctx.fillText(text, x + 5, y - 5)
    }
  }, [det.dets])

  const useCamera = async () => {
    setError(null)
    try {
      stream.current?.getTracks().forEach((t) => t.stop())
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      stream.current = s
      image.current = null
      video.current!.srcObject = s
      await video.current!.play()
      setSource('camera')
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was declined.' : 'No camera available here. Open a video or photo instead.')
    }
  }
  const useFile = (f: File) => {
    setError(null)
    stream.current?.getTracks().forEach((t) => t.stop())
    const url = URL.createObjectURL(f)
    if (f.type.startsWith('image/')) {
      const img = new Image()
      img.onload = () => {
        image.current = img
        setSource('file')
      }
      img.src = url
      if (video.current) video.current.srcObject = null
      video.current?.removeAttribute('src')
    } else {
      image.current = null
      video.current!.srcObject = null
      video.current!.src = url
      video.current!.loop = true
      void video.current!.play()
      setSource('file')
    }
  }

  const mine = obs.filter((o) => o.sourceId === deviceId && o.id.startsWith('dash-')).slice(-5).reverse()

  return (
    <main className="min-h-[100dvh] bg-night text-clay">
      <SurfaceNav tone="night" />
      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 pb-10 pt-20 lg:grid-cols-[1fr_340px] lg:px-8">
        <section>
          <div className="relative aspect-video w-full overflow-hidden bg-black" style={{ boxShadow: '0 0 0 1px rgba(231,227,217,0.15)' }}>
            <video ref={video} muted playsInline className={'absolute inset-0 h-full w-full object-fill ' + (source === 'file' && image.current ? 'hidden' : '')} />
            {source === 'file' && image.current && <img src={image.current.src} alt="Your photo" className="absolute inset-0 h-full w-full object-fill" />}
            <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
            <canvas ref={work} className="hidden" />
            {source === 'none' && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div className="max-w-[440px]">
                  <div className="text-[24px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 115" }}>
                    Turn this phone into a connected-car sensor
                  </div>
                  <p className="mt-2 text-[14px] text-clay/70">Mount it on the dashboard and point it at the road, or open a dashcam video or photo. Detection runs here; only the result is shared.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button onClick={useCamera} className="flex items-center gap-2 bg-clay px-4 py-2.5 text-[14px] font-medium text-ink hover:bg-white">
                      <CameraIcon size={16} />
                      Use the camera
                    </button>
                    <label className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[14px] hover:bg-white/10" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.3)' }}>
                      <FilmStripIcon size={16} />
                      Open a video or photo
                      <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && useFile(e.target.files[0])} />
                    </label>
                  </div>
                  {error && <p className="mt-3 text-[13px] text-potential">{error}</p>}
                </div>
              </div>
            )}
            <AnimatePresence>
              {flash && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#0d1113]/90 px-4 py-2 text-[14px]"
                  style={{ boxShadow: 'inset 0 0 0 1.5px #1f6fb2' }}
                >
                  Reported to the network: {flash}
                </motion.div>
              )}
            </AnimatePresence>
            {source !== 'none' && (
              <div className="figures absolute bottom-3 left-3 bg-black/55 px-2 py-1 text-[11px] text-clay/80">
                {det.fps} fps, {det.dets.length} objects
              </div>
            )}
          </div>
          {source !== 'none' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <button onClick={useCamera} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.25)' }}>
                <CameraIcon size={14} />
                Camera
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-white/10" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.25)' }}>
                <FilmStripIcon size={14} />
                Another file
                <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && useFile(e.target.files[0])} />
              </label>
              <span className="text-clay/50">The dashed zone is the road ahead; only objects inside it are reported.</span>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <div className="p-4" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.15)' }}>
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <CpuIcon size={16} />
              On-device models
            </div>
            <Model name="Objects" detail="EfficientDet-Lite0, 7 MB" status={det.objects} />
            <Model
              name="Road surface"
              detail={`CLIP ViT-B/32, 89 MB once${det.backend ? `, ${det.backend}` : ''}`}
              status={det.surface}
              progress={det.surfaceProgress}
              action={det.surface === 'off' || det.surface === 'error' ? () => void loadSurface() : undefined}
            />
          </div>

          <div className="p-4" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.15)' }}>
            <div className="text-[14px] font-semibold">Road ahead, right now</div>
            <ul className="mt-3 space-y-2">
              {SURF.map((s) => {
                const p = det.probs?.[s.key] ?? 0
                return (
                  <li key={s.key} className="grid grid-cols-[96px_1fr_40px] items-center gap-2 text-[12px]">
                    <span className={s.key === 'clear' ? 'text-clay/60' : ''}>{s.label}</span>
                    <span className="h-[5px] bg-white/10">
                      <motion.span className="block h-full" style={{ background: s.key === 'clear' ? '#7d8380' : s.key === 'waterlogging' ? '#1f6fb2' : '#e0401f' }} animate={{ width: `${p * 100}%` }} />
                    </span>
                    <span className="figures text-right text-clay/70">{Math.round(p * 100)}</span>
                  </li>
                )
              })}
            </ul>
            {det.surface !== 'ready' && <p className="mt-2 text-[11px] text-clay/50">Load the road-surface model to check for potholes, barricades and water.</p>}
          </div>

          <div className="p-4" style={{ boxShadow: 'inset 0 0 0 1px rgba(231,227,217,0.15)' }}>
            <div className="text-[14px] font-semibold">Sent to the network</div>
            <ul className="mt-2 divide-y divide-white/10">
              {mine.length === 0 && <li className="py-2 text-[12px] text-clay/50">Nothing yet. Reports need a few consistent frames, then cool down for 10 s.</li>}
              {mine.map((o) => {
                const th = threatForObservation(threats, o.id)
                return (
                  <li key={o.id} className="flex items-center gap-2 py-2 text-[12px]">
                    {th && <StateGlyph state={th.state} size={12} night />}
                    <span className="flex-1">
                      {hazardLabel(o.kind)}
                      <span className="block text-[11px] text-clay/50">{o.how}</span>
                    </span>
                    <span style={{ color: th ? STATE[th.state].color : undefined }}>{th ? STATE[th.state].word : 'Faded'}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-clay/50">
            <ShieldCheckIcon size={14} className="mt-0.5 shrink-0" />
            Frames never leave this device. Only the hazard type, confidence and road position are shared.
          </p>
        </aside>
      </div>
    </main>
  )
}

function Model({ name, detail, status, progress, action }: { name: string; detail: string; status: string; progress?: number; action?: () => void }) {
  const word = status === 'ready' ? 'Ready' : status === 'loading' ? (progress ? `${Math.round(progress * 100)}%` : 'Loading') : status === 'error' ? 'Failed' : 'Off'
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className={'h-2 w-2 rounded-full ' + (status === 'ready' ? 'bg-[#7fb6e6]' : status === 'loading' ? 'animate-pulse bg-potential' : status === 'error' ? 'bg-confirmed' : 'bg-white/25')} />
      <span className="flex-1">
        <span className="block text-[13px]">{name}</span>
        <span className="block text-[11px] text-clay/50">{detail}</span>
      </span>
      {action ? (
        <button onClick={action} className="bg-clay px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-white">
          {status === 'error' ? 'Retry' : 'Load'}
        </button>
      ) : (
        <span className="text-[12px] text-clay/70">{word}</span>
      )}
    </div>
  )
}
