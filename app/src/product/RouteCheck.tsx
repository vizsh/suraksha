import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ShieldCheckIcon } from '@phosphor-icons/react'
import type { World } from '../world/scenario'
import { useSim } from '../world/store'
import { compareRoutes, PLACES, type ScoredRoute } from '../sense/route'
import { fromLatLon } from '../world/corridor'
import { MiniMap, STATE, StateGlyph } from './bits'

/** Compare real routes by risk, not only time. */
export function RouteCheck({ world }: { world: World }) {
  const [routes, setRoutes] = useState<ScoredRoute[] | null>(null)
  const [error, setError] = useState(false)
  const [run, setRun] = useState(0)
  useEffect(() => {
    let live = true
    setError(false)
    compareRoutes(world, useSim.getState().threats)
      .then((r) => live && setRoutes(r))
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [world, run])

  const [cx, cz, R] = useMemo(() => {
    const a = fromLatLon(world.data, PLACES[0].lat, PLACES[0].lon)
    const b = fromLatLon(world.data, PLACES[1].lat, PLACES[1].lon)
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) * 0.75 + 120]
  }, [world])

  const best = routes?.[0]
  const fastest = routes ? [...routes].sort((a, b) => a.minutes - b.minutes)[0] : null
  return (
    <section className="mt-5 border-t border-rule pt-4">
      <div className="flex items-center gap-2 text-[15px] font-semibold" style={{ fontVariationSettings: "'wdth' 108" }}>
        <ShieldCheckIcon size={17} />
        Safer route
      </div>
      <p className="mt-1 text-[12px] text-ink-2">
        {PLACES[0].name} to {PLACES[1].name}. Real routes from OSRM, scored by the risk model and live threats.
      </p>
      <div className="relative mt-3 aspect-square overflow-hidden">
        <MiniMap world={world} center={[cx, cz]} radius={R} route={false} className="absolute inset-0 h-full w-full" />
        <svg viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
          {routes &&
            [...routes].reverse().map((r) => (
              <motion.path
                key={r.id}
                d={'M' + r.pts.map(([x, z]) => `${(x - cx).toFixed(1)},${(z - cz).toFixed(1)}`).join('L')}
                fill="none"
                stroke={r === best ? '#1f6fb2' : '#8a8f8c'}
                strokeWidth={R / (r === best ? 55 : 80)}
                strokeDasharray={r === best ? undefined : `${R / 40} ${R / 60}`}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
        </svg>
      </div>
      {error && (
        <button onClick={() => setRun((n) => n + 1)} className="mt-2 text-[12px] text-confirmed-text underline">
          Routing service unavailable. Try again.
        </button>
      )}
      {!routes && !error && <p className="mt-2 text-[12px] text-ink-3">Asking OSRM for routes...</p>}
      <ul className="mt-2 divide-y divide-rule/70">
        {routes?.map((r) => (
          <li key={r.id} className="py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-[3px] w-5" style={{ background: r === best ? '#1f6fb2' : '#8a8f8c' }} />
              <span className="flex-1 text-[14px] font-medium">{r.name}</span>
              {r === best && <span className="bg-live px-1.5 py-0.5 text-[10px] font-semibold text-clay">Safer</span>}
              {r === fastest && r !== best && <span className="text-[10px] text-ink-3">Fastest</span>}
            </div>
            <div className="figures mt-1 text-[11px] text-ink-3">
              {r.minutes.toFixed(0)} min, {r.km.toFixed(1)} km, risk {r.risk.toFixed(0)}/km
            </div>
            {r.hits.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {r.hits.slice(0, 3).map((h) => (
                  <li key={h.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: STATE[h.state].text }}>
                    <StateGlyph state={h.state} size={10} />
                    {h.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
