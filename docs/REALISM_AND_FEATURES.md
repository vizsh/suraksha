# Realism plan and feature ideas

Written 2026-11-26, after Phase 5. Nothing here is built yet. The first part is how to make the 3D views read as Powai rather than a model of it; the second is features that would make the product more useful on real Mumbai roads.

## Part 1: realism

### What gives it away today

Looked at in the city twin, the cockpit and film mode, at day, dusk and night:

| Where | What looks fake | Why |
|---|---|---|
| Trees | Faceted green balls on sticks; the landing story's low camera shows it most | Three icosahedrons per crown, one shape for every tree |
| People | Everyone is the same figure (CesiumMan) in a different tint; they never stop, wait or look | One rigged model with one walk clip |
| Buildings | Clean extruded boxes with a window pattern; no roofs, balconies, grilles or monsoon staining | OSM footprints extruded to one height, one facade shader |
| Roads | Even asphalt with perfect paint; no zebra crossings, patches, manholes or black-and-yellow kerbs | One tiling texture, paint only on the main corridor |
| Street furniture | No traffic signals or bus shelters, though the map data has 12 signals and 32 bus stops | Points are loaded but only used for the risk field |
| Ground | Satellite imagery is sharp from above but smears at street level | 0.6 m imagery stretched over the ground plane |
| Powai lake | Drawn as satellite colour, not water | OSM water polygons are not fetched |
| Traffic | Cars glide at constant lane offsets; no brake lights, indicators or queues at signals | Scripted arc-length motion |
| Air | Mumbai's humid haze and dusk glow are missing; night is clean and dark | Distance fog only |

Fixed in this pass: pedestrians walked backwards. The crossing pedestrian was rotated the wrong way (heading + 90° instead of heading − 90°), and every walker's stride ran at the wrong speed for its ground speed, so feet skated. The walk cycle now plays at ground speed ÷ 0.83 m/s (measured from the model's planted foot), and the pedestrian stands still while waiting instead of walking in place.

### The plan, in order of payoff per day of work

Each item keeps the current budget: the twin holds 55+ fps and under 1.5 s of blocking time on the production build. Everything repeated is instanced, and anything large has a distance cut-off.

**Status (2026-11-27):** the first slice is built: items 1, 2 and 3, the zebra crossings and stop lines from item 4, and brake lights from item 9. It is all procedural, with no new downloads. What changed:

