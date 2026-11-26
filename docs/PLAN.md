# SuRaksha Mesh: prototype build plan

Ideathon: Maruti Suzuki Innovation × IIT Bombay E-Summit. Finale 12 Dec 2026 (7-minute pitch + demo, 5-minute Q&A).
Prototype goal: **look and feel of a real deployed product across every surface, covering every use case.** Model accuracy and a production backend come later. Everything runs on open data plus a scripted simulation, and is labelled honestly where it is simulated.

---

## 0. Design read

**Reading this as:** a multi-surface product demo for a jury and for operators: a live 3D road-safety twin, a lane-level corridor view, an in-car HUD and a phone app. The language is instrument-grade and spatial, realistic rather than neon. Built on Vite + React + R3F + deck.gl, with shadcn/React Bits/motion.dev parts restyled to one world.

| Surface | Mode | Variance | Motion | Density |
|---|---|---|---|---|
| Showcase page (deployed-product gallery) | Persuade | 8 | 7 | 3 |
| City twin + X-ray | Experience | 7 | 8 | 4 |
| Corridor BEV / ops console | Operate | 5 | 5 | 7 |
| Cockpit HUD / car screen | Operate (glanceable) | 3 | 4 | 2 |
| Phone app (driver + citizen) | Operate | 5 | 5 | 4 |

The visual world is **Live Survey Sheet** (your pick). Section 3 records it.

---

## 1. What we are building: one app, six surfaces, one shared world state

A single Vite app (`app/`) with routes. Every surface reads the same simulated world, so a threat that appears in the twin also appears in the BEV, on the HUD and on the phone, in the same second.

| Route | Surface | What it shows |
|---|---|---|
| `/` | **Showcase** | How the deployed product looks: web command centre, phone app and in-car screen, as live embedded previews of the real surfaces (no fake screenshots). Also the scroll story for the pitch. |
| `/twin` | **City twin (Level 1) + X-ray mode** | 3D clay/photoreal city of the Powai / IIT Bombay corridor, connected cars, communication arcs, hazard pulses, risk isolines, ghost pedestrians, sensor-wave X-ray. |
| `/corridor` | **Corridor BEV (Level 2)** | Lane-level top-down fused view: tracked boxes, trails, blocked lanes, sidewalk gaps, threat inspector with lifecycle plates and sources. |
| `/cockpit` | **Car HUD (Level 3)** | Dashcam video with AR HUD: lane arrows, Road Ahead strip, see-through inset, confidence-aware alerts, live webcam fatigue gauge. |
| `/car` | **In-dash infotainment (1920×720)** | The same product as a car-screen app: map, Road Ahead, alert sheet, driver score. |
| `/phone` | **Phone app** | Driver mode (Road Ahead, score, trips) and citizen mode (report flow, walking-safety map, report status). Open it on a real phone over LAN. |
| `/ops` | **City operations** | Ranked blackspot roster, work orders, fix verification, lane-health and sidewalk-gap reports, broadcast/dispatch actions. |
| `/director` | **Demo director** (hidden) | Scenario timeline, play/pause, jump to beat, keyboard cues for the pitch. |

### Cross-device sync (the "it's all connected" moment)
- One **scenario engine** (Zustand store + deterministic clock) runs in the director tab.
- State goes to every other tab with `BroadcastChannel` on the same laptop, and to the phone with a tiny WebSocket relay (`ws`, ~40 lines, run by `npm run relay`).
- Pitch setup: projector shows `/twin`, the laptop screen shows `/cockpit`, a judge holds a phone on `/phone`. Trigger "pedestrian behind bus" and all three react together.

---

## 2. The simulation engine (convincing, not accurate)

Lives in `src/sim/`. Pure TypeScript, no React, so every surface can consume it.

