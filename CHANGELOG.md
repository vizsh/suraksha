# Changelog

## Scenarios, gaze-aware driver monitor, dashcam playback, in-dash and phone redesign (2026-11-27)

- **Five scenarios on three real roads**, chosen from a chip on every surface or the command palette, shared across linked devices: night on JVLR (the original story), monsoon on Adi Shankaracharya Marg (water hiding an open manhole), a school morning on Orchard Avenue (children behind a school bus), late night on JVLR (cattle and a wrong-way rider), and a rush-hour crash on Adi Shankaracharya Marg (lane closed and reopened by the city). Each sets the road, hour, rain, traffic, what stands on the road, lane advice, story moments and film shots. New on the road: stalled cars with flashing hazards, cows (standing and lying), a wrong-way motorcycle, children, standing floodwater, an open manhole, an unpainted speed breaker and crash debris. Background traffic now handles two-way roads and queues behind a closed lane. Tests check every scenario: your car never passes through anything, and every hazard is confirmed by the engine from its own evidence. Ideas for more: [docs/SCENARIOS.md](docs/SCENARIOS.md).
- **Driver monitor that knows where you are looking:** gaze is head pose plus eye direction (iris position and eye-look scores), against a short calibration while you look at the road. A head turned toward a mirror with the eyes back on the road counts as attentive; a level head with the eyes down at a phone does not. Glances under 2 s are normal; 2 s or more warns ("Eyes on the road"), with a separate "Eyes up" for looking down, an urgent chime at 4 s and a warning on the windshield. The panel shows the face read back (eye outlines, irises, head and gaze lines), a windshield gauge of where the eyes land, a 30 s timeline, and head and eye angles. The gaze math is unit-tested.
- **Dashcam playback controls** for video files: play, pause, ±10 s, a scrubber, speeds from 0.5× to 16×, and a tick on the timeline for every report the video produced (select one to jump just before it). Consistency checks and cooldowns count video time, so they mean the same at any speed. Real footage to test with: [docs/TEST_VIDEOS.md](docs/TEST_VIDEOS.md).
- **In-dash screen redesigned:** a status bar (India time, weather, mesh link); 3D navigation following your car with the route glowing ahead, a next-instruction card and arrival time; a driver-assist lane view where every car, person, animal and hazard sits in its real lane at its real distance, with brake lights and the advised lane; and a cluster with a speed arc, the road's speed limit, the driver monitor's state and what the network knows.
- **Phone app redesigned:** a titanium device frame with Dynamic Island and live status bar on desktops (full screen on phones), a live 3D map with a floating alert card and speed, card-based Road Ahead, Map, Report and You tabs, and a floating glass tab bar.
- **Cockpit follows the scenario's hour** (day, dusk or night, with rain), and the engine now lets a swerve cluster merge with an animal in the road, not only with static obstacles.

## Realism, second slice (2026-11-27)

- **Powai lake is water:** found in the satellite imagery (very dark and smooth, unlike forest), cleaned up to the lake itself, and drawn as a reflective surface with moving ripples that catches the sun at dusk. No extra download.
- **Mumbai haze:** humid haze over the wide city views that builds with distance and thins with height, so towers stand out above it. Dusk is warmer.
- **Road wear:** asphalt patches, tar seams, manhole covers and oil stains along JVLR; black-and-yellow kerb paint on the main roads.
- **Rooftops:** black water tanks on stands, AC units, and stair rooms on taller blocks.

## Realism, first slice (2026-11-27)

- **People in clothes:** the walking figure's texture carried Cesium's logo and suit; walkers are now drawn in clothes, with skin, shirt, trousers, shoes and hair coloured by body region. The pedestrian behind the bus looks right, then left, at the kerb before crossing. People wait at the bus shelters near the story and glance up the road.
- **Trees:** rain tree, gulmohar and ashoka replace the faceted balls, built from leaf cards with painted leaves, soft crown shading, alpha-cut shadows and a light wind sway.
- **Traffic signals:** working signals at the map's junctions, with a mast arm over the JVLR lanes, cross-street heads, a stop line and a zebra crossing. The cycle is timed so the scripted cars always meet green and the story is unchanged.
- **Traffic that obeys them:** background cars (now 64) follow the car ahead, stop and queue at red, pull away on green, and light their brake lights. Your car and the car ahead show brake lights when they slow. Tests cover signal timing, red lights and spacing (47 tests).
- **Bus shelters:** at the map's bus stops, with the red route sign and an advert panel lit at night.
- **Development:** in dev builds, `window.__twin` exposes the twin's camera controls, for visual checks from the console.

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
