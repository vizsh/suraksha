import { useRef, type ReactNode } from 'react'
import { Link } from 'wouter'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import VariableProximity from '../components/VariableProximity'
import { HeroCanvas, useViewScale } from '../three/Canvases'
import { sampleAgents, waveRadius, type World } from '../world/scenario'
import { useSim } from '../world/store'
import { useWeather, weatherWords } from '../sense/weather'
import { STATE, Scaled, StateGlyph } from '../product/bits'
import { WebConsole } from '../product/WebConsole'
import { DashScreen, HUD_H, HUD_W, Hud } from '../product/Car'
import { PhoneCitizen, PhoneDriver, PhoneFrame } from '../product/Phone'
import { LifecyclePlates } from '../product/Lifecycle'
import { SURFACES, SurfaceNav } from '../app/SurfaceNav'

export default function Showcase() {
  const world = useSim((s) => s.world)!
  return (
    <main className="bg-clay text-ink">
      <SurfaceNav />
      <Hero world={world} />
      <CitySection world={world} />
      <CarSection world={world} />
      <PhoneSection world={world} />
      <LifecycleSection world={world} />
      <SurfacesIndex />
      <Close />
    </main>
  )
}

const LEGEND = [
  ['confirmed', 'Confirmed by several sources'],
  ['potential', 'Potential, one source so far'],
  ['predicted', 'Predicted from history and geometry'],
  ['live', 'Live perception of a connected car'],
] as const

