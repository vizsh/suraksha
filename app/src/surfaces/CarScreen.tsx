import { useSim } from '../world/store'
import { Contained } from '../product/bits'
import { DashScreen } from '../product/Car'
import { SurfaceNav } from '../app/SurfaceNav'

/** The 1920 by 720 in-dash display, letterboxed to any screen. Open it on a tablet in landscape. */
export default function CarScreen() {
  const world = useSim((s) => s.world)!
  return (
    <main className="relative h-[100dvh] bg-[#0b0e10]">
      <Contained w={1920} h={720}>
        <DashScreen world={world} />
      </Contained>
      <SurfaceNav tone="night" />
      <p className="absolute inset-x-0 bottom-8 hidden px-8 text-center text-[13px] text-clay/55 portrait:block">
        A 1920 by 720 car display. Turn your phone sideways to see it larger.
      </p>
    </main>
  )
}
