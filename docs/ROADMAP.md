# Roadmap

**Shipped so far:** A2 map matching, A5 monsoon early warning, A6 route risk, A8 work-order export, A12 offline phone app (Phase 2 and 3); B2 time and weather, B7 near-miss heat, B8 split view, B10 directional chimes, B11 command palette (Phase 1 and 3). See [CHANGELOG](../CHANGELOG.md).

Two tracks: features that make SuRaksha Mesh solve the problem in production, and visual work that makes the prototype unmistakably state of the art. Each item names the open tool that gets it there.

## Track A: real functionality

| # | Feature | Outcome | How |
|---|---|---|---|
| A1 | On-phone hazard detection | A dashboard phone sends observations, not video | YOLO-family road-damage and open-vocabulary models in ONNX, run with onnxruntime-web on WebGPU; RDD2022 for potholes |
| A2 | Map matching | Every report lands on the right carriageway and lane | OSRM `/match` on the same OSM graph |
| A3 | Pass-by verification | Cars that drive past a known threat without seeing it send "saw nothing" | Negative evidence already exists in the engine; add the client trigger |
| A4 | Learned reputation | Reporters whose reports confirm gain weight; spam loses it | Persist `reputation` per account; decay toward a prior |
| A5 | Monsoon early warning | Waterlogging risk rises before the water does | Open-Meteo hourly rain + AWS terrain tiles to find low points |
| A6 | Route risk | Pick the safer route, not only the faster one | Sum segment risk along OSRM alternatives |
| A7 | Fleet console | Depots see fatigue events and near-misses per route | Aggregate driver-monitor and swerve events by fleet |
| A8 | Work-order export | Repairs reach the municipal system with evidence | GeoJSON / CSV export and a webhook from `/ops` |
| A9 | Suzuki Connect pilot | Cars report harsh braking and swerves; head unit shows alerts | The event format is telematics-shaped; needs an OEM partnership |
| A10 | Privacy by design | Faces and plates never leave the device | On-device blur before any photo is kept; coarsen citizen locations to 10 m |
| A11 | Real accounts and auth | Street Guardian points that persist | Supabase or Clerk; points ledger table |
| A12 | Offline-first phone app | Reports queue when the network drops | Service worker + IndexedDB outbox (PWA) |

## Track B: visual and interactive upgrades

| # | Upgrade | What the jury sees | Open tools |
|---|---|---|---|
| B1 | Gaussian-splat street scans | Photoreal JVLR at street level, captured with a phone walk | Capture with an open pipeline (nerfstudio / gsplat), render with `@mkkellogg/gaussian-splats-3d` |
| B2 | Time and weather engine | Drag noon to midnight: sun, shadows, lamps, lit windows, risk terrain all change; rain on the windshield, puddles grow | `suncalc` for sun position, GPU rain particles, screen-space reflections from `realism-effects` |
| B3 | Cinematic director mode | Recorded, frame-perfect flythroughs for the pitch video | Theatre.js sequences over the existing cameras |
| B4 | Risk terrain as a heightfield | A glowing contour surface instead of lines, with values etched on it | GPU heightfield + contour shader from the existing risk grid |
| B5 | LiDAR point-cloud mode | Toggle the city into a sensor point cloud as an alternative X-ray | Sample building and road surfaces into `THREE.Points` with a scan-line shader |
| B6 | City-scale traffic | Hundreds of vehicles with realistic flow | SUMO-generated traces streamed into the instanced fleet |
| B7 | Near-miss heat | A 3D hex layer of harsh braking rising over the satellite map, 30-day playback | deck.gl `H3HexagonLayer` on the ops console |
| B8 | "What the network sees" split view | Drag a divider: one car's own view versus the fused picture | Two cameras into one canvas with a scissor split |
| B9 | AR windshield on a phone | Lane arrows and threats over the real camera feed | WebXR camera passthrough on Android, fallback to video overlay |
| B10 | Spatial sound | Alerts come from the threat's direction in the cockpit | Web Audio `PannerNode` placed at the threat |
| B11 | Command palette | Jump to any threat, surface or story beat from the keyboard | `cmdk`, restyled to the survey sheet |
| B12 | Report-to-repair thread | One pothole followed from a photo to a crew fix across all surfaces | Scripted beat in the director that drives the existing screens |

## Landing page next steps

- Replace the remaining street-level benchmark stems with compact ground rings in the story.
- Add B2's time slider as chapter 6, and B8's split view as a section after the Fusion Lab.
- A short muted background video of the cockpit for devices without WebGL.