- **Road graph:** OSM ways for the corridor, converted to local metres (`proj` = equirectangular around the corridor centre). Lanes come from the `lanes` tag (fallback 2 per direction) and offset polylines.
- **Agents:** 40 to 80 cars, two-wheelers, autos, buses and pedestrians, following polylines with IDM-style car following (a simple speed/gap formula). This gives believable stop-and-go without a traffic simulator.
- **Perception:** each connected car has a sensor footprint (a 120° front cone plus a 40 m circle). An object is "seen" by a car when it is inside the footprint and not blocked. Blocking is a 2D ray test against bus and truck boxes and building footprints. This gives real occlusion, so the hidden pedestrian is genuinely hidden from car B and seen by car A.
- **Event messages:** shaped like ETSI DENM/CAM (`type`, `lane`, `pos`, `confidence`, `sourceId`, `ttl`). They go through an in-memory bus with a simulated 80–250 ms latency.
- **Threat Intelligence Engine:** the state machine NOTICED → POTENTIAL → CONFIRMED → RESOLVED/FADED, plus PREDICTED. It covers source reliability weights, confidence growth per independent report, exponential decay, and **implicit obstacle detection** (three or more swerve or brake events within 15 m become an "unknown obstacle").
- **Risk model:** each road segment gets a score from features: turn angle, free left, median gap, sidewalk present, crossing distance, lighting proxy, speed, schools nearby, plus synthetic crash history. The score is rasterised to a 10 m grid and turned into **isolines** with `d3-contour`. It is recomputed for time of day (scrubbable).
- **Relevance filter for drivers:** on route, in the same or adjacent lane, time to reach under 60 s, tier by severity × confidence × conditions.
- **Scenario scripts:** `src/sim/scenarios/*.json` is a timeline of beats, for example `{t: 42, do: "spawnStalledTruck", lane: 2}`. It is seeded, so every rehearsal plays identically.

Libraries: `@turf/turf` (geometry), `d3-contour`, `d3-scale`, `h3-js` (optional hex aggregation), `seedrandom`, `zustand`.

---

## 3. Visual world: Live Survey Sheet

**Idea:** road risk is terrain. Danger is surveyed the way the Survey of India draws ground: risk isolines (contour lines) terraced over a white clay massing model of the real Powai corridor, and threats set as survey benchmarks. It deliberately refuses the navy-and-neon smart-city dashboard with KPI tiles and background grids. That look is also what the inspiration docs suggested ("graphite base, fine grid lines"), so we borrow their content ideas but not that look.

| Token | Value | Job |
|---|---|---|
| Clay (ground, buildings) | `#E7E3D9`, buildings `#F1EEE7` | The physical model: matte, lit by a low sun |
| Graphite ink | `#1C2226`, secondary `#3D454A`, tertiary `#565E63` | Text and linework |
| Confirmed | `#E0401F` (text `#B3301A`) | Solid inverted-triangle benchmark |
| Potential / noticed | `#D19A1C` (text `#8A6208`) | Dashed ring |
| Live perception | `#1F6FB2` | Connected cars, sensor fans, the wave front |
| Predicted | `#6B4FA0` | Open double ring; risk isolines; synthetic data marker |
| Terrain ink | `#B4562B` | Sidewalk gaps (broken kerb line) |
| Night sheet | `#13181B` / `#1D2428` | Cockpit and in-dash screen: the same sheet inverted |

- **Type:** Mona Sans variable. Width carries hierarchy: wide 112 to 125 for titles, narrow 80 to 88 for dense labels. Martian Mono is used only for figures (distances, speeds, counts).
- **Shape:** 2 px radius everywhere; full pill only for the in-car alert capsule; phone hardware keeps its own radius.
- **Light:** comes from the 3D scene (low raking sun, N8AO ambient occlusion, shadows). There are no CSS glows. Bloom is not used.
- **Signature interaction:** the X-ray sensor wave. A band sweeps out from the ego car. Inside the band, solid clay dissolves into a screen-door stipple with firm edge lines, so threats behind buildings show. Markers draw through geometry.
- **One plot per view:** the city sheet's only chart is the risk terrain itself.
- **Lifecycle as registered plates:** four plates of the same 140 m at the same scale.
- **Irreversible actions isolated:** "Broadcast alert" sits alone at the right edge of the console footer.

