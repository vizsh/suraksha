# Changelog

## Performance pass (2026-11-26)

Measured on the production build (headless Chrome, 1600x900): total blocking time on the landing page fell from 9.6 s to 2.6 s, the cockpit from 6.4 s to 0.9 s, ops from 4.2 s to 1.2 s.

- **Shaders compile before the first frame, in parallel.** Each 3D view waits for its sky, textures, models and satellite imagery, then compiles every material (and every post-processing pass, for both buffer and screen output) with `KHR_parallel_shader_compile`, and fades in when ready. Before, three.js compiled roughly 40 programs one by one on the first frame, freezing the page for seconds.
- **Two hidden recompiles removed:** soft shadows are now set to PCF explicitly (three r187 silently swapped the shadow type on the first frame, invalidating every program), and shader-log checks run only in development.
- **Less to download and build:** the first download fell from 654 KB to 146 KB gzip (3D, Google tiles and the palette's 3D import split out); views are created only when they near the screen; the pixel ratio adapts to the frame rate; city geometry, trees, lamps and a road spatial index are cached; night views use half-resolution satellite imagery; the night sky HDRI is 1K.
- **Fewer re-renders:** threat markers re-render only when a threat's state changes; the cockpit's see-through inset is kept mounted instead of rebuilt each loop.
- **Cockpit layout:** the driver monitor moved left so it no longer covers the see-through view.
- **Plan kept for later:** [docs/LIVE_DRIVE.md](docs/LIVE_DRIVE.md), running the system in a real car.

## Phase 4: on-device hazard detection (2026-11-26)

- **Dashcam AI** at `/dashcam` (key 7, and from the phone app's Drive tab): the phone camera, or any dashcam video or photo, becomes a connected-car sensor.
- **Two on-device models:** MediaPipe EfficientDet-Lite0 for people and animals every frame, and a CLIP ViT-B/32 vision encoder (transformers.js, WebGPU with WASM fallback) that checks the road ahead for potholes, barricades, cones and waterlogging every 1.5 s. Class embeddings are precomputed, so phones download only the 89 MB vision encoder, once.
- **A strict gate:** road-ahead zone, 3 sightings in 2 s for objects; 55 percent, a 25-point lead over "clear road" and 3 checks in a row for road surfaces; 10 s cooldown. Reports are map-matched to a lane and fused by the engine like any dashcam.
- **Live instrument panel:** detection brackets, the road-ahead zone, live class probabilities, and each report's engine verdict.
- **Tests:** gate and zero-shot classification (34 tests in total). See [docs/DETECTION.md](docs/DETECTION.md), including honest accuracy limits.

## Phase 3: split view and offline (2026-11-26)

- **One car vs the network:** the same night moment from the driver's seat rendered twice with a draggable divider. Left shows only what the car's own cameras know; right shows the fused network, with the pedestrian drawn through the bus. Jump buttons pause on the moments that matter.
- **Installable, offline-ready phone app:** web app manifest and icons; a service worker keeps `/app` working with no connection (verified: the production build reloads offline and still shows Road Ahead).
- **Report outbox:** events made while offline are kept and sent when the connection returns; the phone says how many are waiting. Sync reconnects on its own.

## Phase 2: real-use features (2026-11-26)

- **Monsoon early warning:** the next 6 hours of rain (Open-Meteo) over the corridor's lowest named road points (Copernicus elevation via Open-Meteo). From 8 mm in 6 hours, predicted waterlogging threats appear on every surface and in drivers' feeds before any water is on the road. Ops has a Monsoon tab with the forecast, the low points and a clearly labelled cloudburst rehearsal.
- **Safer route:** the phone app compares real OSRM routes from IIT Bombay to Hiranandani by risk per km, not only time, and names the hazards on each.
- **Map matching:** phone bumps and citizen reports snap onto the nearest carriageway, and onto a lane centre on JVLR, before fusion.
- **Export for the city:** GeoJSON and CSV of live threats and work orders, with latitude and longitude.
- **Tests:** coordinate round-trip and map matching (25 tests in total).

## Phase 1: atmosphere and command (2026-11-26)

- **Time of day on the city twin:** day, dusk and night with a moving sun, night sky HDRI, street lamps, lit windows and light pools.
- **Live Powai:** one click sets time and rain from the real Open-Meteo weather in Powai.
- **Monsoon rain:** GPU rain streaks that follow the camera, and wet, reflective asphalt.
- **Near-miss heat:** 30 days of harsh-braking events binned into hexagon columns that rise over the satellite map (synthetic, labelled).
- **Command palette:** Ctrl/Cmd + K to jump to any surface, fly to any threat, seek to a story moment, or flip any layer.
- **Directional chimes:** cockpit alert tones pan toward the side of the road the threat is on.

## Initial release (2026-11-26)

Threat Intelligence Engine with tests, seven surfaces on a shared clock, realistic 3D Powai, Fusion Lab, scroll story landing page, Vercel config and docs.
