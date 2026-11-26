import { useSim } from '../world/store'
import { WebConsole } from '../product/WebConsole'
import { SurfaceNav } from '../app/SurfaceNav'

/** The city operations console, full screen. */
export default function Ops() {
  const world = useSim((s) => s.world)!
  return (
    <main className="flex h-[100dvh] flex-col bg-clay text-ink">
      <header className="flex h-14 shrink-0 items-center border-b border-rule pl-4 pr-5">
        <SurfaceNav inline />
        <span className="flex-1" />
        <span className="hidden text-[12px] text-ink-3 sm:inline">City operations, ward S (demo account)</span>
      </header>
      <div className="min-h-0 flex-1">
        <WebConsole world={world} stack />
      </div>
    </main>
  )
}