### Anti-slop rules that bind every surface, whichever world wins
- **No background grid**, no dot grid, no crosshair decoration. Survey or measurement marks appear only where they measure something real, such as distance ticks on the Road Ahead rail or a scale bar.
- **No default fonts.** Not Inter, not Space Grotesk/Mono, not IBM Plex, not Geist-everywhere. The planned pair is **Mona Sans (variable width, 200–900)** for UI and display, plus **Martian Mono** for figures. Both are free and self-hosted with `@fontsource`. Width does the work: wide for sheet titles, condensed for dense labels.
- **No neon glow, no purple AI gradients, no glassmorphism on everything.** Light comes from the scene (sun, HDRI, emissive threat markers), not from CSS `box-shadow` glows.
- **No React Bits background components** (Aurora, Particles, Hyperspeed, Squares, DotGrid, Galaxy and the like). They are the instant AI tell.
- **Threat state is never colour alone:** each state also has a shape (benchmark △ confirmed, dashed ring potential, open contour predicted, solid dot live) and a label.
- **One radius system:** 2 px for instruments and panels, full pill only for the alert capsule in the car.
- **No em dashes in UI copy, no "Stage 1/2/3", no fake version footers, no section-number eyebrows.**
- Every animation answers "what does this communicate?" (state change, arrival of information, attention), otherwise it goes.

---

## 4. Rendering stack (all free and open source)

### City twin and X-ray (`/twin`): React Three Fiber
| Need | Tool | Notes |
|---|---|---|
| Scene | `three` r187, `@react-three/fiber` 9, `@react-three/drei` 10 | Installed. |
| Buildings | OSM footprints → `ExtrudeGeometry`, merged per tile (`BufferGeometryUtils.mergeGeometries`) | Height from `building:levels` × 3.2 m, with a seeded fallback. One draw call per tile. |
| Realistic lighting | `@react-three/postprocessing`: **N8AO** (ambient occlusion), SMAA, ToneMapping (Neutral) | Gives the "architectural model" depth. Built: AgX washed the clay out, so Neutral is used. |
| Environment light | Poly Haven HDRI (CC0, `kloofendal_overcast` or similar 2K) via drei `<Environment files>` | Soft daylight; a night HDRI for the cockpit inversion. |
| Shadows | drei `<AccumulativeShadows>` for static buildings, `<ContactShadows>` for cars | Baked once, so it's cheap. |
| Vehicles | **Kenney Car Kit** (CC0 glTF: sedan, hatchback, truck, bus, ambulance) as `InstancedMesh` per type | Realistic enough at city scale. Auto-rickshaw and two-wheeler from Kenney/Quaternius CC0 packs. |
| Pedestrians | Quaternius CC0 low-poly characters, or instanced capsules with walk-cycle bobbing | Ghost pedestrians use the same mesh with a fresnel shader. |
| Comm arcs | `MeshLine` or drei `<Line>` with a dash-offset animation along a quadratic Bézier | Arc speed equals message latency. |
| **Sensor wave / X-ray** | Custom `ShaderMaterial` on buildings and vehicles with a `uRevealCenter[]` and `uRevealRadius[]` uniform array | Inside a wave, surfaces go to fresnel-edge wireframe (drei `<Edges>` plus alpha falloff). Threat silhouettes render with `depthTest=false` in a second pass so they show *through* buildings. The ground scan ring is one plane shader. |
| Risk isolines | `d3-contour` → polylines → drei `<Line>` stacked at z = level × 0.6 m | Reads as risk terrain; the predicted colour lives here. |
| Camera choreography | drei `<CameraControls>` with scripted `setLookAt` transitions | City → corridor → cockpit is one continuous camera move. |
| Optional photoreal mode | **3d-tiles-renderer** (NASA-AMMOS, open source) + Google Photorealistic 3D Tiles | Needs your Google Maps API key; toggled with the "realism" switch. The clay model stays the default because it is free, fast and art-directable. |

### Corridor BEV (`/corridor`)
- The same R3F scene with an `OrthographicCamera` looking straight down. Continuity with the twin is the point.
- Lane paint from OSM lane offsets as instanced dashes; the drivable area as one mesh; boxes as instanced `BoxGeometry` with edge lines; trails as fading `<Line>` history buffers.
- Side panels in React (shadcn primitives restyled): threat inspector, lifecycle plates, source thumbnails.

