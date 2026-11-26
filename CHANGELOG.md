# Changelog

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
