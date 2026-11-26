import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import QRCode from 'qrcode'
import { ArrowsClockwiseIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { LOOP, clockState, onClockChange, pause, play, resync, seek } from '../world/clock'
import { useSim } from '../world/store'
import { useEvents } from '../sync/events'
import { SURFACES, SurfaceNav } from '../app/SurfaceNav'
import { STATE, StateGlyph } from '../product/bits'

const BEATS: { at: number; title: string; say: string }[] = [
  { at: 0, title: 'Pothole known for days', say: 'Two cars, a dashcam and a resident already confirmed this pothole. Every car approaching gets it.' },
  { at: 6, title: 'Resident reports a barricade', say: 'One photo from a new account. The network says "possible", it does not cry wolf.' },
  { at: 12, title: 'Cars swerve at the same spot', say: 'Nobody named it, but three different cars swerved within 15 metres. That is a second, independent source.' },
  { at: 17.5, title: 'Lane advice', say: 'The bus stop ahead blocks lane 1. The driver is moved to lane 2 early, not at the last second.' },
  { at: 18, title: 'Dashcam names the barricade', say: 'An open-vocabulary detector confirms it. Now it is a confirmed, lane-level warning.' },
  { at: 22.3, title: 'Car ahead sees a pedestrian', say: 'Hidden from us by the bus. The car 72 metres ahead sees them first.' },
  { at: 22.9, title: 'Second car agrees', say: 'An oncoming car confirms. Our driver is told before the bus clears.' },
  { at: 27.5, title: 'Our own camera sees them', say: 'Now the ego car sees the pedestrian too. The network was 5 seconds earlier.' },
  { at: 40, title: 'Pedestrian clears, threat resolves', say: 'Nobody sees them any more; the warning fades on its own. No stale alerts.' },
]

export default function Director() {
  const t = useSim((s) => s.t)
  const threats = useSim((s) => s.threats)
  const remote = useEvents((s) => s.remote)
  const reset = useEvents((s) => s.resetAll)
  const count = useEvents((s) => s.observations.length)
  const [paused, setPaused] = useState(clockState().paused)
  const [qr, setQr] = useState('')
  const phoneUrl = typeof window !== 'undefined' ? `${window.location.origin}/app` : '/app'

  useEffect(() => onClockChange(() => setPaused(clockState().paused)), [])
  useEffect(() => {
    QRCode.toString(phoneUrl, { type: 'svg', margin: 0, color: { dark: '#1c2226', light: '#00000000' } }).then(setQr)
  }, [phoneUrl])

  const current = [...BEATS].reverse().find((b) => t >= b.at) ?? BEATS[0]

  return (
    <main className="min-h-[100dvh] bg-clay px-5 pb-16 pt-20 text-ink md:px-10">
      <SurfaceNav />
      <div className="mx-auto grid max-w-[1300px] gap-10 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-[13px] text-ink-3">Scenario second</div>
              <div className="figures text-[64px] leading-none">{t.toFixed(1)}</div>
            </div>
            <div className="flex gap-2 pb-1">
              <button
                onClick={() => (paused ? play() : pause())}
                className="flex items-center gap-2 bg-ink px-4 py-2 text-[14px] font-medium text-clay hover:bg-ink-2"
              >
                {paused ? <PlayIcon size={15} weight="fill" /> : <PauseIcon size={15} weight="fill" />}
                {paused ? 'Play' : 'Pause'}
              </button>
              <button onClick={resync} className="flex items-center gap-2 border border-ink/30 px-4 py-2 text-[14px] hover:bg-clay-deep">
                <ArrowsClockwiseIcon size={15} />
                Back to shared time
              </button>
            </div>
          </div>

          <div className="relative mt-8">
            <input
              type="range"
              min={0}
              max={LOOP - 0.1}
              step={0.1}
              value={t}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full accent-[#1c2226]"
              aria-label="Scenario time"
            />
            <div className="relative mt-1 h-5">
              {BEATS.map((b) => (
                <span key={b.at} className="absolute top-0 h-2 w-px bg-ink/50" style={{ left: `${(b.at / LOOP) * 100}%` }} />
              ))}
            </div>
          </div>

          <div className="mt-6 border-l-2 border-ink pl-4">
            <div className="text-[22px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 112" }}>
              {current.title}
            </div>
            <p className="mt-1 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">{current.say}</p>
          </div>

          <ol className="mt-8 grid gap-x-6 border-t border-rule md:grid-cols-2">
            {BEATS.map((b) => (
              <li key={b.at} className="border-b border-rule">
                <button onClick={() => seek(b.at)} className={'grid w-full grid-cols-[3.2rem_1fr] gap-2 py-3 text-left ' + (b === current ? 'font-semibold' : '')}>
                  <span className="figures text-[13px] text-ink-3">{b.at.toFixed(1)}</span>
                  <span className="text-[14px]">{b.title}</span>
                </button>
              </li>
            ))}
          </ol>

          <h2 className="mt-10 text-[15px] font-semibold">Live threat states</h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {threats.map((th) => (
              <li key={th.id} className="flex items-center gap-2 text-[13px]">
                <StateGlyph state={th.state} size={13} />
                {th.label}
                <span style={{ color: STATE[th.state].text }}>{STATE[th.state].word}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-8">
          <div>
            <h2 className="text-[15px] font-semibold">Phone for the jury</h2>
            <div className="mt-3 w-[220px]" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-2 break-all text-[12px] text-ink-3">{phoneUrl}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
              {remote === 'on'
                ? 'Devices are linked: a report or a shake on any phone appears on every screen.'
                : 'Devices are not linked yet: reports stay on the device that made them. Add the shared store to link them (see the deploy notes).'}
            </p>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Open surfaces</h2>
            <ul className="mt-2 space-y-1">
              {SURFACES.filter((s) => s.href !== '/director').map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noreferrer" className="text-[14px]">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Live reports</h2>
            <p className="mt-1 text-[13px] text-ink-2">{count} from people and phones so far.</p>
            <button onClick={reset} className="mt-3 border border-ink/30 px-3 py-1.5 text-[12px] hover:bg-clay-deep">
              Clear all live reports
            </button>
          </div>
          <p className="text-[12px] text-ink-3">
            Keys: 0 to 6 switch surfaces on any screen. <Link href="/">Showcase</Link>
          </p>
        </aside>
      </div>
    </main>
  )
}