### Cockpit (`/cockpit`) and in-dash car screen (`/car`)
- **Base layer:** real dashcam footage of the Powai corridor (see section 7). This gives instant realism a CG interior can't match.
- **AR layer:** a transparent R3F canvas whose camera intrinsics match the dashcam (≈ 70° horizontal FOV, mounted at 1.3 m). Lane arrows and the hazard benchmark are placed in 3D on the road plane and sync to the video timestamp.
- **See-through inset:** a second R3F view of the shared scene from the car ahead's pose.
- **Fatigue:** `@mediapipe/tasks-vision` Face Landmarker in the browser (Apache-2.0, WASM + GPU). It computes eye aspect ratio, PERCLOS over 30 s, yawn ratio and head pose, and drives a gauge plus an alert.
- **Alert capsule:** motion.dev `AnimatePresence` + `layout`; voice through the Web Speech API (`speechSynthesis`, en-IN voice).
- `/car` reuses the same components inside a 1920×720 landscape frame (typical wide in-dash screen) with larger touch targets.

### Phone (`/phone`)
- Mobile-first route that also runs inside a device frame on the showcase.
- MapLibre GL 6 with an **OpenFreeMap** vector style (free, no key, verified reachable), restyled to the chosen world.
- Citizen report flow: camera capture (`getUserMedia` / `<input capture>`) → classify (stub labels, or a small in-browser model later) → pin → status timeline.
- Driver mode: Road Ahead list, trip score, rewards.

### UI kit
- **shadcn/ui** (initialised, `radix-vega` style). Every primitive gets restyled to the world: radius, type, colour. Never shipped in default state.
- **React Bits** (registry `@react-bits` added; `SplitText` install verified). Planned picks, each with a job:
  - `VariableProximity`: sheet titles respond to the cursor using Mona Sans's width axis (showcase only).
  - `CountUp`: live counters (alerts delivered, hazards confirmed).
  - `AnimatedList`: live event feed in ops and twin.
  - `Stepper`: citizen report flow.
  - `ElasticSlider`: time-of-day risk scrubber.
  - `ScrollStack`: showcase walk-through of surfaces.
  - `DecryptedText`: a threat's label resolving as confirmations arrive (used once).
  - `Noise`: fixed film-grain overlay on the showcase only (pointer-events none).
- **motion.dev** (`motion/react`): layout transitions for lifecycle plates, alert enter and exit, springs on panels, `useScroll` for the showcase story. The motion.dev AI rules (`npx motion-ai`) are interactive, so you need to run it once in a terminal.
- **GSAP**: only inside React Bits components that need it (SplitText). It is never mixed with motion.dev in the same component.
- **Icons:** `@phosphor-icons/react` (installed), one weight project-wide.
- **Maps:** `maplibre-gl` 6, `deck.gl` 9.4 (installed) for 2D analytic layers on ops and phone (H3 hex, heatmap, paths).

---

## 5. Data plan: automated first

Scripts in `app/scripts/`, run with `npm run data`, write to `app/public/data/`. All were verified reachable from this machine on 26 Nov 2026.

| Data | Source | Key needed | Status |
|---|---|---|---|
| Roads (lanes, oneway, maxspeed, sidewalk), buildings (levels), crossings, signals, schools, hospitals, bus stops | **OSM Overpass** (mirrors: `maps.mail.ru`, `overpass.private.coffee`, with backoff; the main server was overloaded today) | No | ✅ 1,082 features in the IIT Bombay / Powai box (19.115–19.135 N, 72.895–72.925 E) |
| Basemap tiles | **OpenFreeMap** vector tiles | No | ✅ |
| Elevation (low spots for waterlogging) | **AWS Terrain Tiles** (Terrarium PNG) | No | ✅ |
| Weather: rain, visibility, fog | **Open-Meteo** forecast API | No | ✅ |
| Routing (driver route, ambulance route) | **OSRM** public demo server | No | ✅ |
| Crash and blackspot history | **Synthetic**, generated from road geometry and calibrated to published MoRTH category shares | No | Generated; labelled "synthetic" in the UI |
| State/national accident statistics | data.gov.in (OGD India) API | Free API key | Optional: you sign up |
| Street-level imagery (sidewalk gaps) | Mapillary API | Free token | Optional: you sign up |
| Photoreal 3D city | Google Photorealistic 3D Tiles | Google Maps API key (billing account) | Optional realism mode |
| 3D vehicles, people | Kenney Car Kit, Quaternius (CC0) | No | Download needs your OK |
| HDRI lighting | Poly Haven (CC0) | No | Download needs your OK |
| Face landmarks model | MediaPipe Face Landmarker `.task` (Apache-2.0) | No | Fetched at runtime from Google's CDN |
| Pothole and road-damage examples | RDD2022 dataset (CC BY-SA), public YOLO pothole weights | No | Stretch: run offline on a few frames to produce detection JSON |

