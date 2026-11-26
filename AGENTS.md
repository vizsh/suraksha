# Context for coding agents

SuRaksha Mesh: a virtual V2X road-safety prototype for the MSIL × IIT Bombay E-Summit Ideathon (finale 12 Dec 2026). Product truth lives in [PRODUCT.md](PRODUCT.md); architecture in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the engine in [docs/ENGINE.md](docs/ENGINE.md); the visual system in [docs/DESIGN.md](docs/DESIGN.md).

## Commands (run in `app/`)

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Engine tests | `npm test` |
| Typecheck | `npx tsc -p tsconfig.app.json --noEmit` |
| Production build | `npm run build` |
| Refresh OSM data | `npm run data` |
| Re-download assets | `node scripts/fetch-assets.mjs` |

## Rules

- **Threat states come from the engine.** Never hardcode "confirmed" in UI or scenario code; script sensor observations and let `fuse()` decide.
- **One clock.** Use `simTime()` / `engineNow()` from `world/clock.ts`. Only the landing page may use `setOverride`.
- **Engine changes need tests** in `src/engine/engine.test.ts`.
- **Visual rules** (docs/DESIGN.md): survey palette tokens from `src/index.css`, Mona Sans + Martian Mono (figures only), 2 px radius, state shown by glyph and word, no background grids, no neon glow, no em dashes or eyebrows in UI copy.
- **3D layers sit apart in depth:** ground at 0, roads 0.04 to 0.2 m with polygon offsets, base earth at -1.5 m. Aerial cameras keep a near plane of about 6 m.
- **Label synthetic data** wherever it is shown.
- **Assets** live in `app/public/assets` with credits in `CREDITS.txt`. Satellite imagery is fetched at runtime, never committed.
- Do not commit `.env*.local`, `public/mediapipe`, `public/draco` (copied at build).
