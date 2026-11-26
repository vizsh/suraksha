import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowCounterClockwiseIcon, ArrowRightIcon, CameraIcon, MapPinIcon, PulseIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { Link } from 'wouter'
import { useSim, threatForObservation } from '../world/store'
import { useEvents } from '../sync/events'
import { engineNow } from '../world/clock'
import { DriveScreen, StepList, TabBar, useReportSteps } from '../product/Phone'
import { MapOverlay, MiniMap, STATE, StateGlyph, egoCenter, stateLine } from '../product/bits'
import { SurfaceNav } from '../app/SurfaceNav'
import { onBump, simulateBump, startMotion, useMotion } from '../sense/motion'
import { placeReport, watchLocation, type Placed } from '../sense/location'
import type { HazardKind, V2 } from '../engine/types'
import { hazardLabel } from '../world/store'
import { snapToRoad } from '../world/corridor'
import { RouteCheck } from '../product/RouteCheck'

/** The phone app: drive mode with the phone as a road sensor, and citizen reporting. */
export default function PhoneApp() {
  const [tab, setTab] = useState(0)
  useBumpReporter()
  return (
    <main className="min-h-[100dvh] bg-clay-deep md:grid md:place-items-center md:py-10">
      <div className="hidden md:block">
        <SurfaceNav />
      </div>
      <div
        className="relative mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden bg-clay md:h-[min(844px,calc(100dvh-5rem))] md:max-w-[390px] md:rounded-[40px]"
        style={{ boxShadow: '0 40px 80px -30px rgba(40,34,26,0.45), 0 0 0 10px #1c2226' }}
      >
        <OfflineBanner />
        <div className="h-full overflow-y-auto pb-24 pt-[env(safe-area-inset-top)]">
          {tab === 0 && <DriveTab />}
          {tab === 1 && <MapTab />}
          {tab === 2 && <ReportTab />}
          {tab === 3 && <YouTab />}
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>
    </main>
  )
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb)
      window.addEventListener('offline', cb)
      return () => {
        window.removeEventListener('online', cb)
        window.removeEventListener('offline', cb)
      }
    },
    () => navigator.onLine,
  )
}

/** Reports made without a connection are kept and sent later; say so plainly. */
function OfflineBanner() {
  const online = useOnline()
  const pending = useEvents((s) => s.pending)
  if (online && pending === 0) return null
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-ink px-4 py-2 pt-[calc(env(safe-area-inset-top)+8px)] text-[12px] text-clay">
      <span className={'h-2 w-2 rounded-full ' + (online ? 'bg-[#7fb6e6]' : 'bg-potential')} />
      {online
        ? `Sending ${pending} queued report${pending === 1 ? '' : 's'}`
        : pending > 0
          ? `Offline. ${pending} report${pending === 1 ? '' : 's'} saved; they send when you reconnect.`
          : 'Offline. You can still report; it sends when you reconnect.'}
    </div>
  )
}

/** Every bump the phone detects becomes an IMU observation, placed on the road. */
function useBumpReporter() {
  const add = useEvents((s) => s.addObservation)
  const deviceId = useEvents((s) => s.deviceId)
  const world = useSim((s) => s.world)!
  useEffect(
    () =>
      onBump((b) => {
        const place = placeReport(world)
        const snap = snapToRoad(world.data, world.path, place.pos)
        add({
          id: `imu-${deviceId}-${b.at}`,
          t: engineNow(),
          kind: 'pothole',
          source: 'imu',
          sourceId: deviceId,
          pos: snap.pos,
          conf: Math.max(0.5, Math.min(0.92, (b.peak - 4) / 7)),
          who: `Phone ${deviceId.slice(-4).toUpperCase()}`,
          how: `Accelerometer spike ${b.peak.toFixed(1)} m/s², matched to ${snap.road ?? 'the road'}${snap.lane ? ` lane ${snap.lane}` : ''}`,
        })
      }),
    [add, deviceId, world],
  )
}

function DriveTab() {
  const world = useSim((s) => s.world)!
  return (
    <DriveScreen world={world}>
      <SensingCard />
    </DriveScreen>
  )
}

function Trace({ values, threshold }: { values: number[]; threshold: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const w = c.width
    const h = c.height
    const max = 14
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(224,64,31,0.55)'
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(0, h - (threshold / max) * h)
    ctx.lineTo(w, h - (threshold / max) * h)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = '#1f6fb2'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = (i / 180) * w
      const y = h - (Math.min(v, max) / max) * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [values, threshold])
  return <canvas ref={ref} width={680} height={120} className="h-[60px] w-full" aria-label="Live accelerometer trace" />
}

