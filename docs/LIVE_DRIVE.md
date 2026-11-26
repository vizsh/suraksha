# Live drive mode (planned, not built yet)

How to take SuRaksha Mesh from the scripted Powai demo into a real car. Kept ready for later; nothing here is implemented yet.

## Data sources available today

| Source | Needs | Gives | Status |
|---|---|---|---|
| Phone on the dashboard | Phone, dashboard mount, car charger, mobile data | Camera (Dashcam AI), accelerometer (bumps, harsh braking), GPS (position, speed, heading) | Sensing exists; needs live mode below |
| OBD-II dongle | Bluetooth Low Energy ELM327-class adapter (for example Vgate iCar Pro BLE, OBDLink CX), about ₹1,000 to 3,000 | Speed, RPM, throttle, engine load (standard PIDs) | To build: Web Bluetooth reader (Chrome on Android; not iOS) |
| Car head unit | Android Auto or Apple CarPlay | Alerts on the dashboard display | Needs a native app: Android Car App Library with Android Auto developer mode for personal testing; CarPlay needs an Apple entitlement |
| Suzuki Connect telematics | Data partnership with Maruti Suzuki | Fleet-wide harsh braking, location, events | Partnership only |

Brake pedal position and steering angle are manufacturer-specific on OBD-II; harsh braking and swerves come from phone motion and GPS speed instead.

## Work to do

1. **Real ego state:** GPS position, speed and heading drive the driver feed; the scripted scenario is off in live mode.
2. **Anywhere, not just Powai:** fetch OSM roads around the current position on the fly (Overpass, cached by tile); store events in latitude and longitude; route-relative relevance from the OSRM route or the current road.
3. **Screen Wake Lock** so the page does not sleep mid-drive; keep frame processing modest to limit heat.
4. **OBD-II reader** over Web Bluetooth (read-only standard PIDs; never send write commands).
5. **Deploy** on Vercel with Upstash Redis so the car phone and other devices share one live picture.
6. **Accuracy:** record drives, label a few hundred frames, measure Dashcam AI; replace zero-shot CLIP with a model fine-tuned on RDD2022 (road damage, including Indian roads), exported to ONNX for onnxruntime-web on WebGPU.

Estimate: one to two focused days for 1 to 5; 6 is a separate data project.

## Requirements checklist

- Android phone with Chrome (best: Web Bluetooth and motion sensors); iPhone works for camera and motion only.
- Dashboard or windshield mount angled at the road, car charger.
- Mobile data: about 100 MB once for the AI model, then little.
- Free Vercel account; free Upstash Redis for cross-device sharing.
- Optional BLE OBD-II dongle.

## Safety and legal

Set everything up before driving and never operate the phone while driving; a passenger operates it. Hands-free mounted use for navigation is generally permitted; handling a phone while driving is penalised. Video stays on the phone; only hazard type, confidence and position are shared.
