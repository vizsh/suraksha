import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { StoryCanvas, useStory } from '../three/Canvases'
import { setOverride, setScenario } from '../world/clock'
import { DEFAULT_SCENARIO } from '../world/scenarios'
import { useSim } from '../world/store'
import { SurfaceNav } from '../app/SurfaceNav'
import { Playground } from '../product/Playground'
import { SplitView } from '../product/SplitView'
import { CarSection, CitySection, Close, Legend, LifecycleSection, PhoneSection, SurfacesIndex } from './Showcase'

const CHAPTERS = [
  {
    from: 0,
    title: 'Every hidden threat, surveyed live.',
    body: 'In 2022, 1,68,491 people died on India’s roads: one every three minutes (MoRTH, Road Accidents in India 2022).',
  },
  { from: 0.18, title: 'What kills is often out of sight.', body: 'A barricade put up overnight. A pothole under monsoon water. A person stepping out from behind a bus.' },
  { from: 0.38, title: 'Every connected car is a sensor.', body: 'Dashcams, accelerometers and residents’ photos stream into one lane-level picture of the road. The X-ray wave shows what each car can see.' },
  { from: 0.58, title: 'One report is a rumour. Two sources are a fact.', body: 'The car 72 metres ahead sees the pedestrian; an oncoming car agrees. Confidence crosses the line and the threat is confirmed.' },
  { from: 0.8, title: 'Your car hears it before the bus clears.', body: 'Only what is on your route, in your lane, in the next minute. Then the warning fades on its own.' },
]

