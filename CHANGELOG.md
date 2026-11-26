# Changelog

## Walking fix and next plans (2026-11-26)

- **Pedestrians no longer walk backwards.** The pedestrian crossing behind the bus faced the wrong way (rotated +90° instead of −90° from the road), and every walker's stride ran at the wrong speed, so feet skated. The walk cycle now runs at ground speed ÷ 0.83 m/s, measured from the model's planted foot, and the crossing pedestrian stands still while waiting at the kerb instead of walking in place.
- **Plan:** [docs/REALISM_AND_FEATURES.md](docs/REALISM_AND_FEATURES.md) lists what makes the 3D look fake today and a tiered plan to fix it, plus twelve features ranked for Mumbai roads.

## Phase 5: pass-by verification, LiDAR and film mode (2026-11-26)

- **Pass-by verification (A3):** a car or phone that drives past a known hazard and sees an empty lane sends a "saw nothing" observation. Distinct passers are counted since the last sighting; a new sighting resets the count, and a reporter cannot clear their own report. In the scripted night a fallen branch reported this evening starts confirmed and is cleared by three passing cars. The twin shows a blue sweep for each pass and a "cleared by N passing cars" label; the ops console keeps cleared threats listed and marks each passer "saw nothing"; the phone app has a "Not there now" vote; the dashcam votes automatically when it passes a hazard with a real GPS fix and its road check reads clear.
- **LiDAR point-cloud mode (B5):** a LiDAR toggle on the city twin (and in the command palette) redraws the city as the point cloud a roof scanner returns: walls, roofs, carriageways, footpaths, lane paint, trees and open ground sampled into points once per world, coloured by kind and height. A scan line sweeps around your car, the road shows the concentric rings a spinning sensor leaves, the X-ray wave passes through the points, and the rest of the city sits dimmer as the map the fleet remembers. It switches on in about 0.3 s and holds frame rate on the production build.
- **Film mode (B3):** a "Film mode" button on the city twin (and in the command palette) plays a six-shot flythrough of the 48 s story for screen recording: establishing shot, the fallen branch cleared by passing cars, the barricade confirmed by a resident, swerves and a dashcam, the pedestrian behind the bus from behind your car, the shared picture from above, and a closing pull-out. Shots are cut to the story's own beats, with letterbox bars, captions, a timecode and a dip to black on every cut; all other controls are hidden and the cursor hides when idle. Works in LiDAR mode and at any time of day. Esc leaves. (Named film mode because `/director` is already the demo clock.)

## Frontend audit and polish (2026-11-26)

Every surface was captured at 1600x900, 1280x720 and 390x844 (phone), checked for overflow, clipping, overlapping panels and console errors, and fixed:

- **City twin on phones:** view and layer controls are single rows that scroll sideways and fade at the edge, instead of wrapping into each other.
- **Ops console on phones:** map above, console below; the map header no longer crowds itself.
- **Cockpit:** the driver monitor collapses to one line on phones (the webcam keeps running when collapsed).
- **In-dash screen:** long alerts wrap inside a rounded panel and push the road-ahead rail down instead of colliding with it. Portrait phones get a "turn sideways" hint.
- **Phone app on laptops:** the device frame fits the window height, so its tab bar is always visible.
- **Dashcam AI on phones:** the intro card has room for both buttons; the road-ahead zone appears only once there is a picture.
- **Landing:** no 3D labels over the headline (hero shot and phone-width frames); the in-dash showcase no longer widens the page on phones; the nav's page name gives way to the launch button on narrow phones.
- **Resilience:** Open-Meteo answers are cached in the browser (weather 10 min, rain forecast 30 min, elevation 30 days), with a stale answer used if the service rate-limits; satellite tiles retry once.

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
