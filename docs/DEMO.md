# Demo: the 7-minute pitch

## Setup

| Screen | Open | Notes |
|---|---|---|
| Projector | `/` then `/twin` | Landing story first, then the twin |
| Laptop | `/drive` | Start driver monitoring; turn voice alerts on |
| Tablet in landscape (optional) | `/car` | The in-dash screen |
| Your phone or second laptop | `/director` | Clock, story beats, QR code |
| Jury phones | `/app` via the QR | Reports and shakes appear on every screen when devices are linked |

Keys `0` to `6` switch surfaces. Every device follows the same scenario second automatically.

**Linking devices** needs the Upstash Redis integration on the Vercel project. Without it each browser is self-contained (still fine for a single-laptop demo).

**HTTPS** is required on phones for camera, motion and location; a Vercel deployment provides it.

## Script

| Time | Beat | Say |
|---|---|---|
| 0:00 | Landing, chapter 1 | 1,68,491 road deaths in 2022. One every three minutes. |
| 0:30 | Scroll, chapter 2 | What kills is often out of sight: a bus, a barricade, monsoon water. |
| 1:00 | Chapter 3, X-ray wave | Every connected car is a sensor. No roadside hardware. |
| 1:40 | Fusion Lab, Autoplay | One report is a rumour; three swerving cars and a dashcam make it a fact; passing cars clear it. This is the real engine. |
| 2:40 | `/twin` | The whole corridor: satellite, risk terrain, threats with their state. |
| 3:20 | Director: seek to 22.3 | The car ahead sees a pedestrian behind the bus. An oncoming car agrees. Confirmed. |
| 3:50 | `/drive` | The driver hears it before the bus clears. See-through view from the car ahead. |
| 4:30 | Judge closes eyes at the webcam | Microsleep: chime, voice, and nearby cars are warned. |
| 5:00 | Jury phones: shake or report | It appears on the ops console as "possible"; a second phone moves it forward. |
| 5:40 | `/ops`, Work orders | The city gets a ranked queue with evidence; passing cars verify the repair. |
| 6:20 | Value | Drivers, Maruti Suzuki (Suzuki Connect, no new hardware), cities. |

Record a full screen capture of this run as a backup.

## Deploy

1. Import the repository on Vercel; root directory `app`.
2. Optional: add Upstash Redis from the Marketplace and redeploy.
3. Optional: add `VITE_GOOGLE_MAPS_API_KEY` as an environment variable.
4. A Vercel deployment URL is public unless Deployment Protection is on.