Pipeline: `fetch-osm.mjs` → `osmtogeojson` → `build-roadgraph.mjs` (lanes, segments, turn angles, free-left detection) → `build-risk.mjs` (features + synthetic history → segment scores → grid → isolines) → `build-buildings.mjs` (footprints → height → tiled meshes as compact JSON). Re-run for any city by changing one bbox.

---

## 6. Use-case coverage matrix

| Use case | Twin | BEV | Cockpit/Car | Phone | Ops | Real or simulated |
|---|---|---|---|---|---|---|
| Collaborative BEV | overview | ● | inset | | | Simulated fusion over real OSM lanes |
| Lane health / faded markings | layer | ● | "unmarked lanes" advisory | | report | Simulated detections |
| Lane-level hazard routing | | ● | lane arrow ● | | | Simulated |
| Erratic vehicle broadcast | arc | ● | alert ● | | | Simulated; fatigue input is real webcam |
| See-through view | | | ● | | | Simulated scene view |
| Occluded pedestrian | X-ray ● | ● | alert ● | | | Real 2D occlusion test in sim |
| Pedestrian risk: dangerous turns, sidewalk gaps, unsafe turning points, high-risk segments | isolines ● | layer | predicted alert ● | walking route ● | roster ● | Features from real OSM geometry + synthetic history |
| Potholes, barricades, speed breakers, manholes, debris, cattle, waterlogging | ● | ● | ● | report ● | ● | Simulated; rain from real Open-Meteo |
| Implicit obstacle from swerve clusters | promotion animation ● | ● | | | | Simulated |
| Threat lifecycle and confidence | ● | plates ● | wording ● | status ● | ● | Simulated engine |
| Driver fatigue | | | gauge ● | | | **Real** (webcam, MediaPipe) |
| GLOSA and ambulance corridor | green ribbon ● | | ● | | | Simulated |
| Safety score and rewards | | | car screen ● | ● | | Simulated |
| Citizen reporting and Street Guardian | pins drop ● | | | ● | queue ● | Real camera capture, simulated backend |
| City work orders and fix verification | | | | | ● | Simulated |

---

## 7. Things only you can provide (everything else is automated)

1. **Approve asset downloads:** Kenney Car Kit (~5 MB, kenney.nl, CC0), Quaternius characters (~10 MB, CC0), one Poly Haven HDRI (~6 MB at 2K, CC0).
2. **Run the motion.dev AI setup once** in a terminal (it is interactive): `cd C:\IIT_Ideathon\app` then `npx motion-ai`.
3. **Dashcam clip (strongly recommended):** 2 to 3 minutes on JVLR / Saki Vihar Road near IIT Bombay. Phone on the dashboard, landscape, 1080p, daytime and one dusk clip. It becomes the cockpit's base layer. Without it we fall back to a rendered view of the twin.
4. **Optional keys:** Google Maps API key (photoreal 3D tiles), Mapillary token, data.gov.in API key. Put them in `app/.env.local`; nothing breaks without them.
5. **Verify the statistics** before they go on slides: 25,769 pedestrian deaths (MoRTH 2024) and the ~40% Maruti market-share line.
6. **Restart Claude Code** in `C:\IIT_Ideathon\app` once so the shadcn MCP server (`.mcp.json`) loads.

---

## 8. Build schedule (finalist window, about 2 to 11 Dec)

