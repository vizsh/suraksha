# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript. React Three Fiber / three.js for 3D, deck.gl + MapLibre GL for geospatial layers, Tailwind CSS + shadcn/ui + React Bits components, motion.dev for UI motion, GSAP where React Bits components require it. Confirmed by the user on 2026-11-26.

## Users

- **Jury and mentors at the MSIL × IIT Bombay E-Summit Ideathon** (finale 12 Dec 2026): evaluate a 7-minute live or recorded demo plus 5-minute Q&A. Judge prototype performance, business impact, feasibility, innovation and pitch clarity.
- **Drivers of connected cars** (Maruti Suzuki with Suzuki Connect, or any phone with a dashcam app): receive lane-level "Road Ahead" alerts while driving; must not be distracted.
- **City operators** (municipal corporation, traffic police, NHAI): monitor hazards, risk segments and work orders in a command centre.
- **Citizens and pedestrians**: report broken footpaths, potholes, barricades and dangerous crossings; see safer walking routes.

## Product Purpose

SuRaksha Mesh turns every connected car and citizen into a node of a shared, lane-level, live road map. It fuses what cars see now (live), what anyone noticed once (potential), and what accident history and road geometry predict (predicted), then pushes only the relevant threats to each car ahead of time. Success for the prototype: a jury sees a hidden threat (occluded pedestrian, unmarked barricade, sidewalk gap) detected, confirmed by the network and delivered to a driver before it becomes visible, across city, corridor and cockpit views.

## Positioning

A virtual V2X ("cellular V2X-lite") network that needs no roadside infrastructure. Maruti's ~40% passenger-car share makes its fleet the largest possible sensor network. It combines cooperative perception, a threat lifecycle (noticed → potential → confirmed → resolved, plus predicted), and India-specific hazards (unmarked speed breakers, overnight barricades, footpath gaps, mixed traffic).

## Operating Context

- Demo runs on a laptop in a pitch room, projected; live webcam fatigue moment with a judge.
- Prototype data comes from open sources (OSM, Open-Meteo, public datasets) plus scripted simulated scenarios; no IoT hardware is built.
- Three deployment surfaces: web command centre, phone app (driver + citizen), in-car infotainment / HUD.

## Capabilities and Constraints

- Feature set: collaborative BEV, smart lane detection and lane health, see-through view, occluded pedestrian warnings, pedestrian risk layer (dangerous turns, sidewalk gaps, unsafe turning points, high-risk segments), hazard events (potholes, barricades, speed breakers, manholes, debris, cattle, waterlogging), implicit obstacle detection from swerve/brake clusters, threat intelligence engine with confidence and decay, driver fatigue input, GLOSA and ambulance corridor, safety score and rewards, city work-order loop.
- Prototype priority is look, feel and use-case coverage, not model accuracy or a production backend.
- Build window: roughly 2–11 Dec 2026.

## Evidence on Hand

- Problem statement PDF: `C:\Users\jeeve\Downloads\Ideathon MSIL x E- Cell IIT B.docx (2).pdf`.
- Inspiration docs (visual references only): `inspiration_with_images.docx`, `inspiration2 with images.docx` in Downloads.
- Statistic cited from a ChatGPT summary: 25,769 pedestrian deaths in 2024 (MoRTH). Must be verified against the MoRTH report before use.
- No real crash coordinates for Indian cities are on hand yet; any accident layer in the prototype is synthetic and must be labelled as such.

## Product Principles

1. Show the invisible: every screen should make a threat visible before the driver could see it.
2. Confidence is always explicit: live, potential, predicted and confirmed never look the same.
3. Drivers get less, not more: relevance filtering beats alert volume.
4. No new hardware: everything runs on cars and phones that already exist.
5. Close the loop: reports turn into fixes, and the network verifies the fix.

## Accessibility & Inclusion

In-car surfaces must be glanceable (large type, high contrast, colour never the only signal). Colour-coded threat states also carry shape and label.
