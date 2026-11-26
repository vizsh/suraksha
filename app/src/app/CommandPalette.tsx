// Ctrl/Cmd + K: jump to any surface, fly to any threat, seek to any story beat, flip any layer.
import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import { useLocation } from 'wouter'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { SURFACES } from './SurfaceNav'
import { useSim } from '../world/store'
import { useTwinCam } from '../world/twinCam'
import { seek, pause, play, resync, clockState } from '../world/clock'
import { useAtmos } from '../world/atmos'
import { useWeather } from '../sense/weather'
import { STATE, StateGlyph } from '../product/bits'

const BEATS: [number, string][] = [
  [6, 'Resident reports a barricade'],
  [12, 'Cars swerve at the barricade'],
  [18, 'Dashcam confirms the barricade'],
  [22.3, 'Car ahead sees the pedestrian'],
  [27.5, 'Your camera sees the pedestrian'],
  [40, 'Pedestrian clears'],
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [, go] = useLocation()
  const threats = useSim((s) => s.threats)
  const setXray = useSim((s) => s.setXray)
  const xray = useSim((s) => s.xray)
  const flyTo = useTwinCam((s) => s.flyTo)
  const atmos = useAtmos()
  const weather = useWeather((s) => s.weather)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }
  const item = 'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[14px] data-[selected=true]:bg-clay-deep'
  const group = '[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-ink-3'

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] grid place-items-start bg-[#11161a]/40 pt-[14vh] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
          <motion.div
            initial={{ y: -12, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="mx-auto w-[min(640px,92vw)] bg-clay text-ink"
            style={{ boxShadow: '0 40px 100px -30px rgba(10,14,16,0.6), inset 0 0 0 1px #b9b3a5' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Command palette" loop>
              <div className="flex items-center gap-3 border-b border-rule px-4">
                <MagnifyingGlassIcon size={17} className="text-ink-3" />
                <Command.Input autoFocus placeholder="Go to a surface, a threat, a moment, or a layer" className="h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-ink-3" />
                <kbd className="figures text-[10px] text-ink-3">ESC</kbd>
              </div>
              <Command.List className="max-h-[56vh] overflow-auto pb-2">
                <Command.Empty className="px-4 py-6 text-[14px] text-ink-3">Nothing matches.</Command.Empty>
                <Command.Group heading="Surfaces" className={group}>
                  {SURFACES.map((s) => (
                    <Command.Item key={s.href} value={`surface ${s.label} ${s.what}`} onSelect={run(() => go(s.href))} className={item}>
                      <span className="figures w-4 text-[11px] text-ink-3">{s.key}</span>
                      <span className="flex-1">{s.label}</span>
                      <span className="text-[12px] text-ink-3">{s.what}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Threats on the sheet" className={group}>
                  {threats
                    .filter((t) => t.state !== 'resolved')
                    .map((t) => (
                      <Command.Item
                        key={t.id}
                        value={`threat ${t.label} ${t.lane} ${STATE[t.state].word}`}
                        onSelect={run(() => {
                          go('/twin')
                          setTimeout(() => flyTo(t.pos), 300)
                        })}
                        className={item}
                      >
                        <StateGlyph state={t.state} size={14} />
                        <span className="flex-1">{t.label}</span>
                        <span className="text-[12px]" style={{ color: STATE[t.state].text }}>
                          {STATE[t.state].word}
                        </span>
                      </Command.Item>
                    ))}
                </Command.Group>
                <Command.Group heading="Story moments" className={group}>
                  {BEATS.map(([t, label]) => (
                    <Command.Item key={t} value={`moment ${label}`} onSelect={run(() => seek(t))} className={item}>
                      <span className="figures w-10 text-[11px] text-ink-3">{t.toFixed(1)}</span>
                      <span>{label}</span>
                    </Command.Item>
                  ))}
                  <Command.Item value="clock pause play" onSelect={run(() => (clockState().paused ? play() : pause()))} className={item}>
                    {clockState().paused ? 'Play the scenario' : 'Pause the scenario'}
                  </Command.Item>
                  <Command.Item value="clock resync shared time" onSelect={run(resync)} className={item}>
                    Back to shared time
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Layers and atmosphere" className={group}>
                  <Command.Item value="layer xray sensor wave" onSelect={run(() => setXray(!xray))} className={item}>
                    {xray ? 'Hide' : 'Show'} the X-ray sensor wave
                  </Command.Item>
                  <Command.Item value="layer near miss heat" onSelect={run(() => atmos.setHeat(!atmos.heat))} className={item}>
                    {atmos.heat ? 'Hide' : 'Show'} near-miss heat
                  </Command.Item>
                  {(['day', 'dusk', 'night'] as const).map((t) => (
                    <Command.Item key={t} value={`time ${t}`} onSelect={run(() => atmos.setTime(t))} className={item}>
                      Set time to {t}
                    </Command.Item>
                  ))}
                  <Command.Item value="weather rain monsoon" onSelect={run(() => atmos.setRain(!atmos.rain))} className={item}>
                    {atmos.rain ? 'Stop the rain' : 'Make it rain'}
                  </Command.Item>
                  <Command.Item value="weather live powai real" onSelect={run(() => atmos.goLive(weather))} className={item}>
                    Live Powai weather and time
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