| Day | Deliverable |
|---|---|
| Before 30 Nov | Screening deck + showcase page + 60-second screen recording of the twin (enough for Round 1) |
| 2 Dec | Data scripts, road graph, clay city render with lighting and shadows |
| 3 Dec | Agents, perception and occlusion, event bus, threat engine with unit tests on the lifecycle |
| 4 Dec | Twin: arcs, pulses, isolines, **X-ray sensor wave** (signature) |
| 5 Dec | Corridor BEV + threat inspector + lifecycle plates |
| 6 Dec | Cockpit: dashcam sync, AR lane arrows, Road Ahead strip, see-through inset |
| 7 Dec | Fatigue (MediaPipe) + voice alerts. **Midpoint checkpoint (7–8 Dec)** |
| 8 Dec | Phone (driver + citizen) + `/car` screen + LAN relay |
| 9 Dec | Ops console, work orders, fix verification, director timeline |
| 10 Dec | Scenario polish, camera choreography, with/without replay, performance pass |
| 11 Dec | Rehearsals, backup screen recording of the whole demo, final deck |

Performance budget: 60 fps on a mid laptop GPU. Merged building tiles, instanced agents, post-processing at 0.75× DPR, `frameloop="demand"` on idle views.

---

## 9. Demo choreography (multi-screen)

- **Projector:** `/twin`. **Laptop:** `/cockpit`. **Judge's phone:** `/phone`. **Your second laptop or tablet:** `/director`.
- Beats follow the storyline already agreed: X-ray sweep, stalled truck, swerve-confirmed barricade, BEV lane change, see-through, predicted free-left with a ghost pedestrian, occluded pedestrian, ambulance corridor, webcam fatigue, city dashboard.
- A full-length screen recording is the backup if anything fails live.

---

## 10. Deployed-product concept visuals (built)

Run `npm --prefix app run dev` and open http://localhost:5174/. The showcase is live and everything on it is driven by one shared 48-second scenario on real OSM geometry of the Powai corridor (JVLR near IIT Bombay):

1. **Hero, city twin:** 3D clay model of 352 real buildings and 469 roads, connected cars, message arcs, the X-ray sensor wave (toggle top right), risk terraces, survey benchmarks.
2. **Web console:** live lane-level BEV following the ego car, threat list with confidence, source inspector, incoming-report feed, dispatch and broadcast actions.
3. **Car:** windshield HUD from the driver's seat (night sheet) with lane-change guidance, alert capsule, Road Ahead rail, speed and the see-through inset from the car ahead. Below it is the 1920×720 in-dash screen.
4. **Phones:** driver app (route map + Road Ahead) and citizen app (barricade report status, Street Guardian points).
5. **Lifecycle plates:** noticed → potential → confirmed → resolved, same 140 m at the same scale.
6. **Open-data honesty:** what is real versus simulated.

Code map: `app/src/world/` (data and scenario), `app/src/three/` (scene, shaders, canvases), `app/src/product/` (surfaces), `app/src/pages/Showcase.tsx`.

### Already set up in `app/`
- Vite 8 + React 19 + TS, Tailwind v4, shadcn (radix-vega) restyled to the survey palette, React Bits registry `@react-bits` (SplitText, VariableProximity, CountUp installed; VariableProximity patched to stop loading Google Fonts).
- `.mcp.json` with the shadcn MCP server (restart Claude Code in `app/` to load it).
- three, R3F, drei, postprocessing, deck.gl, maplibre-gl, motion, gsap, zustand, d3-contour, Phosphor icons, Mona Sans + Martian Mono (self-hosted).
- `scripts/fetch-osm.mjs`: automated Overpass fetch with mirror fallback, which writes `public/data/corridor.json`.

---

## 11. Build phases and status (updated 26 Nov 2026)

| Phase | What | Status |
|---|---|---|
| 0 | Ideation, plan, tooling, visual world, showcase | Done |
| 1 | Routing, surface switcher, shared wall-clock (every device shows the same scenario second, no server needed) | Done |
| 2 | Threat Intelligence Engine: association, noisy-OR fusion over independent sources, decay, lifecycle, swerve-cluster detection, driver relevance tiers. 20 unit tests (`npm test`) | Done |
| 3 | Live surfaces: `/twin`, `/ops`, `/drive` (webcam fatigue via MediaPipe, voice alerts), `/car`, `/app` (camera reports, accelerometer road sensing), `/director` (clock, beats, QR) | Done |
| 4 | Cross-device sync: `api/events.ts` (Vercel Function + Upstash Redis). Works per browser without it | Built; needs the store connected on Vercel |
| 5 | Polish: performance pass, rehearsal recording, dashcam footage under the HUD, optional photoreal tiles | Next |

