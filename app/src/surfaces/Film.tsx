// Film mode overlay on the city twin: letterbox bars, the shot's caption, a timecode, and a dip to
// black on every cut. Everything else on the page is hidden so the screen can be recorded as is.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SHOTS, shotAt, useFilm } from "../world/film";
import { LOOP, simTime } from "../world/clock";

const CUTS = [...SHOTS.map((s) => s.from), LOOP];
const BAR = "max(64px, calc((100dvh - 100vw / 2.39) / 2))";

export function FilmOverlay() {
  const stop = useFilm((s) => s.stop);
  const [beat, setBeat] = useState(() => shotAt(simTime()));
  const [idle, setIdle] = useState(false);
  const dip = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const last = useRef("");

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = simTime();
      const d = Math.min(...CUTS.map((c) => Math.abs(t - c)), t, LOOP - t);
      if (dip.current)
        dip.current.style.opacity = String(Math.max(0, 1 - d / 0.3));
      if (clock.current)
        clock.current.textContent = `00:${t.toFixed(1).padStart(4, "0")}`;
      const b = shotAt(t);
      const key = b.i + b.sub;
      if (key !== last.current) {
        last.current = key;
        setBeat(b);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 1800);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stop();
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", onKey);
    };
  }, [stop]);

  return (
    <div
      className={
        "pointer-events-none absolute inset-0 z-40 " +
        (idle ? "cursor-none" : "")
      }
      style={{ pointerEvents: idle ? "auto" : "none" }}
    >
      <div ref={dip} className="absolute inset-0 bg-[#050607] opacity-0" />
      <motion.div
        className="absolute inset-x-0 top-0 origin-top bg-[#050607]"
        style={{ height: BAR }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-full items-center justify-between px-5 md:px-8">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            Film mode
          </span>
          <button
            onClick={stop}
            className={
              "pointer-events-auto text-[12px] text-white/60 transition-opacity duration-500 hover:text-white " +
              (idle ? "opacity-0" : "opacity-100")
            }
          >
            Esc to leave
          </button>
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-x-0 bottom-0 origin-bottom bg-[#050607]"
        style={{ height: BAR }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-full items-center gap-6 px-5 md:px-8">
          <span className="figures hidden shrink-0 self-center text-[11px] text-white/40 sm:block">
            {String(beat.i + 1).padStart(2, "0")} /{" "}
            {String(SHOTS.length).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={beat.shot.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="truncate text-[clamp(17px,2vw,26px)] font-semibold leading-tight text-white"
                style={{ fontVariationSettings: "'wdth' 115" }}
              >
                {beat.shot.title}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={beat.sub}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="mt-1 truncate text-[clamp(12px,1.1vw,15px)] text-white/65"
              >
                {beat.sub}
              </motion.div>
            </AnimatePresence>
          </div>
          <span
            ref={clock}
            className="figures shrink-0 text-[11px] text-white/40"
          />
        </div>
      </motion.div>
    </div>
  );
}