- **People:** the CesiumMan model is kept, but its texture (Cesium's logo and suit) is replaced by clothes coloured by body region: skin, shirt, trousers, shoes and hair, with Indian skin tones. The crossing pedestrian looks right, then left, before stepping out. People wait at the bus shelters near the story and glance up the road. Still to do: a second rigged model for body and clothing variety (for example the CC0 Quaternius set, which needs a download).
- **Trees:** rain tree, gulmohar and ashoka, built from leaf cards with painted leaves, crown-shaped shading, alpha-cut shadows and wind sway. Trees keep clear of shelters and junctions.
- **Signals:** the 12 signal nodes merge into 3 junctions, 2 of them on JVLR. Each JVLR junction has a mast-arm signal over the lanes, a far-side pole, heads for the cross street, a stop line and a zebra crossing. The cycle is 24 s, offset so your car and the car ahead always meet green, which keeps the story's timing unchanged.
- **Traffic:** the background cars (now 64) run a car-following model computed once per world. They slow for the car ahead, stop and queue at red, pull away on green, and show brake lights. Tests check that none runs a red and none drives through another.
- **Bus shelters:** a BEST-style shelter at each of the 30 or so stops, with a red route sign and an advert panel lit at night.
- **Cost:** the twin still runs at 90+ fps; blocking time on load stays within the run-to-run range of the previous build.

**Status (2026-11-27, second slice):** built: the rest of items 4 and 5, plus items 7 and part of 6. Also all procedural, with no new downloads.

- **Powai lake as water (item 7):** the OSM extract has no water, so the lake is found in the satellite imagery already loaded. Water there is very dark (brightness 13 to 15) and smooth, unlike forest (about 30, textured). The mask is cleaned up and only large connected regions kept: it matches the lake and leaves out the water-hyacinth beds and islands. It takes about 130 ms, during loading. The surface reflects the sky, with moving ripples, and catches the sun at dusk.
- **Mumbai haze (item 5):** the shared fog code adds a humid haze that builds with distance and thins with height, on the wide city views only. Dusk fog is warmer. Still to do: sun position from `suncalc`, and sodium versus LED street lamps.
- **Road wear (item 4):** asphalt patches, tar seams, manhole covers and oil stains along JVLR, and black-and-yellow kerb paint on the main roads. Still to do: puddles.
- **Rooftops (part of item 6):** black water tanks on stands, AC units, and stair rooms on taller blocks. Still to do: balconies, window grilles and monsoon staining.
- **Cost:** load time and frame rate are unchanged within run-to-run noise.

**Tier 1: biggest difference, lowest risk (about 1 week)**

1. **People that behave like people.**
   - **Models:** swap CesiumMan for a small CC0 set of rigged figures with walk, idle and look-around clips (Quaternius Universal Animation Library), with 4 to 6 body and clothing variants.
   - **Behaviour:** the crossing pedestrian waits at the kerb, looks right then left, and steps out. A few people wait at bus stops.
   - **Cost:** one glTF of about 2 MB, shared skeleton, and animation updates only within 250 m of the camera.
2. **Trees that read as trees.**
   - **Models:** replace the icosahedron crowns with two or three CC0 tree models (Indian roadside canopy: rain tree, gulmohar, ashoka), using alpha-cut leaf cards and a wind sway in the vertex shader.
   - **Distance:** beyond 300 m, swap to a single billboard impostor.
   - **Cost:** instanced; about the same triangle count as now.
3. **Signals and bus shelters from the data we already have.**
   - **Signals:** a CC0 or procedural signal head at each of the 12 signals, lit at night, cycling red and green. Cars queue on red; this also gives the twin a reason for braking.
   - **Bus stops:** a BEST-style shelter at each of the 32 stops.
4. **Road detail where the camera goes.**
   - **Markings:** zebra crossings at signals (fetch OSM `highway=crossing`), black-and-yellow kerb paint, road studs, a stop line.
   - **Wear:** patches, tar seams, manhole covers and oil stains, as decals scattered with a fixed seed.
   - **Wet roads:** puddles from a noise mask on the existing wet-road material.
5. **Mumbai air.**
   - **Haze:** height-based humid haze (thicker near the ground and over the lake) in place of plain distance fog.
   - **Dusk:** a warm sky band.
   - **Night:** sodium-orange old lamps mixed with white LEDs, and bloom on headlights.
   - **Sun:** position from `suncalc` at Powai's real latitude, so the "Live Powai" light matches the real sky.

**Tier 2: makes the city convincing (about 1 to 2 weeks)**

6. **Buildings with Mumbai details.**
   - **Heights:** use OSM `building:levels` where tagged; give Hiranandani towers a podium and tower.
   - **Roof clutter:** black water tanks (the single most recognisable Mumbai roofline detail), AC units and stair rooms, all instanced from 3 or 4 small models.
   - **Facades:** balconies and window grilles in the facade shader, plus monsoon streaking and grime as a triplanar mask by height.
7. **Powai lake as water.** Fetch OSM `natural=water`, add a water surface with sky reflection, ripples and a shoreline foam band. Night shows lamp reflections.
8. **Ground that holds up at street level.** Blend detail textures (grass, soil, paving) under the satellite image by its colour, so close views get texture without losing the real layout.
9. **Traffic that drives.**
   - **Lights:** brake lights glow when a car slows; indicators flash before a lane change or swerve; headlight pools on the road at night.
   - **Motion:** wheels spin, and buses stop at shelters.
   - **Two-wheelers:** they filter between lanes, as they do here.

**Tier 3: the photoreal ceiling (optional, about 1 to 2 weeks, higher risk)**

10. **Photoreal day view by default.** Google Photorealistic 3D Tiles already work when a key is set. Make them the default for the daytime twin and landing hero, with our layers on top, and keep the clay sheet as a style toggle.
11. **A Gaussian-splat street.** Capture 200 m of JVLR with a phone walk (open pipeline: nerfstudio or gsplat) and render it in the cockpit with `@mkkellogg/gaussian-splats-3d`. This is roadmap item B1.
12. **Film-mode camera polish:**
    - depth of field on the subject of each shot;
    - light motion blur;
    - film grain and a vignette;
    - temporal anti-aliasing for clean edges in recordings.

**Suggested first slice:** items 1, 2 and 3 together. People, trees and signals are what the eye checks first at street level, and they fix the landing story's close-up frames.

## Part 2: features worth adding

Ranked by how much they would help on real roads in Mumbai. The first five fit the existing engine with little new machinery.

| # | Feature | Why it matters here | How, with what we have |
|---|---|---|---|
| F1 | **Two-wheeler mode** | Two-wheeler riders are the largest group of road deaths in India | Phone on the handlebar or in a pocket: audio-first alerts with no screen reading, a larger radius, harsh-brake and pothole IMU reports tuned for bikes |
| F2 | **Lane advice, not just warnings** | "Pothole ahead" makes people brake; "keep right, pothole in lane 2 in 300 m" lets them plan | Threats already carry lanes; add a lane-change suggestion and a safe-speed hint to the HUD and in-dash screen |
| F3 | **Emergency vehicle corridor** | Ambulances lose minutes on JVLR | An ambulance's phone broadcasts its route; cars ahead get "move left, ambulance in 400 m"; ops sees its ETA |
| F4 | **Work-zone protection** | Repair crews stand in live lanes | When a work order opens, the crew site becomes a temporary threat with a geofence and a slow-down warning until the crew marks it closed (pass-by verification then confirms the lane is clear) |
| F5 | **Waterlogging depth from the dashcam** | "Waterlogged" is not enough: is it 5 cm or 40 cm? | Estimate depth from kerb and wheel immersion in the camera frame; route around anything deeper than a car's safe wading depth |
| F6 | **Standard V2X message export** | Makes us interoperable with real C-V2X roadside units and OEMs | Map each fused threat to SAE J2735 TIM and ETSI DENM messages; a small exporter on the ops console |
| F7 | **Black-spot report with before-and-after** | The city needs proof that a fix worked | A monthly report per segment: near-miss rate, threats, repairs, and the change after an intervention such as a speed breaker or a new signal |
| F8 | **Report status for citizens** | People stop reporting when they never hear back | A public page per report: received, confirmed by N cars, crew assigned, repaired, verified by passing cars |
| F9 | **Spoof and spam resistance** | A crowd network gets gamed | Device attestation, GPS plausibility checks (speed, jumps), per-account rate limits, and reputation from A4 |
| F10 | **Multilingual voice alerts** | Many drivers in Mumbai prefer Hindi or Marathi | Recorded or synthesised alert phrases per language, with the directional chimes we already have |
| F11 | **Incident reconstruction** | Police and insurers need the minute before a crash | Replay the fused picture around a time and place from stored observations. Positions and threats only, with no faces or plates |
| F12 | **Measured accuracy** | Judges and cities will ask "how often is it right?" | A test harness that runs hundreds of generated scenarios through the engine and reports precision, recall and time to confirmation. Shown on the landing page |

**Suggested next build:**
- **F2 (lane advice):** small, and it changes how the cockpit feels.
- **F12 (measured accuracy):** makes every claim in the pitch defensible.
- **F1 (two-wheeler mode):** the strongest story for India.