What is real vs simulated: the engine, relevance logic, fatigue detection, phone sensing, camera reports, weather and OSM geometry are real. Vehicle tracks, their detections and crash history are simulated and labelled.

## 12. Deploy on Vercel

1. Put `C:\IIT_Ideathon` in a GitHub repository, then import it on vercel.com. Set **Root Directory = `app`**. The framework (Vite), build command and output are already set in `app/vercel.json`.
   - Or from a terminal: `cd C:\IIT_Ideathon\app`, then `npx vercel` (it asks you to log in and link a project), then `npx vercel --prod`.
2. Optional, for cross-device sync: in the Vercel project, open **Storage / Marketplace**, add **Upstash Redis** (free tier) and connect it to the project. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which `api/events.ts` reads. Redeploy. The phone app's "You" tab then says "Linked".
3. Open `/director` on your laptop and show its QR code to the jury. The phone app needs HTTPS for the camera, accelerometer and location; Vercel provides HTTPS.

Note: a Vercel deployment URL is public unless you turn on Deployment Protection.

Local: `cd app`, `npm install`, `npm run dev` (http://localhost:5174 via the launch config), `npm test`, `npm run build`. Refresh the map data with `npm run data`.

---

## 13. What to build next: feature ideas

### Real functionality (solves the problem in production)
| Feature | What it does | How, with what exists today |
|---|---|---|
| On-device hazard detection from the dashcam | A phone on the dashboard runs a road-damage and obstacle detector and sends observations, not video | YOLO-family model exported to ONNX, run with onnxruntime-web (WebGPU) in the phone app; RDD2022 for potholes, open-vocabulary detection for barricades |
| Map matching for every report | Snap any GPS point to the right carriageway and lane before fusion | OSRM `/match` (open source) on the existing OSM road graph |
| Reputation that learns | Reporters whose reports get confirmed gain weight; spam loses it | Already modelled as `reputation` in the engine; persist per account |
| Pass-by verification | Cars that drive past a hazard without detecting it count as "saw nothing" | Negative evidence is already in the engine; the client just needs to send it on passing a known threat |
| Monsoon mode | Rainfall forecasts raise waterlogging risk at low points before the water arrives | Open-Meteo hourly precipitation + AWS terrain tiles for low-lying underpasses |
| Route risk score | Choose the safer route, not only the faster one | Sum segment risk along OSRM alternatives; show both |
| Fleet console | Bus depots and cab fleets see fatigue events and near-misses per route | The driver-monitor and swerve events already exist; aggregate by fleet |
| City work-order export | Send ranked repairs to a municipal grievance system with evidence | CSV / GeoJSON export from the ops console, plus a webhook |
| Suzuki Connect integration | Cars report harsh braking and swerves; drivers get alerts on the head unit | The event format is already telematics-shaped; needs an OEM partnership |
| Privacy by design | Faces and plates blurred on device, location coarsened for citizen reports | MediaPipe face detection for blur; coarsen to 10 m before sync |

### Visually striking and interactive (for the demo and the product)
| Feature | Experience |
|---|---|
| Time-of-day scrubber | Drag from noon to midnight on the twin; sun, shadows, lamps, lit windows and risk terrain change together (risk is time-dependent) |
| Monsoon replay | Rain on the windshield, puddles growing in low spots, the waterlogging threat appearing before cars reach it |
| "What the network sees" split view | Left: one car's own cameras. Right: the fused picture. Drag the divider |
| Heat of near-misses | A 3D hex layer of harsh-braking events rising over the satellite map, with a 30-day playback |
| Report-to-repair timeline | Follow one pothole from a resident's photo to a crew's fix in a single animated thread across the surfaces |
| Judge's phone as a car | Each jury phone becomes a car on JVLR; shaking it drops a bump report that appears on the projector in seconds (needs the shared store on Vercel) |
| Photoreal Powai | Google 3D tiles with the survey overlays on top: set `VITE_GOOGLE_MAPS_API_KEY` |
| AR windshield | Phone camera feed with the lane arrows and threat markers projected on the real road (WebXR on Android) |
