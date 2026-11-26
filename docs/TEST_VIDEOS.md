# Test footage for Dashcam AI

Real driving video to feed the Dashcam AI page (`/dashcam`, **Open a video or photo**). Use the speed buttons (0.5× to 16×) to scan a long drive, and the timeline ticks to jump to each hazard it reported.

**How these were chosen:** by web search, on title and description. I could not watch them, so check each one before relying on it in a demo. Durations are not confirmed.

**Getting a file:** the page needs a video file, not a YouTube link. YouTube's terms do not allow downloading except through YouTube's own features, so for a public demo use footage you are licensed to use: your own phone drive, a stock clip you have rights to, or a research dataset. For private testing, a download tool such as `yt-dlp` saves a file; whether that is allowed for a given video is for you to judge.

## What the page detects, and what to look for in footage

| Detector | Finds | Best footage |
|---|---|---|
| Objects (EfficientDet-Lite0, every frame) | People, cows, dogs, horses, sheep in the road-ahead zone | Dense city streets, markets, village roads |
| Road surface (CLIP, every 1.5 s, load it first) | Potholes, barricades, cones, waterlogging, clear road | Broken roads, monsoon flooding, road works |

## Long city drives: pedestrians, autos, two-wheelers

- [Mumbai 4K, Driving Downtown](https://www.youtube.com/watch?v=jJW_x8ACDPI): a long uncut city drive, typical of the channel's hour-long format. A good all-round first test.
- [Driving Mumbai City, 4K HDR, Fort to Lower Parel](https://www.youtube.com/watch?v=heNxm9u6ng8): dense South Mumbai streets.
- [Eastern Express Highway 4K, Driving Mumbai City](https://www.youtube.com/watch?v=mGkdRFMgjfg): faster arterial road, close to Powai.
- [Mumbai 4K Drive playlist](https://www.youtube.com/playlist?list=PLDzhOM8QcYogcy3ybmD8A3D9-C4vtWDLZ): several city and coastal-road drives.
- [4K Night Drive in Mumbai](https://www.youtube.com/watch?v=4H12fjbtdUA): night, for testing detection in low light.

## Potholes and broken roads

- [Adilabad to Nagpur NH7 dashcam, bad road](https://www.youtube.com/watch?v=RXtGQaszbpI): a four-lane road that breaks up into a rough stretch.
- [POV car driving on India's worst road](https://www.youtube.com/watch?v=KIxvFf07QC8)
- [India's pothole problem: cameras capture chaos on roads](https://www.youtube.com/watch?v=zU8nehRItoI): short, many potholes in frame.
- [Potholes or death traps? India's worst roads](https://www.youtube.com/watch?v=t9TPNGhzVso): motorcycle POV, also has cows, monkeys and wrong-side traffic.

## Animals on the road

- [Cows on the road, Madhya Pradesh](https://www.youtube.com/watch?v=ohzadsfv3Z4): cattle surrounding the car on a highway.
- [Cows in traffic, India](https://www.youtube.com/watch?v=keXP2ghS1iA): cows crossing in fast, heavy traffic.
- [Cow spotting in India](https://www.youtube.com/watch?v=LvXRpjHA4PI): braking for a cow resting mid-highway.
- [POV: driving in India can be hazardous to your health](https://www.youtube.com/watch?v=GvaxnpNxRxg): cows and trucks sharing a highway.

## Monsoon and waterlogging

- [4K driving in rain on Palm Beach Road, Navi Mumbai](https://www.youtube.com/watch?v=lCQmuzfmKQo)
- [Rainy morning POV drive](https://www.youtube.com/watch?v=MmAmbbJhAUE)
- [Mumbai monsoon: extreme rain rips through roads](https://www.youtube.com/watch?v=njEZQWEbUHY): news footage, flooded roads (not dashcam POV).

## Channels to browse for more

- [Caught on Dashcam India](https://www.youtube.com/c/DashCamIndian/videos): drives across India's highways and expressways.
- [Lazy Drive](https://www.youtube.com/channel/UCkCn9xn-yYP89qDpickXrsA): dashcam clips of everyday Indian traffic.
- [POV Driving India playlist](https://www.youtube.com/playlist?list=PLA0JOk6HQWtSTbgZ6nUUnE-R14oJtq9EA): highways and city roads.

## Research datasets (licensed for research use)

- [India Driving Dataset (IDD)](https://idd.insaan.iiit.ac.in/), IIIT Hyderabad: front-camera sequences from Hyderabad and Bangalore, with labels. Needs a free account.
- [iWatchRoad](https://arxiv.org/abs/2508.10945): over 7,000 dashcam frames of Indian potholes, for checking the road-surface model frame by frame.

## Suggested test runs

1. **A long city drive at 4×.** Load the road-surface model first. Watch the timeline fill with ticks, then jump back to each one at 1× to judge whether it was right.
2. **A pothole video at 1×.** Note how many potholes are reported against how many you count. Reports need a few consistent frames and then cool down for 10 s of video, so a cluster of potholes is one report.
3. **A cattle video at 2×.** Objects are checked every frame, so animals are rarely missed even when sped up.
4. **The same clip at 1× and at 8×.** Compare the ticks. Faster playback gives the models fewer looks at each second of road, so brief hazards can drop out.