export function Legend({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-ink-2' : 'flex flex-col items-end gap-1 text-[12px] text-ink-2'}>
      {LEGEND.map(([s, label]) => (
        <li key={s} className={'flex items-center gap-2 ' + (compact ? '' : 'flex-row-reverse')}>
          <StateGlyph state={s} size={13} />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** A scale bar for the point the camera looks at, rounded to a survey-friendly length. */
export function ScaleBar() {
  const mpp = useViewScale((s) => s.mpp)
  const len = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((m) => m / mpp >= 64) ?? 1000
  const px = len / mpp
  return (
    <div className="flex items-end gap-3">
      <div className="relative h-2.5" style={{ width: px }}>
        <div className="absolute inset-x-0 bottom-0 h-px bg-ink" />
        <div className="absolute bottom-0 left-0 h-2.5 w-px bg-ink" />
        <div className="absolute bottom-0 left-1/2 h-1.5 w-px bg-ink" />
        <div className="absolute bottom-0 right-0 h-2.5 w-px bg-ink" />
        <div className="absolute bottom-0 left-0 h-[3px] w-1/2 bg-ink" />
      </div>
      <span className="figures text-[11px] leading-none text-ink-2">{len} m at focus</span>
    </div>
  )
}

/** Graduated ticks along the sheet's frame edge, the only linework that is not road or risk. */
function Neatline() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
      <div
        className="absolute inset-x-0 bottom-0 h-2"
        style={{ backgroundImage: 'linear-gradient(to right, rgba(28,34,38,0.45) 1px, transparent 1px)', backgroundSize: '40px 100%' }}
      />
      <div
        className="absolute inset-y-0 right-0 w-2"
        style={{ backgroundImage: 'linear-gradient(to bottom, rgba(28,34,38,0.45) 1px, transparent 1px)', backgroundSize: '100% 40px' }}
      />
    </div>
  )
}

function Hero({ world }: { world: World }) {
  const xray = useSim((s) => s.xray)
  const setXray = useSim((s) => s.setXray)
  const t = useSim((s) => s.t)
  const threats = useSim((s) => s.threats)
  const weather = useWeather((s) => s.weather)
  const block = useRef<HTMLDivElement>(null)
  const connected = sampleAgents(world, t).filter((a) => a.connected).length
  const live = threats.filter((x) => x.state !== 'resolved').length

  return (
    <section className="relative h-[100dvh] min-h-[680px] overflow-hidden">
      <HeroCanvas world={world} xray={xray} className="absolute inset-0" />
      <Neatline />

      <div className="absolute right-4 top-4 z-30 flex flex-col items-end gap-3 md:right-6">
        <button
          onClick={() => setXray(!xray)}
          aria-pressed={xray}
          className="flex items-center gap-2.5 bg-clay px-3 py-1.5 text-[13px] transition-colors hover:bg-clay-deep"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.35)' }}
        >
          <span className={'relative h-3.5 w-6 rounded-full transition-colors ' + (xray ? 'bg-live' : 'bg-clay-shade')}>
            <span className={'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-clay transition-transform ' + (xray ? 'translate-x-3' : 'translate-x-0.5')} />
          </span>
          X-ray sensor wave
        </button>
        <div className="hidden md:block">
          <Legend />
        </div>
      </div>

      <div
        ref={block}
        className="absolute bottom-0 left-0 z-30 w-full bg-clay md:bottom-8 md:left-8 md:w-[600px]"
        style={{ boxShadow: 'inset 0 0 0 1px #b9b3a5, 0 30px 60px -40px rgba(40,34,26,0.45)' }}
      >
        <div className="grid grid-cols-[1fr_auto] border-b border-rule">
          <div className="px-5 py-2.5 text-[15px] font-semibold" style={{ fontVariationSettings: "'wdth' 125" }}>
            SuRaksha Mesh
          </div>
          <div className="border-l border-rule px-5 py-2.5 text-right text-[12px] leading-tight text-ink-2">
            Powai corridor, Mumbai
            <span className="block text-ink-3">JVLR, IIT Bombay to Hiranandani</span>
          </div>
        </div>
        <div className="border-b border-rule px-5 pb-4 pt-4">
          <h1 className="text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.02em] md:text-[44px]">
            <VariableProximity
              label="Every hidden threat, surveyed live."
              containerRef={block}
              fromFontVariationSettings="'wdth' 118, 'wght' 600"
              toFontVariationSettings="'wdth' 125, 'wght' 760"
              radius={140}
              falloff="gaussian"
            />
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            Connected cars, residents and crash history map the danger a driver cannot see yet, and tell each driver only what is in their lane.
          </p>
        </div>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] border-b border-rule">
          <Link
            href="/twin"
            className="flex items-center gap-2 bg-ink px-5 py-3 text-[14px] font-medium text-clay no-underline transition-colors hover:bg-ink-2 active:translate-y-px"
          >
            Enter the twin
            <ArrowRightIcon size={15} />
          </Link>
          <Cell label="connected cars" value={connected} />
          <Cell label="threats on sheet" value={live} />
          <Cell label="wave radius, m" value={xray ? Math.round(waveRadius(t)) : 0} />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5">
          <ScaleBar />
          <span className="text-right text-[11px] text-ink-3">{weatherWords(weather)}</span>
        </div>
        <div className="border-t border-rule px-5 py-3 md:hidden">
          <Legend compact />
        </div>
      </div>
      <p className="absolute bottom-2 right-5 hidden text-[10px] text-ink-3 md:block">
        Map data OpenStreetMap contributors, ODbL. Vehicles, sensor reports and crash history are simulated.
      </p>
    </section>
  )
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-rule px-4 py-2">
      <div className="figures text-[20px] leading-none">{value}</div>
      <div className="mt-1 text-[10px] leading-tight text-ink-3">{label}</div>
    </div>
  )
}

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { clipPath: 'inset(14% 0% 0% 0%)', opacity: 0.5, y: 36 }}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function CitySection({ world }: { world: World }) {
  return (
    <section id="city" className="mx-auto max-w-[1400px] px-5 pb-20 pt-24 md:px-10">
      <h2 className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] md:text-[48px]" style={{ fontVariationSettings: "'wdth' 112" }}>
        The city sees the whole corridor.
      </h2>
      <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">
        The operations console fuses every car's view into one lane-level map. Each threat shows who saw it, how sure the network is, and what a crew should do.
      </p>
      <Reveal className="mt-10">
        <div className="overflow-hidden" style={{ boxShadow: '0 40px 80px -40px rgba(40,34,26,0.5), 0 0 0 1px rgba(28,34,38,0.35)' }}>
          <div className="flex items-center gap-3 border-b border-rule bg-clay-deep px-4 py-2 text-[12px] text-ink-3">
            <span>ops.surakshamesh.in / corridor / powai</span>
            <span className="flex-1" />
            <span className="hidden sm:inline">Web console</span>
          </div>
          <Scaled w={1600} h={900} min={0.55}>
            <div className="h-[900px] w-[1600px]">
              <WebConsole world={world} />
            </div>
          </Scaled>
        </div>
      </Reveal>
    </section>
  )
}

export function CarSection({ world }: { world: World }) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-10">
      <div className="overflow-hidden" style={{ boxShadow: '0 40px 80px -40px rgba(20,20,20,0.6)' }}>
        <Scaled w={HUD_W} h={HUD_H} min={0.5}>
          <Hud world={world} />
        </Scaled>
      </div>
      <div className="mt-14 grid items-start gap-10 md:grid-cols-[1fr_62%]">
        <div>
          <h2 className="text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[44px]" style={{ fontVariationSettings: "'wdth' 112" }}>
            The driver hears it before the bus clears.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">
            The windshield display and the in-dash screen show only what is on your route, in your lane, in the next minute. A potential hazard is said as "possible".
          </p>
        </div>
        <div>
          <div style={{ boxShadow: '0 30px 60px -30px rgba(20,20,20,0.65), 0 0 0 8px #1c2226' }}>
            <Scaled w={1920} h={720} min={0.45}>
              <DashScreen world={world} />
            </Scaled>
          </div>
          <div className="mt-4 text-right text-[13px] text-ink-3">In-dash screen, 1920 by 720</div>
        </div>
      </div>
    </section>
  )
}

