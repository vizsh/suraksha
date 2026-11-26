# Data

Everything is fetched from free, open sources by scripts or at runtime. Nothing needs an account except the two optional services at the bottom.

| Data | Source | How | Licence |
|---|---|---|---|
| Roads, lanes, sidewalks, buildings and heights, signals, bus stops, hospitals | OpenStreetMap via Overpass (mirrors with backoff) | `npm run data` writes `public/data/corridor.json` in local metres | ODbL, attribution shown |
| Satellite imagery | Esri World Imagery tiles | Stitched at runtime in the browser, never stored in the repo | Esri terms, attribution shown |
| Weather (rain, visibility, day or night) | Open-Meteo | Fetched at runtime every 10 min | CC BY 4.0 |
| HDRI skies, PBR textures | Poly Haven | `node scripts/fetch-assets.mjs` | CC0 |
| Walking figure | CesiumMan, Khronos glTF sample assets | `node scripts/fetch-assets.mjs` | CC-BY 4.0 (Cesium) |
| Face landmark model | MediaPipe Face Landmarker | Fetched at runtime; WASM served from our origin | Apache 2.0 |

## The corridor

Powai, Mumbai: JVLR between IIT Bombay and Hiranandani, bounding box 19.1140 to 19.1300 N, 72.9020 to 72.9175 E (about 1.6 × 1.8 km). Local frame: x east, z south, origin at the box centre, equirectangular metres. Change the box in `scripts/fetch-osm.mjs` to move the demo to another city.

## Synthetic, and labelled

- Vehicle tracks and their dashcam detections in the 48-second scenario.
- Crash history behind the predicted risk zones (zone descriptions say "synthetic").
- Resident reports and swerve events inside the scenario.

The engine, relevance logic, fatigue detection, phone sensing, camera reports, weather and map geometry are real.

## Optional services

| Service | Why | Setup |
|---|---|---|
| Google Photorealistic 3D Tiles | Photoreal Powai in 3D | `VITE_GOOGLE_MAPS_API_KEY` in `app/.env.local` (Map Tiles API enabled; restrict by HTTP referrer) |
| Upstash Redis (Vercel Marketplace) | Cross-device sync of reports and the clock | Add the integration; `KV_REST_API_URL` and `KV_REST_API_TOKEN` are read by `api/events.ts` |

## Statistic used

1,68,491 road deaths in 2022: Ministry of Road Transport and Highways, *Road Accidents in India 2022*. Verify against the published report before quoting elsewhere.
