# Design: the Live Survey Sheet

**Idea:** road risk is terrain. Danger is surveyed the way survey maps draw ground: risk isolines terraced over the real city, and every threat marked like a survey benchmark. The look deliberately refuses the navy-and-neon smart-city dashboard with KPI tiles and background grids.

## Two sheets

| Day sheet (city, ops, phones, landing) | Night sheet (cockpit, in-dash) |
|---|---|
| Clay `#E7E3D9` page, graphite ink `#1C2226` | Graphite `#13181B`, clay ink |
| Real satellite imagery and HDRI daylight in 3D | Night HDRI, wet asphalt, lamps, bloom on lights |

## Threat notation

State is always carried by **shape and word**, never colour alone.

| State | Glyph | Colour |
|---|---|---|
| Confirmed | solid inverted triangle | vermilion `#E0401F` |
| Potential / noticed | dashed ring | ochre `#D19A1C` |
| Predicted | open double ring, risk terraces | violet `#6B4FA0` |
| Live perception | solid dot, sensor fans, wave front | survey blue `#1F6FB2` |
| Resolved | hollow triangle | grey `#7D8380` |

Wording follows confidence: confirmed threats are named ("Unmarked barricade, lane 1, 54 m"); potential ones are "possible"; predicted ones name their history.

## Type

- **Mona Sans** (variable): width carries hierarchy. Wide (112 to 125) for titles, narrow (80 to 88) for dense labels.
- **Martian Mono** only for figures: distances, speeds, counts, confidence.
- Self-hosted with `@fontsource`; no Google Fonts requests.

## Shape and depth

- 2 px radius everywhere; the full pill is reserved for the in-car alert capsule.
- Light comes from the 3D scene (sun, HDRI, emissive lights), not from CSS glow. Shadows are tinted and offset.

## Signature interactions

- **X-ray sensor wave:** a band sweeps out from the ego car; inside it buildings dissolve into a screen-door stipple with firm edge linework, and threats behind them draw through.
- **Scroll story:** one continuous camera path from the city to street level while the scenario plays.
- **Fusion Lab:** evidence lines whose width is each source's live weight, flowing into a confidence gauge marked at the potential and confirm thresholds.

## Realism pipeline

| Element | How |
|---|---|
| Ground | Esri World Imagery tiles (zoom 18) stitched at runtime into one texture in the OSM metre frame; Google Photorealistic 3D Tiles when a key is set |
| Roads | OSM centrelines as UV-mapped ribbons with Poly Haven asphalt (PBR), paver footpaths, concrete kerbs; lane paint along JVLR |
| Buildings | OSM footprints, per-building wall tone, shader-generated floors, window bays, reflective glazing, lit windows at night |
| Vehicles | Procedural models (hatchback, sedan, SUV, BEST bus, auto, two-wheeler with rider), clear-coat paint, instanced per part |
| People | CesiumMan animated walker, scaled to 1.68 m; X-ray ghost in the threat colour |
| Street | Instanced trees and lamps kept off carriageways; additive light pools at night |
| Hazards | Striped water barriers, metal barricade with reflective board, banded cones, wet pothole with gravel |
| Light | HDRI image-based lighting, raking sun with 4K shadows, N8AO, AgX tone mapping; night bloom |

## Rules that bind every surface

- No background grids or decorative crosshairs; ticks appear only where they measure something.
- No default fonts, no neon glow, no purple gradients, no glass on everything, no React Bits background effects.
- No em dashes, eyebrows or section numbers in UI copy.
- Every animation answers "what does this communicate?".
- Synthetic data is labelled where it is used.