export function PhoneSection({ world }: { world: World }) {
  return (
    <section className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 py-20 md:grid-cols-[0.9fr_1.1fr] md:px-10">
      <div>
        <h2 className="max-w-[14ch] text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[44px]" style={{ fontVariationSettings: "'wdth' 112" }}>
          Every phone is a sensor and a warning.
        </h2>
        <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-ink-2">
          Drivers without a connected car get the same Road Ahead. Residents report broken footpaths and barricades, then watch the network act on it.
        </p>
        <Link href="/app" className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-ink">
          Open the phone app
          <ArrowRightIcon size={14} />
        </Link>
      </div>
      <div className="mx-auto grid w-full max-w-[640px] grid-cols-1 gap-10 sm:grid-cols-2">
        <div className="mx-auto w-full max-w-[300px]">
          <PhoneFrame label="Driver app">
            <PhoneDriver world={world} />
          </PhoneFrame>
        </div>
        <div className="mx-auto w-full max-w-[300px] sm:mt-24">
          <PhoneFrame label="Citizen app">
            <PhoneCitizen world={world} />
          </PhoneFrame>
        </div>
      </div>
    </section>
  )
}

export function LifecycleSection({ world }: { world: World }) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-10">
      <h2 className="max-w-[22ch] text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[44px]" style={{ fontVariationSettings: "'wdth' 112" }}>
        One photo becomes a confirmed threat.
      </h2>
      <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">
        The same 140 metres of road at the same scale, four moments apart. The highlighted plate is the engine's live verdict on tonight's barricade.
      </p>
      <div className="mt-12">
        <LifecyclePlates world={world} />
      </div>
    </section>
  )
}

export function SurfacesIndex() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-10">
      <h2 className="text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[44px]" style={{ fontVariationSettings: "'wdth' 112" }}>
        Open any surface. They share one clock.
      </h2>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
        Every device follows the same scenario second, so a phone, a laptop and a projector agree without pairing. Reports made on one appear on the others.
      </p>
      <ul className="mt-10 grid border-t border-rule md:grid-cols-2">
        {SURFACES.filter((s) => s.href !== '/').map((s, i) => (
          <li key={s.href} className={'border-b border-rule ' + (i % 2 === 0 ? 'md:border-r' : '')}>
            <Link href={s.href} className="group grid grid-cols-[2.2rem_1fr_auto] items-baseline gap-2 px-1 py-5 no-underline md:px-4">
              <span className="figures text-[12px] text-ink-3">{s.key}</span>
              <span>
                <span className="block text-[20px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 108" }}>
                  {s.label}
                </span>
                <span className="mt-0.5 block text-[14px] text-ink-2">{s.what}</span>
              </span>
              <ArrowRightIcon size={18} className="text-ink-3 transition-transform group-hover:translate-x-1 group-hover:text-ink" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Close() {
  const real = ['Roads, lanes and footways', 'Building footprints and heights', 'Signals, bus stops, hospitals', 'Weather and visibility (Open-Meteo)', 'Fatigue detection from your webcam', 'Phone accelerometer and camera reports']
  const sim = ['Vehicle tracks and their dashcam detections', 'Crash history behind the predicted zones', 'Resident reports and swerve clusters in the scenario']
  return (
    <footer className="mt-8 border-t border-rule">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-16 md:grid-cols-[1.2fr_1fr_1fr] md:px-10">
        <div>
          <div className="text-[28px] font-semibold leading-tight" style={{ fontVariationSettings: "'wdth' 120" }}>
            SuRaksha Mesh
          </div>
          <p className="mt-3 max-w-[40ch] text-[14px] leading-relaxed text-ink-2">
            A prototype for the Maruti Suzuki Innovation and IIT Bombay E-Summit Ideathon, 2026. No new hardware: cars and phones that already exist.
          </p>
        </div>
        <div>
          <div className="text-[13px] font-semibold">Real in this prototype</div>
          <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
            {real.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[13px] font-semibold">Simulated for the demo</div>
          <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
            {sim.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-ink-3">The fusion engine, lifecycle and driver relevance logic are real code with unit tests; only their inputs are simulated.</p>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-5 pb-8 text-[11px] text-ink-3 md:px-10">
        Map data OpenStreetMap contributors, ODbL. Weather from Open-Meteo. <span style={{ color: STATE.predicted.text }}>Synthetic</span> crash history is labelled wherever it is used.
      </div>
    </footer>
  )
}
