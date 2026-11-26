import { useState } from 'react'
import { TwinCanvas } from '../three/Canvases'
import { useTwinCam, type TwinView } from '../world/twinCam'
import { useSim } from '../world/store'
import { useWeather, weatherWords } from '../sense/weather'
import { useEvents } from '../sync/events'
import { SurfaceNav } from '../app/SurfaceNav'
import { STATE, StateGlyph, stateLine } from '../product/bits'
import { useAtmos, type TimeOfDay } from '../world/atmos'

const VIEWS: [TwinView, string][] = [
  ['city', 'City'],
  ['corridor', 'Corridor'],
  ['chase', 'Follow car'],
  ['top', 'Plan'],
]
const RANK: Record<string, number> = { confirmed: 0, potential: 1, noticed: 2, predicted: 3, resolved: 4, faded: 5 }

/** Level 1, full screen: the live city twin with the X-ray sensor wave and every threat on the sheet. */
export default function Twin() {
  const world = useSim((s) => s.world)!
  const xray = useSim((s) => s.xray)
  const setXray = useSim((s) => s.setXray)
  const threats = useSim((s) => s.threats)
  const t = useSim((s) => s.t)
  const weather = useWeather((s) => s.weather)
  const remote = useEvents((s) => s.remote)
  const { view, setView, flyTo } = useTwinCam()
  const [isolines, setIsolines] = useState(true)
  const [labels, setLabels] = useState(true)
  const atmos = useAtmos()
  const list = [...threats].sort((a, b) => RANK[a.state] - RANK[b.state] || b.confidence - a.confidence)

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-clay text-ink">
      <TwinCanvas world={world} xray={xray} isolines={isolines} labels={labels} className="absolute inset-0" />
      <SurfaceNav />

      <div className="absolute right-4 top-4 z-30 flex flex-wrap items-center justify-end gap-2">
        <div className="flex bg-clay" style={{ boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.3)' }}>
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={'px-3 py-1.5 text-[13px] transition-colors ' + (view === v ? 'bg-ink text-clay' : 'hover:bg-clay-deep')}
            >
              {label}
            </button>
          ))}
        </div>
        <Toggle on={xray} onClick={() => setXray(!xray)} label="X-ray wave" />
        <Toggle on={isolines} onClick={() => setIsolines(!isolines)} label="Risk terrain" />
        <Toggle on={labels} onClick={() => setLabels(!labels)} label="Labels" />
      </div>

      <div className="absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 md:left-[calc(50%-170px)]">
        <div className="flex bg-clay" style={{ boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.3)' }}>
          {(['day', 'dusk', 'night'] as TimeOfDay[]).map((t) => (
            <button
              key={t}
              onClick={() => atmos.setTime(t)}
              className={'px-3 py-1.5 text-[13px] capitalize transition-colors ' + (!atmos.live && atmos.time === t ? 'bg-ink text-clay' : 'hover:bg-clay-deep')}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => atmos.goLive(weather)}
            className={'flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors ' + (atmos.live ? 'bg-ink text-clay' : 'hover:bg-clay-deep')}
            title="Use the real time and weather in Powai"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7fb6e6] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#7fb6e6]" />
            </span>
            Live Powai
          </button>
        </div>
        <Toggle on={atmos.rain} onClick={() => atmos.setRain(!atmos.rain)} label="Monsoon rain" />
        <Toggle on={atmos.heat} onClick={() => atmos.setHeat(!atmos.heat)} label="Near-miss heat" />
      </div>

      <aside
        className="absolute bottom-4 right-4 top-16 z-20 hidden w-[340px] flex-col bg-clay md:flex"
        style={{ boxShadow: 'inset 0 0 0 1px #b9b3a5, 0 30px 60px -40px rgba(40,34,26,0.45)' }}
      >
        <div className="border-b border-rule px-4 py-3">
          <div className="text-[15px] font-semibold" style={{ fontVariationSettings: "'wdth' 115" }}>
            On the sheet now
          </div>
          <div className="text-[12px] text-ink-3">Select a threat to fly to it</div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-rule/60 overflow-auto">
          {list.map((th) => (
            <li key={th.id}>
              <button onClick={() => flyTo(th.pos)} className="grid w-full grid-cols-[18px_1fr_auto] items-start gap-2 px-4 py-2.5 text-left hover:bg-clay-deep">
                <StateGlyph state={th.state} size={14} />
                <span>
                  <span className="block text-[13px] font-medium leading-tight">
                    {th.state === 'potential' || th.state === 'noticed' ? `Possible ${th.label.toLowerCase()}` : th.label}
                  </span>
                  <span className="block text-[11px]" style={{ color: STATE[th.state].text }}>
                    {stateLine(th)}
                  </span>
                </span>
                <span className="figures text-[10px] text-ink-3">{Math.round(th.confidence * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 border-t border-rule text-[11px] text-ink-3">
          <div className="px-4 py-2.5">
            Scenario second <span className="figures text-ink">{t.toFixed(1)}</span>
          </div>
          <div className="border-l border-rule px-4 py-2.5">{remote === 'on' ? 'Linked to other devices' : 'This browser only'}</div>
          <div className="col-span-2 border-t border-rule px-4 py-2.5">{weatherWords(weather)}</div>
        </div>
      </aside>
      <p className="absolute bottom-2 left-4 z-20 text-[10px] text-ink-3">Map data OpenStreetMap contributors, ODbL. Vehicles and crash history simulated.</p>
    </main>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex items-center gap-2 bg-clay px-3 py-1.5 text-[13px] hover:bg-clay-deep"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.3)' }}
    >
      <span className={'relative h-3 w-5 rounded-full transition-colors ' + (on ? 'bg-live' : 'bg-clay-shade')}>
        <span className={'absolute top-0.5 h-2 w-2 rounded-full bg-clay transition-transform ' + (on ? 'translate-x-2.5' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  )
}
