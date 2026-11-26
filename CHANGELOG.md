# Changelog

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
