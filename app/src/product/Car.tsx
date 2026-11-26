import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DriverCanvas } from '../three/Canvases'
import { egoOffset, egoSpeed, type World } from '../world/scenario'
import { useSim } from '../world/store'
import { laneOf } from '../engine/relevance'
import { AlertCapsule, MapOverlay, MiniMap, RoadAheadRail, egoCenter } from './bits'

export const HUD_W = 1600
export const HUD_H = 686

/** Windshield head-up display over the driver's view, night sheet. Designed at 1600 by 686. */
export function Hud({ world }: { world: World }) {
  const t = useSim((s) => s.t)
  const threats = useSim((s) => s.threats)
  const ped = threats.find((th) => th.kind === 'pedestrian' && th.state !== 'resolved')
  const [insetUsed, setInsetUsed] = useState(false)
  useEffect(() => {
    if (ped && !insetUsed) setInsetUsed(true)
  }, [ped, insetUsed])
  const changing = t > 16.5 && t < 21
  const speed = Math.round(egoSpeed(world, t) * 3.6)
  const lane = laneOf(egoOffset(t))
  return (
    <div className="relative overflow-hidden bg-night" style={{ width: HUD_W, height: HUD_H }}>
      <DriverCanvas world={world} className="absolute inset-0" />
      {/* lane guidance drawn on the road plane toward lane 2 */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] w-full" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden>
        <motion.g animate={{ opacity: changing ? 1 : 0 }} transition={{ duration: 0.4 }}>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${430 + i * 70} ${330 - i * 70} l${70} ${-40} l${-10} ${50}`}
              fill="none"
              stroke="#7fb6e6"
              strokeWidth={10 - i * 2}
              strokeLinejoin="round"
              opacity={1 - i * 0.22}
            />
          ))}
        </motion.g>
      </svg>
      <div className="absolute left-1/2 top-[6%] -translate-x-1/2">
        <AlertCapsule night large />
      </div>
      <AnimatePresence>
        {changing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-[24%] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0d1113]/85 px-5 py-2.5 text-[20px] text-clay"
            style={{ boxShadow: 'inset 0 0 0 1.5px #1f6fb2' }}
          >
            Bus stopped in lane 1 ahead. Move to lane 2.
          </motion.div>
        )}
      </AnimatePresence>
      {/* kept mounted once shown: rebuilding a 3D view every loop caused a stutter */}
      {insetUsed && (
        <motion.figure
          initial={false}
          animate={{ opacity: ped ? 1 : 0, scale: ped ? 1 : 0.96 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-none absolute right-[3%] top-[6%] w-[30%] overflow-hidden"
          style={{ boxShadow: '0 0 0 1px rgba(231,227,217,0.35), 0 12px 30px rgba(0,0,0,0.45)' }}
          aria-hidden={!ped}
        >
          <div className="relative aspect-video">
            <DriverCanvas world={world} who="scout" className="absolute inset-0" />
          </div>
          <figcaption className="bg-[#0d1113]/90 px-3 py-2 text-[15px] text-clay/85">See-through: view from the car 72 m ahead</figcaption>
        </motion.figure>
      )}
      <div className="absolute bottom-[6%] left-[4%] text-clay">
        <div className="figures text-[56px] leading-none">{Math.max(0, speed)}</div>
        <div className="mt-1 text-[15px] text-clay/60">km/h, lane {lane}</div>
      </div>
      <div className="absolute bottom-[6%] right-[4%] w-[38%]">
        <RoadAheadRail night range={600} />
        <div className="mt-2 text-right text-[14px] text-clay/60">Road ahead, metres</div>
      </div>
    </div>
  )
}

/** 1920x720 in-dash screen: map, Road Ahead and the alert, glanceable at speed. Designed at native size. */
export function DashScreen({ world }: { world: World }) {
  const t = useSim((s) => s.t)
  const center = useMemo(() => egoCenter(world, Math.floor(t / 4) * 4), [world, t])
  return (
    <div className="grid h-[720px] w-[1920px] grid-cols-[820px_1fr_400px] bg-night text-clay">
      <div className="relative overflow-hidden">
        <MiniMap world={world} center={center} radius={330} night className="absolute inset-0 h-full w-full" />
        <MapOverlay world={world} center={center} radius={330} night />
      </div>
      <div className="flex flex-col gap-10 border-x border-night-rule px-14 py-12">
        <div className="min-h-[132px] shrink-0">
          <AlertCapsule night xl />
        </div>
        <div className="min-h-0 flex-1">
          <RoadAheadRail night vertical xl range={600} />
        </div>
      </div>
      <div className="flex flex-col justify-between px-12 py-14">
        <div>
          <div className="text-[22px] text-clay/65">Driver score</div>
          <div className="figures mt-2 text-[96px] leading-none">87</div>
          <div className="mt-3 text-[20px] leading-snug text-clay/65">Smooth braking, 3 reports this week</div>
        </div>
        <NetworkLine />
      </div>
    </div>
  )
}

function NetworkLine() {
  const feed = useSim((s) => s.feed)
  const n = feed.filter((f) => f.threat.state !== 'predicted').length
  return (
    <div>
      <div className="text-[22px] text-clay/65">On your route</div>
      <div className="mt-2 text-[28px]">{n === 0 ? 'Nothing reported' : `${n} report${n === 1 ? '' : 's'} ahead`}</div>
    </div>
  )
}