function SensingCard() {
  const m = useMotion()
  const obs = useEvents((s) => s.observations)
  const deviceId = useEvents((s) => s.deviceId)
  const threats = useSim((s) => s.threats)
  const mine = obs.filter((o) => o.source === 'imu' && o.sourceId === deviceId).slice(-3).reverse()
  return (
    <section className="mt-5 border-t border-rule pt-4">
      <div className="flex items-center gap-2 text-[15px] font-semibold" style={{ fontVariationSettings: "'wdth' 108" }}>
        <PulseIcon size={17} />
        This phone as a road sensor
      </div>
      <Link href="/dashcam" className="mt-2 flex items-center justify-between bg-ink px-3 py-2.5 text-[13px] font-medium text-clay no-underline hover:bg-ink-2">
        Dashcam AI: detect hazards with the camera
        <ArrowRightIcon size={14} />
      </Link>
      {m.status !== 'running' ? (
        <>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
            Potholes and unmarked speed breakers jolt the phone. Each jolt is sent as one vote; the network needs a second car before it calls it confirmed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => {
                watchLocation()
                void startMotion()
              }}
              className="bg-ink px-3 py-2 text-[13px] font-medium text-clay hover:bg-ink-2"
            >
              Start sensing
            </button>
            <button onClick={() => simulateBump()} className="border border-ink/30 px-3 py-2 text-[13px] hover:bg-clay-deep">
              Simulate a bump
            </button>
          </div>
          {(m.status === 'denied' || m.status === 'unsupported') && (
            <p className="mt-2 text-[12px] text-confirmed-text">
              {m.status === 'denied' ? 'Motion access was declined.' : 'No accelerometer here.'} Use "Simulate a bump", or open this page on a phone over HTTPS.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-ink-2">Shake the phone, or drive over a bump. Anything above the dashed line is reported.</p>
          <div className="mt-2 bg-clay-deep/70 px-2 py-1">
            <Trace values={m.trace} threshold={m.threshold} />
          </div>
          <button onClick={() => simulateBump()} className="mt-2 border border-ink/30 px-3 py-1.5 text-[12px] hover:bg-clay-deep">
            Simulate a bump
          </button>
        </>
      )}
      {mine.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {mine.map((o) => {
            const th = threatForObservation(threats, o.id)
            return (
              <li key={o.id} className="flex items-center gap-2 text-[12px]">
                {th && <StateGlyph state={th.state} size={12} />}
                <span className="flex-1">{o.how}</span>
                <span style={{ color: th ? STATE[th.state].text : undefined }}>{th ? STATE[th.state].word : 'Faded'}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const STATIC = new Set<string>(['pothole', 'barricade', 'debris', 'waterlogging', 'manhole', 'speed-breaker', 'stalled-vehicle', 'footpath', 'unknown'])
const RANK_PHONE = (th: { state: string }) => (th.state === 'resolved' ? 2 : th.state === 'predicted' ? 1 : 0)

function MapTab() {
  const world = useSim((s) => s.world)!
  const t = useSim((s) => s.t)
  const threats = useSim((s) => s.threats)
  const center = useMemo(() => egoCenter(world, Math.floor(t / 6) * 6), [world, t])
  const list = threats.filter((th) => th.state !== 'resolved' || th.clearedBy > 0).sort((a, b) => RANK_PHONE(a) - RANK_PHONE(b) || b.confidence - a.confidence)
  const add = useEvents((s) => s.addObservation)
  const deviceId = useEvents((s) => s.deviceId)
  const [gone, setGone] = useState<Set<string>>(() => new Set())
  // "Passed it, nothing there": a resident's vote that a static hazard has gone. Never counts
  // against their own report, and one vote per device, like every other source.
  const notThere = (th: (typeof threats)[number]) => {
    add({
      id: `clear-${deviceId}-${Date.now()}`,
      t: engineNow(),
      kind: th.kind === 'risk-zone' ? 'unknown' : th.kind,
      source: 'citizen',
      sourceId: deviceId,
      polarity: -1,
      reputation: 0.8,
      pos: th.pos,
      conf: 0.85,
      who: `Resident ${deviceId.slice(-4).toUpperCase()}`,
      how: 'Passed the spot, nothing there',
    })
    setGone((g) => new Set(g).add(th.id))
  }
  return (
    <div>
      <div className="relative aspect-square overflow-hidden">
        <MiniMap world={world} center={center} radius={420} className="absolute inset-0 h-full w-full" />
        <MapOverlay world={world} center={center} radius={420} />
      </div>
      <div className="px-5 pt-4">
        <div className="text-[22px] font-semibold" style={{ fontVariationSettings: "'wdth' 110" }}>
          Around you
        </div>
        <ul className="mt-2 divide-y divide-rule/70">
          {list.map((th) => (
            <li key={th.id} className="flex items-center gap-3 py-2.5">
              <StateGlyph state={th.state} size={16} />
              <span className="flex-1 text-[14px] leading-tight">
                {th.state === 'potential' || th.state === 'noticed' ? `Possible ${th.label.toLowerCase()}` : th.label}
                <span className="block text-[11px]" style={{ color: STATE[th.state].text }}>
                  {stateLine(th)}
                </span>
              </span>
              {STATIC.has(th.kind) && th.state !== 'resolved' && th.state !== 'predicted' ? (
                gone.has(th.id) ? (
                  <span className="text-[11px] text-live">Noted</span>
                ) : (
                  <button onClick={() => notThere(th)} className="border border-ink/25 px-2 py-1 text-[11px] hover:bg-clay-deep">
                    Not there now
                  </button>
                )
              ) : (
                <span className="figures text-[11px] text-ink-3">{Math.round(th.confidence * 100)}%</span>
              )}
            </li>
          ))}
        </ul>
        <RouteCheck world={world} />
      </div>
    </div>
  )
}

const KINDS: { kind: HazardKind; label: string }[] = [
  { kind: 'pothole', label: 'Pothole' },
  { kind: 'barricade', label: 'Barricade' },
  { kind: 'footpath', label: 'Broken footpath' },
  { kind: 'manhole', label: 'Open manhole' },
  { kind: 'waterlogging', label: 'Waterlogging' },
  { kind: 'debris', label: 'Debris' },
  { kind: 'speed-breaker', label: 'Unmarked speed breaker' },
  { kind: 'unknown', label: 'Something else' },
]

async function thumbnail(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, 240 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function ReportTab() {
  const world = useSim((s) => s.world)!
  const add = useEvents((s) => s.addObservation)
  const deviceId = useEvents((s) => s.deviceId)
  const obs = useEvents((s) => s.observations)
  const threats = useSim((s) => s.threats)
  const [kind, setKind] = useState<HazardKind | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [place, setPlace] = useState<Placed | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    watchLocation()
    setPlace(placeReport(world))
  }, [world])

  const confirmedMine = obs.filter((o) => o.source === 'citizen' && o.sourceId === deviceId && threatForObservation(threats, o.id)?.state === 'confirmed').length
  const reputation = Math.min(0.95, 0.6 + 0.1 * confirmedMine)

  if (sent) return <SentStatus obsId={sent} kind={kind!} onAgain={() => (setSent(null), setKind(null), setThumb(null), setPlace(placeReport(world)))} />

  const R = 120
  const moveTo = (e: React.MouseEvent) => {
    if (!place || !mapRef.current) return
    const r = mapRef.current.getBoundingClientRect()
    const dx = ((e.clientX - r.left) / r.width) * 2 * R - R
    const dz = ((e.clientY - r.top) / r.height) * 2 * R - R
    const p: V2 = [place.pos[0] + dx, place.pos[1] + dz]
    setPlace({ pos: p, virtual: place.virtual })
  }

  const snap = place ? snapToRoad(world.data, world.path, place.pos) : null
  const send = () => {
    if (!kind || !place) return
    const id = `cit-${deviceId}-${Date.now()}`
    add(
      {
        id,
        t: engineNow(),
        kind,
        source: 'citizen',
        sourceId: deviceId,
        reputation,
        pos: kind === 'footpath' ? place.pos : (snap?.pos ?? place.pos),
        conf: thumb ? 0.9 : 0.7,
        who: `Resident ${deviceId.slice(-4).toUpperCase()}`,
        how: thumb ? 'Photo and location' : 'Location only, no photo',
      },
      thumb ?? undefined,
    )
    setSent(id)
  }

  return (
    <div className="px-5 pt-6">
      <div className="text-[24px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 112" }}>
        Report a hazard
      </div>
      <p className="mt-1 text-[13px] text-ink-2">Your report warns drivers at once, as "possible", until another source agrees.</p>

      <h3 className="mt-5 text-[13px] font-semibold">What is it?</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKind(k.kind)}
            aria-pressed={kind === k.kind}
            className={'px-3 py-1.5 text-[13px] ' + (kind === k.kind ? 'bg-ink text-clay' : 'bg-clay-deep text-ink hover:bg-clay-shade/60')}
          >
            {k.label}
          </button>
        ))}
      </div>

      <h3 className="mt-5 text-[13px] font-semibold">Photo</h3>
      <label className="mt-2 flex cursor-pointer items-center gap-3">
        {thumb ? (
          <img src={thumb} alt="Your photo" className="h-20 w-20 object-cover" />
        ) : (
          <span className="grid h-20 w-20 place-items-center bg-clay-deep text-ink-3">
            <CameraIcon size={24} />
          </span>
        )}
        <span className="text-[13px] text-ink-2">{thumb ? 'Retake' : 'Take a photo'} (stays small; faces and plates are not needed)</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setThumb(await thumbnail(f))
          }}
        />
      </label>

      <h3 className="mt-5 text-[13px] font-semibold">Where</h3>
      {place && (
        <>
          <div ref={mapRef} onClick={moveTo} className="relative mt-2 aspect-square w-full cursor-crosshair overflow-hidden">
            <MiniMap world={world} center={place.pos} radius={R} route={false} className="absolute inset-0 h-full w-full" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-confirmed">
              <MapPinIcon size={30} weight="fill" />
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">
            {place.virtual ? 'You are outside the demo corridor, so the pin starts on JVLR ahead of the demo car. Tap the map to move it.' : 'Your location. Tap the map to adjust.'}
            {snap?.road && kind !== 'footpath' && (
              <span className="mt-0.5 block text-live">
                Matched to {snap.road}
                {snap.lane ? `, lane ${snap.lane}` : ''}
                {snap.moved > 1 ? ` (moved ${snap.moved.toFixed(0)} m)` : ''}
              </span>
            )}
          </p>
        </>
      )}

      <button
        onClick={send}
        disabled={!kind || !place}
        className="mt-5 w-full bg-confirmed-text py-3 text-[15px] font-medium text-[#f6efe9] hover:bg-confirmed disabled:opacity-40"
      >
        Send report
      </button>
    </div>
  )
}

