# Scenarios

The prototype plays one 48 s loop at a time. Choose it from the chip next to the brand on any surface, or from the command palette (Ctrl K, "scenario"). The choice rides on the shared clock, so every linked device switches, and the loop restarts from its first second.

Each scenario is a script in [app/src/world/scenarios.ts](../app/src/world/scenarios.ts): a real road from the OSM extract, where your car starts, how it drives, what is on the road, and every sensor report with its time. Tests in [scenarios.test.ts](../app/src/world/scenarios.test.ts) check, for each one, that your car never passes through anything over the whole loop, and that every hazard it describes is confirmed by the fusion engine from its own evidence.

| Scenario | Road | Hour | What goes wrong | How the network finds it |
|---|---|---|---|---|
| Night on JVLR: someone behind the bus | JVLR | Night | Pedestrian behind a stopped bus; unmapped barricade; pothole; fallen branch already cleared | Car ahead, oncoming car, then your camera; resident plus swerves plus a dashcam; passing cars vote the branch away |
| Monsoon: water hides an open manhole | Adi Shankaracharya Marg, by Powai Hospital | Dusk, rain | Knee-deep water; a car stalled in it; an open manhole under the water | Resident photo, a wheel slip, a dashcam; swerves and the car ahead; a resident report, then two cars drop a wheel into it |
| School morning: children behind the school bus | Orchard Avenue, Hiranandani | Day | Children crossing from behind a stopped school bus; double-parked van; unpainted speed breaker | Crossing guard app, car ahead, your camera; swerves, a dashcam and a resident; three cars' accelerometers over two days plus a dashcam |
| Late night: cattle in the lane, a rider against the traffic | JVLR, eastern stretch | Night | Two cows off the median in lane 3; a motorcycle riding the wrong way in the kerb lane | A resident, swerves, the car ahead and an oncoming car; the car ahead tracks the rider, swerves, and a city camera |
| Morning rush: a crash ahead | Adi Shankaracharya Marg, northbound | Day | Two cars collide in lane 2; glass and a bumper on the road; lane closed, then cleared | A wall of harsh braking; two dashcams and a resident; traffic police close the lane; the tow truck clears it |

What changes per scenario: the route, the time of day and rain, background traffic (lanes, two-way roads, queues behind a closed lane), what stands on the road (bus, stalled cars with flashing hazards, cows, a wrong-way rider, crossing children, standing water, an open manhole, a speed breaker, crash debris), the cockpit's lane advice, the command palette's story moments, and film mode's six shots.

## Ideas for the next scenarios

Each is a new script on the same engine and roads.

- **Ambulance at rush hour:** an ambulance's phone shares its route; cars ahead on JVLR are told to keep left as it approaches. Ops sees its arrival time.
- **Signal failure in the rain:** a junction goes dark in a power cut; traffic police take over; cars are told by lane which way is moving.
- **Crew working in the lane at night:** a repair crew's work order becomes a geofence; cars slow before the cones; passing cars confirm the lane is clear afterwards.
- **Ganpati procession:** a road closes for the evening; the crowd spills off the footpath; routes are checked against the closure.
- **Two-wheeler on a broken service road:** potholes felt by phones in riders' pockets, warned by voice rather than screen.
- **Fallen tree after a storm:** a whole road blocked; the risk model and reports reroute traffic before it queues.
- **Wrong-way bus at dawn:** a bus cutting through against a one-way, seen by a city camera and two cars.