function Story() {
  const world = useSim((s) => s.world)!
  const xray = useSim((s) => s.xray)
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setP(v)
    useStory.setState({ p: v })
    setOverride(4 + v * 36)
  })
  // the story owns the scenario clock only while it is on screen
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setOverride(e.isIntersecting ? 4 + useStory.getState().p * 36 : null), { threshold: 0 })
    io.observe(el)
    return () => {
      io.disconnect()
      setOverride(null)
    }
  }, [])
  const ch = [...CHAPTERS].reverse().find((c) => p >= c.from) ?? CHAPTERS[0]
  // labels explain the map in later chapters; the hero shot and phone-width frames stay clean
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const i = CHAPTERS.indexOf(ch)

  return (
    <section ref={ref} className="relative h-[560vh]">
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        {/* its own stacking layer, so the scrim and the words always sit above the 3D labels */}
        <StoryCanvas world={world} xray={xray} labels={i !== 0 && !narrow} className="absolute inset-0 z-0" />
        {/* above the 3D labels (z 0-10), below the words: labels never sit on the headline */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[62%] bg-gradient-to-t from-[#141a1e]/80 via-[#141a1e]/40 to-transparent md:h-[50%] md:from-[#141a1e]/60 md:via-[#141a1e]/20" />

        <div className="absolute bottom-10 left-5 right-5 z-20 max-w-[620px] md:left-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16, filter: 'blur(6px)' }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              {i === 0 && (
                <div className="mb-4 text-[15px] font-semibold text-clay" style={{ fontVariationSettings: "'wdth' 125" }}>
                  SuRaksha Mesh
                </div>
              )}
              <h1
                className="text-balance text-[38px] font-semibold leading-[1.03] tracking-[-0.02em] text-[#f6f4ef] md:text-[60px]"
                style={{ fontVariationSettings: "'wdth' 118", textShadow: '0 2px 30px rgba(0,0,0,0.35)' }}
              >
                {ch.title}
              </h1>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[#eceae4] md:text-[18px]" style={{ textShadow: '0 1px 16px rgba(0,0,0,0.45)' }}>
                {ch.body}
              </p>
              {i === 0 && (
                <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-4">
                  <Link href="/twin" className="inline-flex items-center gap-2 bg-clay px-5 py-3 text-[15px] font-semibold text-ink no-underline hover:bg-white">
                    Launch the prototype
                    <ArrowRightIcon size={16} />
                  </Link>
                  <span className="text-[13px] text-[#eceae4]/80">or scroll to follow one night on JVLR, Powai</span>
                </div>
              )}
              {i === CHAPTERS.length - 1 && (
                <Link href="/drive" className="pointer-events-auto mt-6 inline-flex items-center gap-2 bg-clay px-4 py-2.5 text-[14px] font-medium text-ink no-underline hover:bg-clay-deep">
                  Sit in the driver&rsquo;s seat
                  <ArrowRightIcon size={15} />
                </Link>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* chapter rail */}
        <ol className="absolute right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 md:flex">
          {CHAPTERS.map((c, k) => (
            <li key={k} className="flex items-center justify-end gap-3">
              <span className={'text-right text-[11px] transition-opacity ' + (k === i ? 'text-[#f6f4ef] opacity-100' : 'text-[#f6f4ef] opacity-0')}>{c.title.split('.')[0]}</span>
              <span className={'block w-[2px] transition-all ' + (k === i ? 'h-8 bg-[#f6f4ef]' : 'h-4 bg-[#f6f4ef]/45')} />
            </li>
          ))}
        </ol>
        <div className="absolute right-4 top-20 z-30 hidden bg-clay/90 px-3 py-2 md:block" style={{ boxShadow: 'inset 0 0 0 1px rgba(28,34,38,0.3)' }}>
          <Legend />
        </div>
        <p className="absolute bottom-2 right-5 z-20 hidden text-[10px] text-[#eceae4]/70 md:block">
          Imagery Esri, Maxar, Earthstar Geographics. Map data OpenStreetMap contributors. Vehicles and crash history simulated.
        </p>
      </div>
    </section>
  )
}

function Numbers() {
  const items = [
    ['1,68,491', 'road deaths in India in 2022', 'MoRTH, Road Accidents in India 2022'],
    ['0', 'new sensors to install', 'Uses cars and phones already on the road'],
    ['2', 'independent sources before "confirmed"', 'A single report is only ever "possible"'],
    ['60 s', 'warning horizon per driver', 'Filtered to your route and your lane'],
  ]
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-10">
      <div className="grid gap-y-10 border-t border-rule pt-10 md:grid-cols-4">
        {items.map(([n, l, s]) => (
          <div key={l} className="md:border-l md:border-rule md:px-6 md:first:border-l-0 md:first:pl-0">
            <div className="figures text-[44px] leading-none md:text-[52px]">{n}</div>
            <div className="mt-3 text-[16px] font-medium">{l}</div>
            <div className="mt-1 text-[13px] text-ink-3">{s}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlaygroundSection() {
  const world = useSim((s) => s.world)!
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-10">
      <h2 className="max-w-[20ch] text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[48px]" style={{ fontVariationSettings: "'wdth' 112" }}>
        The Fusion Lab. You add evidence; the engine decides.
      </h2>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
        The same fusion code that drives every screen, on the real satellite view of tonight's barricade. Each line is one independent source; its width is that source's weight. Press Autoplay to watch a rumour become a confirmed, lane-level warning, then clear.
      </p>
      <div className="mt-10">
        <Playground world={world} />
      </div>
    </section>
  )
}

function SplitSection() {
  const world = useSim((s) => s.world)!
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-10">
      <h2 className="max-w-[22ch] text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[48px]" style={{ fontVariationSettings: "'wdth' 112" }}>
        One car sees 100 metres. The network sees the road.
      </h2>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
        The same moment from the driver's seat, twice. Left: only what this car's own cameras know. Right: what every connected car has told the network. Drag the divider.
      </p>
      <div className="mt-10">
        <SplitView world={world} />
      </div>
    </section>
  )
}

function Value() {
  const cols = [
    ['For drivers', 'Lane-level warnings before the hazard is visible, a safety score that rewards smooth driving, and fewer false alarms because single reports are said softly.'],
    ['For Maruti Suzuki', 'A road-intelligence network from cars already connected through Suzuki Connect: an ADAS-style feature with no new hardware, and a reason to stay connected.'],
    ['For cities', 'A ranked work queue of potholes, barricades and footpath gaps, with evidence attached, and passing cars that verify each repair.'],
  ]
  return (
    <section className="bg-ink text-clay">
      <div className="mx-auto max-w-[1400px] px-5 py-24 md:px-10">
        <h2 className="max-w-[22ch] text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.02em] md:text-[48px]" style={{ fontVariationSettings: "'wdth' 112" }}>
          One network, three people it pays off for.
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {cols.map(([h, b]) => (
            <div key={h} className="border-t border-clay/25 pt-5">
              <div className="text-[20px] font-semibold" style={{ fontVariationSettings: "'wdth' 110" }}>
                {h}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-clay/75">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Always-visible way into the live prototype. */
function LaunchButton() {
  return (
    <Link
      href="/twin"
      className="fixed right-4 top-4 z-50 inline-flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-semibold text-clay no-underline hover:bg-ink-2 active:translate-y-px"
      style={{ boxShadow: '0 12px 30px -12px rgba(10,14,16,0.6)' }}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7fb6e6] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7fb6e6]" />
      </span>
      Launch prototype
      <ArrowRightIcon size={14} />
    </Link>
  )
}

export default function Landing() {
  const world = useSim((s) => s.world)!
  return (
    <main className="bg-clay text-ink">
      <SurfaceNav />
      <LaunchButton />
      {world.scenario.id !== DEFAULT_SCENARIO && (
        <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 bg-ink px-4 py-2.5 text-[13px] text-clay" style={{ boxShadow: '0 20px 40px -20px rgba(0,0,0,0.5)' }}>
          <span className="min-w-0 flex-1">
            This page tells the night on JVLR. Now playing: <span className="font-medium">{world.scenario.short}</span>.
          </span>
          <button onClick={() => setScenario(DEFAULT_SCENARIO)} className="shrink-0 bg-clay px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-white">
            Play the night story
          </button>
        </div>
      )}
      <Story />
      <Numbers />
      <PlaygroundSection />
      <SplitSection />
      <CitySection world={world} />
      <CarSection world={world} />
      <PhoneSection world={world} />
      <LifecycleSection world={world} />
      <Value />
      <SurfacesIndex />
      <Close />
    </main>
  )
}