function SentStatus({ obsId, kind, onAgain }: { obsId: string; kind: HazardKind; onAgain: () => void }) {
  const word = hazardLabel(kind).toLowerCase()
  const { steps, stateWord } = useReportSteps(obsId, `a ${word}`)
  return (
    <div className="px-5 pt-6">
      <div className="text-[24px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 112" }}>
        Report sent
      </div>
      <p className="mt-1 text-[13px] text-ink-2">The network's current verdict: {stateWord.toLowerCase()}. This page updates as other cars and people add evidence.</p>
      <StepList steps={steps} />
      <button onClick={onAgain} className="mt-6 flex items-center gap-2 border border-ink/30 px-3 py-2 text-[13px] hover:bg-clay-deep">
        <ArrowCounterClockwiseIcon size={15} />
        Report something else
      </button>
    </div>
  )
}

function YouTab() {
  const obs = useEvents((s) => s.observations)
  const deviceId = useEvents((s) => s.deviceId)
  const remote = useEvents((s) => s.remote)
  const reset = useEvents((s) => s.resetAll)
  const threats = useSim((s) => s.threats)
  const now = useSim((s) => s.now)
  const mine = obs.filter((o) => o.sourceId === deviceId).sort((a, b) => b.t - a.t)
  const confirmed = mine.filter((o) => threatForObservation(threats, o.id)?.state === 'confirmed').length
  const points = mine.length * 20 + confirmed * 50
  return (
    <div className="px-5 pt-6">
      <div className="text-[24px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 112" }}>
        Street Guardian
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-live">
        <ShieldCheckIcon size={16} weight="fill" />
        {points} points, {confirmed} confirmed
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-2">20 points per report, 50 more when the network confirms it. Points redeem as service credit at a dealer (concept).</p>

      <h3 className="mt-5 text-[13px] font-semibold">Your reports</h3>
      <ul className="mt-2 divide-y divide-rule/70">
        {mine.length === 0 && <li className="py-3 text-[13px] text-ink-3">Nothing yet. Report a hazard or turn on sensing in Drive.</li>}
        {mine.map((o) => {
          const th = threatForObservation(threats, o.id)
          return (
            <li key={o.id} className="flex items-center gap-3 py-2.5">
              {th ? <StateGlyph state={th.state} size={15} /> : <span className="w-[15px]" />}
              <span className="flex-1 text-[13px] leading-tight">
                {hazardLabel(o.kind)}
                <span className="block text-[11px] text-ink-3">{o.how}</span>
              </span>
              <span className="text-[11px]" style={{ color: th ? STATE[th.state].text : undefined }}>
                {th ? STATE[th.state].word : 'Faded'}
              </span>
            </li>
          )
        })}
      </ul>

      <h3 className="mt-6 text-[13px] font-semibold">This device</h3>
      <dl className="mt-2 space-y-1 text-[12px] text-ink-2">
        <div>Device {deviceId.slice(-4).toUpperCase()}</div>
        <div>{remote === 'on' ? 'Linked: reports reach other devices' : 'Not linked: reports stay in this browser'}</div>
        <div className="text-ink-3">Clock {Math.round((now % 48000) / 1000)} s into the shared scenario</div>
      </dl>
      <button onClick={reset} className="mt-4 border border-ink/30 px-3 py-1.5 text-[12px] hover:bg-clay-deep">
        Clear all demo reports
      </button>
    </div>
  )
}
