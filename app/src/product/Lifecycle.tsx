import type { ThreatState } from '../engine/types'
import type { World } from '../world/scenario'
import { threatForObservation, useSim } from '../world/store'
import { MiniMap, STATE } from './bits'

const PLATES: { state: ThreatState; when: string; line: string }[] = [
  { state: 'noticed', when: '11:02 pm', line: 'One photo from a new account. Drivers hear "possible".' },
  { state: 'potential', when: '11:04 pm', line: 'Three cars swerve within 15 m. Evidence from a second, independent source.' },
  { state: 'confirmed', when: '11:06 pm', line: 'A dashcam names it. Lane 1 warning goes out.' },
  { state: 'resolved', when: '8:40 am', line: 'A crew clears it, or passing cars stop seeing it.' },
]
const ORDER: ThreatState[] = ['noticed', 'potential', 'confirmed', 'resolved']

/** Same area, same scale, four moments: how one report becomes a confirmed threat. The live plate follows the engine. */
export function LifecyclePlates({ world }: { world: World }) {
  const threats = useSim((s) => s.threats)
  const th = threatForObservation(threats, 'script:barricade-citizen')
  const now = th?.state
  const reached = now ? ORDER.indexOf(now) : -1
  const def = world.script.find((o) => o.key === 'barricade-citizen')!
  const [cx, cz] = def.pos
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
      {PLATES.map((p, i) => {
        const active = now === p.state
        const c = STATE[p.state].color
        return (
          <figure key={p.state} className="flex flex-col">
            <div className={'relative aspect-square overflow-hidden transition-[filter,opacity] duration-500 ' + (i > reached ? 'opacity-55 grayscale' : '')}>
              <MiniMap world={world} center={[cx, cz]} radius={70} route={false} className="absolute inset-0 h-full w-full" />
              <svg viewBox="-70 -70 140 140" className="absolute inset-0 h-full w-full">
                {i >= 1 &&
                  i < 3 &&
                  [-2, 4, 10].map((d, k) => (
                    <path key={k} d={`M${12 + d} 60 c 0 -30 ${-14} -30 ${-12} -48 s 6 -24 4 -40`} fill="none" stroke="#1f6fb2" strokeWidth={1.1} opacity={0.75} />
                  ))}
                {p.state === 'confirmed' && <path d="M-7 -6h14L0 7z" fill={c} />}
                {(p.state === 'noticed' || p.state === 'potential') && (
                  <circle r={p.state === 'noticed' ? 5 : 8} fill="none" stroke={c} strokeWidth={1.8} strokeDasharray="3 2" />
                )}
                {p.state === 'resolved' && <path d="M-7 -6h14L0 7z" fill="none" stroke={c} strokeWidth={1.4} />}
              </svg>
              {active && <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 2px ${c}` }} />}
            </div>
            <figcaption className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[16px] font-semibold" style={{ color: STATE[p.state].text, fontVariationSettings: "'wdth' 105" }}>
                  {STATE[p.state].word}
                </span>
                <span className="figures text-[11px] text-ink-3">{p.when}</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">{p.line}</p>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
