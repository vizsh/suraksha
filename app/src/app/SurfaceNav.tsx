import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { AnimatePresence, motion } from 'motion/react'
import { ListIcon, XIcon } from '@phosphor-icons/react'

export const SURFACES = [
  { href: '/', key: '0', label: 'Home', what: 'The story and the product on every surface' },
  { href: '/twin', key: '1', label: 'City twin', what: '3D corridor with the X-ray sensor wave' },
  { href: '/ops', key: '2', label: 'Operations', what: 'City console, reports and work orders' },
  { href: '/drive', key: '3', label: 'Cockpit', what: 'Windshield HUD and driver monitoring' },
  { href: '/car', key: '4', label: 'In-dash screen', what: '1920 by 720 car display' },
  { href: '/app', key: '5', label: 'Phone app', what: 'Drive mode and citizen reports' },
  { href: '/director', key: '6', label: 'Director', what: 'Run the demo: clock, beats, QR' },
  { href: '/dashcam', key: '7', label: 'Dashcam AI', what: 'On-device hazard detection from a phone camera' },
] as const

/** Small surface switcher shared by every full-screen surface. Number keys jump between surfaces. */
export function SurfaceNav({ tone = 'day', className = '', inline = false }: { tone?: 'day' | 'night'; className?: string; inline?: boolean }) {
  const [open, setOpen] = useState(false)
  const [loc, go] = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = SURFACES.find((x) => x.key === e.key)
      if (s) go(s.href)
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])
  const current = SURFACES.find((s) => s.href === loc)
  const night = tone === 'night'
  return (
    <div className={(inline ? 'relative z-50 ' : 'fixed left-4 top-4 z-50 ') + className}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          'flex items-center gap-2 px-3 py-1.5 text-[13px] ' +
          (night ? 'bg-night-2/90 text-clay hover:bg-night-2' : 'bg-clay/90 text-ink hover:bg-clay')
        }
        style={{ boxShadow: night ? 'inset 0 0 0 1px rgba(231,227,217,0.25)' : 'inset 0 0 0 1px rgba(28,34,38,0.3)' }}
        aria-expanded={open}
      >
        {open ? <XIcon size={14} /> : <ListIcon size={14} />}
        <span className="font-semibold" style={{ fontVariationSettings: "'wdth' 118" }}>
          SuRaksha Mesh
        </span>
        <span className={night ? 'text-clay/60' : 'text-ink-3'}>{current?.label}</span>
        <kbd className={'figures ml-1 hidden px-1 text-[10px] md:inline ' + (night ? 'text-clay/45' : 'text-ink-3')} style={{ boxShadow: 'inset 0 0 0 1px currentColor' }}>
          Ctrl K
        </kbd>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className={'absolute left-0 top-full mt-1 w-[300px] py-1 ' + (night ? 'bg-night-2 text-clay' : 'bg-clay text-ink')}
            style={{ boxShadow: '0 18px 40px -16px rgba(20,20,20,0.45), inset 0 0 0 1px rgba(28,34,38,0.25)' }}
          >
            {SURFACES.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className={
                    'grid grid-cols-[18px_1fr] gap-2 px-3 py-2 no-underline ' + (night ? 'hover:bg-night' : 'hover:bg-clay-deep') + (s.href === loc ? ' font-semibold' : '')
                  }
                >
                  <span className={'figures text-[11px] ' + (night ? 'text-clay/50' : 'text-ink-3')}>{s.key}</span>
                  <span>
                    <span className="block text-[13px]">{s.label}</span>
                    <span className={'block text-[11px] font-normal ' + (night ? 'text-clay/55' : 'text-ink-3')}>{s.what}</span>
                  </span>
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
