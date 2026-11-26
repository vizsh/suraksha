# The Threat Intelligence Engine

`app/src/engine/` is plain TypeScript with no UI dependencies. Every surface uses it; so does the Fusion Lab on the landing page. Run its tests with `npm test` in `app/`.

## Inputs

```ts
interface Observation {
  id: string; t: number            // engine ms
  kind: HazardKind                 // pedestrian, pothole, barricade, ..., unknown
  source: SourceKind               // vision, cctv, imu, swerve, citizen, history, operator, driver-monitor
  sourceId: string                 // one vote per device, person or cluster
  pos: [x, z]                      // local metres
  conf: number                     // detector or reporter confidence
  polarity?: 1 | -1                // -1: passed here and saw nothing
  resolve?: boolean                // operator closes it (repair)
  reputation?: number              // trust in this source
}
```

`Manoeuvre` events (swerve, harsh brake) are not hazards on their own; see implicit obstacles below.

## 1. Association (`associate`)

Observations are sorted by time and greedily attached to the nearest compatible cluster within a kind-specific radius. `unknown` merges into any static obstacle kind, and a cluster upgrades from `unknown` to the first named kind it receives. Moving objects (pedestrian, animal, erratic vehicle) track their latest position and start a new cluster after 20 s unseen.

| Kind | Radius |
|---|---|
| Pothole, speed breaker | 8 m |
| Manhole | 6 m |
| Pedestrian | 14 m |
| Debris | 15 m |
| Unknown | 18 m |
| Barricade | 20 m |
| Stalled vehicle, animal | 25 m |
| Footpath | 30 m |
| Waterlogging | 40 m |
| Erratic vehicle | 60 m |

## 2. Evidence and fusion (`evidence`)

For each independent source *s*, keep its strongest observation:

$$e_s = R_{\text{source}} \cdot c \cdot \rho \cdot 0.5^{\,(t_{now} - t)/T_{1/2}(\text{kind})}$$

Fuse with a noisy-OR, then apply negative evidence from *other* sources newer than the last positive report:

$$\text{conf} = \Big(1 - \prod_s (1 - e_s)\Big) \cdot \prod_k \big(1 - 0.6\,R_k c_k\big)$$

| Source | R | Hazard | Half-life |
|---|---|---|---|
| operator | 1.00 | pedestrian | 4 s |
| cctv | 0.85 | erratic vehicle | 20 s |
| vision | 0.80 | animal | 3 min |
| history | 0.75 | stalled vehicle | 20 min |
| driver-monitor | 0.70 | unknown | 30 min |
| citizen | 0.55 | debris | 2 h |
| imu | 0.45 | waterlogging | 3 h |
| swerve | 0.40 | barricade | 12 h |
| | | manhole | 7 days |
| | | pothole | 45 days |
| | | footpath | 180 days |
| | | speed breaker | 365 days |

## 3. Lifecycle (`classify`)

| State | Rule |
|---|---|
| Resolved | an operator `resolve` newer than the last positive report, or it was once confirmed and confidence fell below 0.35 |
| Confirmed | conf ≥ 0.75 with ≥ 2 independent sources, or conf ≥ 0.92 from one strong source; stays confirmed while conf ≥ 0.35 |
| Potential | conf ≥ 0.35 |
| Noticed | conf ≥ 0.12 |
| Faded | below 0.12 and never confirmed (hidden) |

A confirmed threat never slides back to "possible": it is either still confirmed or resolved. Whether it was ever confirmed is evaluated by replaying confidence at each positive observation's time.

## 4. Implicit obstacles (`implicitObstacles`)

For every manoeuvre, look back 10 minutes within 15 m. Three or more **distinct vehicles** produce an `unknown` observation from source `swerve` with confidence `0.55 + 0.1 × (vehicles − 3)` (max 0.95), keyed to a 20 m cell so the cluster acts as one source. One car swerving three times does not count.

## 5. Driver relevance (`driverFeed`)

Inputs: route-projected threats, the driver's arc length, lateral offset and speed, and conditions from Open-Meteo.

- Drop threats behind (more than 5 m), resolved, faded, off route, or beyond `max(450 m, 45 s × speed)`.
- Lanes follow left-hand traffic: offset < -1.75 m is lane 1 (kerb), > 1.75 m is lane 3. Pedestrians, waterlogging, animals and risk zones affect all lanes.
- Stopping distance = `1.5 s × v + v² / (2a)` with `a = 6.5 m/s²` dry, `4.5` wet; ×1.25 at night or below 1.5 km visibility.

| Tier | When |
|---|---|
| Critical | confirmed, same lane, closer than 1.8 × stopping distance or under 8 s away |
| Advisory | confirmed under 30 s; potential or noticed under 25 s; predicted within 300 m at night or in rain |
| Info | everything else in the horizon |

A threat reported only by this car's own cabin monitor is never put in this driver's own feed.

## Tests

`engine.test.ts` covers: single new reporter is only noticed; two dashcams confirm; repeated reports from one device count once; a second phone raises confidence; confirmed pedestrians resolve and never read as possible while decaying; weak unconfirmed reports fade; passing cars resolve static hazards; operator repair and reopen; far hazards stay separate; future observations are ignored; swerve clusters need three distinct cars and merge with a barricade report; lane mapping; critical tiering; dropped threats; wet stopping distance.
