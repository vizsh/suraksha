<div align="center">

<img src="docs/images/hero.jpg" alt="SuRaksha Mesh: the Powai corridor as a live 3D twin with satellite imagery, survey risk terrain and threat benchmarks" width="100%" />

# SuRaksha Mesh

### Every hidden threat, surveyed live.

A virtual V2X network that turns the cars and phones already on Indian roads into one lane-level, live picture of the road, and tells each driver only what is in their lane, before they can see it.

![React 19](https://img.shields.io/badge/React-19-1c2226?style=flat-square&logo=react&logoColor=e7e3d9)
![three.js](https://img.shields.io/badge/three.js-r187-1c2226?style=flat-square&logo=threedotjs&logoColor=e7e3d9)
![TypeScript](https://img.shields.io/badge/TypeScript-7-1c2226?style=flat-square&logo=typescript&logoColor=e7e3d9)
![Vite](https://img.shields.io/badge/Vite-8-1c2226?style=flat-square&logo=vite&logoColor=e7e3d9)
![Engine tests](https://img.shields.io/badge/engine_tests-20_passing-1f6fb2?style=flat-square)
![Deploy](https://img.shields.io/badge/deploy-Vercel-1c2226?style=flat-square&logo=vercel&logoColor=e7e3d9)

**Maruti Suzuki Innovation × IIT Bombay E-Summit Ideathon 2026** · AI, IoT and Intelligent Urban Mobility

[The problem](#the-problem) · [The product](#the-product) · [How it works](#how-it-works) · [The engine](#the-threat-intelligence-engine) · [Run it](#run-it) · [Docs](#documentation)

</div>

---

## The problem

In 2022, **1,68,491 people died on India's roads**: one every three minutes (MoRTH, *Road Accidents in India 2022*). Much of what kills is out of sight at the moment it matters:

- a pedestrian stepping out from behind a stopped bus
- a barricade put up overnight that is on no map
- a pothole hidden under monsoon water
- a free-left turn where people keep getting hit

A driver sees about 100 metres. **Some car nearby has usually already seen the danger**, but that knowledge dies inside that car. India has almost no roadside V2X infrastructure, and it is years away.

## The idea

**Use what is already on the road.** Dashcams, accelerometers, connected cars (Suzuki Connect) and residents' phones report what they see. A fusion engine decides what is a rumour and what is a fact. Each driver hears only what is on their route, in their lane, in the next minute.

| | |
|---|---|
| **No new hardware** | Cars and phones that already exist. Cellular "V2X-lite", no roadside units. |
| **Honest confidence** | One report is said as "possible". Two independent sources make it "confirmed". |
| **Sees what nobody named** | Three different cars swerving at one spot become an "unknown obstacle". |
| **Closes the loop** | Hazards become ranked city work orders; passing cars verify the repair. |

---

## The product

One shared world, seven live surfaces. Every device follows the same scenario second, so a phone, a laptop and a projector agree without pairing.

<table>
<tr>
<td width="50%"><img src="docs/images/story-street.jpg" alt="Landing page story at street level: the red bus, the hidden pedestrian and the confirmation chapter" /><br/><b>Landing story</b> · scroll from the city down to the bus while the scenario plays</td>
<td width="50%"><img src="docs/images/fusion-lab.jpg" alt="Fusion Lab: evidence sources flowing into a confirmed threat on the satellite view" /><br/><b>Fusion Lab</b> · add evidence, watch the real engine decide</td>
</tr>
<tr>
<td><img src="docs/images/twin.jpg" alt="City twin: satellite imagery of Powai lake and JVLR with 3D buildings and threats" /><br/><b>City twin</b> <code>/twin</code> · satellite imagery, risk terrain, X-ray sensor wave</td>
<td><img src="docs/images/ops.jpg" alt="Operations console with lane-level bird's-eye view and threat inspector" /><br/><b>Operations</b> <code>/ops</code> · fused lane-level view, sources, work orders, blackspots</td>
</tr>
<tr>
<td><img src="docs/images/cockpit.jpg" alt="Cockpit HUD on a night drive with a confirmed barricade alert" /><br/><b>Cockpit</b> <code>/drive</code> · night HUD, voice alerts, webcam fatigue detection</td>
<td><img src="docs/images/dash.jpg" alt="1920 by 720 in-dash screen with map, alert and Road Ahead rail" /><br/><b>In-dash screen</b> <code>/car</code> · 1920 × 720, glanceable at speed</td>
</tr>
<tr>
<td><img src="docs/images/story-driver.jpg" alt="Landing story final chapter from behind the driver" /><br/><b>Driver chapter</b> · "Your car hears it before the bus clears"</td>
<td><img src="docs/images/director.jpg" alt="Director console with scenario clock, beats and QR code" /><br/><b>Director</b> <code>/director</code> · scenario clock, story beats, QR for the jury</td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="docs/images/twin-night-rain.jpg" alt="City twin at night in monsoon rain with lit windows and street lamps" /><br/><b>Night and monsoon</b> · time of day, rain and wet roads, or "Live Powai" from real weather</td>
<td width="50%"><img src="docs/images/twin-heat.jpg" alt="Near-miss heat columns rising along JVLR" /><br/><b>Near-miss heat</b> · 30 days of harsh braking as hexagon columns</td>
</tr>
</table>

<p align="center"><img src="docs/images/palette.jpg" alt="Command palette searching for the barricade" width="70%" /><br/><b>Command palette</b> · Ctrl/Cmd + K: surfaces, threats, story moments, layers</p>

<p align="center"><img src="docs/images/phone.jpg" alt="Phone app: Road Ahead list and the phone as a road sensor" width="300" /><br/><b>Phone app</b> <code>/app</code> · Road Ahead, camera reports, the phone's accelerometer as a road sensor</p>

### What is real and what is simulated

| Real in the prototype | Simulated for the demo |
|---|---|
| Threat Intelligence Engine: association, fusion, decay, lifecycle, implicit obstacles, driver relevance (unit-tested) | Vehicle tracks on JVLR and their dashcam detections |
| OpenStreetMap roads, lanes, 352 buildings, signals and bus stops of Powai | Crash history behind the predicted risk zones (labelled synthetic) |
| Esri satellite imagery; Google photoreal 3D tiles when a key is set | Resident reports and swerve events inside the scripted scenario |
| Live weather from Open-Meteo (rain lengthens stopping distance) | |
| Webcam fatigue detection (MediaPipe, on device), phone accelerometer, camera reports | |

---

## How it works

```mermaid
flowchart LR
  subgraph Sense["Sense: on cars and phones"]
    A1[Dashcam vision]
    A2[Accelerometer spikes]
    A3[Swerves and harsh braking]
    A4[Resident photo reports]
    A5[In-cabin fatigue monitor]
  end
  subgraph Share["Share: cellular V2X-lite"]
    B1[(Event log<br/>observations, not video)]
  end
  subgraph Fuse["Fuse: Threat Intelligence Engine"]
    C1[Associate by place and kind]
    C2[Noisy-OR over independent sources]
    C3[Decay and negative evidence]
    C4[Lifecycle state]
    C5[Swerve clusters to unknown obstacles]
  end
  subgraph Serve["Serve"]
    D1[Driver feed<br/>route, lane, time to reach]
    D2[City console<br/>work orders, blackspots]
    D3[Residents<br/>report status, points]
  end
  A1 & A2 & A4 & A5 --> B1
  A3 --> C5 --> B1
  B1 --> C1 --> C2 --> C3 --> C4
  C4 --> D1 & D2 & D3
  R[Risk model<br/>OSM geometry + crash history] --> D1 & D2
  W[Open-Meteo weather] --> D1
```

### The night on JVLR (48-second scenario)

```mermaid
sequenceDiagram
  participant R as Resident
  participant Cars as Connected cars
  participant E as Engine
  participant D as Your car
  R->>E: Photo of a barricade (new account)
  E-->>D: "Possible barricade" (noticed)
  Cars->>E: 3 cars swerve within 15 m
  E-->>D: Potential, second independent source
  Cars->>E: Dashcam names it
  E-->>D: Confirmed: lane 1, move to lane 2
  Cars->>E: Car 72 m ahead sees a pedestrian behind the bus
  Cars->>E: Oncoming car agrees
  E-->>D: Confirmed pedestrian, see-through view, voice alert
  Note over D: The bus has not cleared yet
  E-->>D: Nobody sees them any more: resolved, alert fades
```

---

## The Threat Intelligence Engine

Every input is an observation: kind, place, time, source, confidence. The engine is pure TypeScript in [`app/src/engine`](app/src/engine) with 20 unit tests.

**Evidence from one source** decays with a half-life that depends on the hazard (seconds for a pedestrian, weeks for a pothole):

$$e_s = R_{\text{source}} \cdot c \cdot \rho \cdot 0.5^{\,\Delta t / T_{1/2}(\text{kind})}$$

**Fusion** is a noisy-OR across *independent* sources (a device reporting five times still counts once), and passing cars that see nothing pull it down:

$$\text{conf} = \Big(1 - \prod_{s}(1 - e_s)\Big)\cdot\prod_{k \in \text{clears}}\big(1 - 0.6\,R_k c_k\big)$$

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Noticed: conf >= 0.12
  Noticed --> Potential: conf >= 0.35
  Potential --> Confirmed: conf >= 0.75 and 2+ sources
  Noticed --> Faded: evidence decays
  Potential --> Faded: evidence decays
  Confirmed --> Resolved: conf < 0.35, operator repair, or passing cars see nothing
  Resolved --> Noticed: new report after repair
```

| Source | Reliability | | Hazard | Half-life |
|---|---|---|---|---|
| City CCTV | 0.85 | | Pedestrian | 4 s |
| Dashcam vision | 0.80 | | Erratic vehicle | 20 s |
| Crash history | 0.75 | | Barricade | 12 h |
| Resident photo | 0.55 | | Pothole | 45 days |
| Phone accelerometer | 0.45 | | Unmarked speed breaker | 1 year |
| Swerve cluster | 0.40 | | Unknown obstacle | 30 min |

**Driver relevance** keeps only threats on the route, ahead, in or next to the driver's lane, within the horizon. A confirmed threat in your lane inside 1.8 × stopping distance (longer when Open-Meteo reports rain) is **critical**; potential ones are spoken as "possible". Full detail: [docs/ENGINE.md](docs/ENGINE.md).

---

## Built with

| Layer | Tools (all free and open source unless noted) |
|---|---|
| App | Vite 8, React 19, TypeScript, wouter, Zustand |
| 3D | three.js r187, React Three Fiber 9, drei, postprocessing (N8AO, Bloom, AgX), 3d-tiles-renderer |
| UI | Tailwind CSS v4, shadcn/ui (restyled), React Bits (VariableProximity), Motion, Phosphor icons |
| Type | Mona Sans (variable width), Martian Mono, self-hosted |
| Sensing | MediaPipe Face Landmarker (on device), DeviceMotion, Geolocation, camera capture |
| Data | OpenStreetMap via Overpass, Esri World Imagery, Open-Meteo, Poly Haven (CC0), CesiumMan (CC-BY 4.0) |
| Optional | Google Photorealistic 3D Tiles (your key), Upstash Redis on Vercel for cross-device sync |

---

## Run it

```bash
cd app
npm install
npm run dev          # http://localhost:5173 (5174 with the bundled launch config)
npm test             # engine unit tests
npm run build        # production build
npm run data         # refresh OSM data for the corridor
node scripts/fetch-assets.mjs   # re-download HDRIs, textures and the walking figure
```

Optional `app/.env.local`:

```bash
VITE_GOOGLE_MAPS_API_KEY=...   # Google Photorealistic 3D Tiles (Map Tiles API enabled, restrict by referrer)
```

**Deploy on Vercel:** import this repository, set the root directory to `app` (framework, build and rewrites are in [`app/vercel.json`](app/vercel.json)). Add the Upstash Redis integration to link devices: a report or a shake on any phone then appears on every screen within seconds. Details in [docs/DEMO.md](docs/DEMO.md).

Keys `0` to `6` switch surfaces on any screen.

---

## Repository map

```text
app/
  api/events.ts            Vercel Function: shared event log (Upstash Redis), optional
  scripts/                 fetch-osm, fetch-assets, copy runtime decoders
  public/data/             corridor.json (OSM, local metres)
  public/assets/           HDRIs, PBR textures, walking figure (see CREDITS.txt)
  src/engine/              fusion, implicit obstacles, driver relevance, tests
  src/world/               corridor geometry, scenario, shared clock, live store
  src/three/               scene, shaders, canvases, realism/ (vehicles, street, ground, walkers)
  src/product/             console, HUD, in-dash, phone screens, Fusion Lab
  src/surfaces/            /twin /ops /drive /car /app /director
  src/pages/               Landing (/), showcase sections
  src/sense/               fatigue, motion, location, weather
  src/sync/                events store, BroadcastChannel and cross-device sync
docs/                      architecture, engine, design, data, demo, roadmap, plan
```

## Documentation

| Doc | What it covers |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Layers, shared clock, data flow, routes, sync |
| [ENGINE](docs/ENGINE.md) | Fusion maths, parameters, lifecycle, relevance, tests |
| [DESIGN](docs/DESIGN.md) | The Live Survey Sheet visual system, realism pipeline, rules |
| [DATA](docs/DATA.md) | Every data source, licence, and what is synthetic |
| [DEMO](docs/DEMO.md) | The 7-minute pitch, multi-device setup, deployment |
| [ROADMAP](docs/ROADMAP.md) | Next features: real functionality and visual upgrades |
| [PLAN](docs/PLAN.md) | The original ideation and build plan |
| [AGENTS](AGENTS.md) | Context for AI coding agents working in this repo |
| [CHANGELOG](CHANGELOG.md) | What each build phase added |

---

## Credits

Map data © OpenStreetMap contributors (ODbL). Satellite imagery: Esri, Maxar, Earthstar Geographics and the GIS user community. Weather: Open-Meteo. HDRIs and textures: Poly Haven (CC0). Walking figure: CesiumMan by Cesium (CC-BY 4.0) via the Khronos glTF sample assets. Statistic: Ministry of Road Transport and Highways, *Road Accidents in India 2022*.

Built for the Maruti Suzuki Innovation × IIT Bombay E-Summit Ideathon, 2026. Maruti Suzuki and Suzuki Connect are named as the intended deployment context; this is an independent student prototype.
