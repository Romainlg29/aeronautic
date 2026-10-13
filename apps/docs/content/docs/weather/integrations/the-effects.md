---
title: The other effects
description: "The plumes, the vapour, the contrails, the lights and the countermeasures, flying in the weather's air and drawn in its cloud."
---

The weather works with the other packages through two things they already
read, so none of them needs to know it is there.

## The flight's air

`@aeronautic/core`'s `Flight` is the air the aircraft flies in: its
temperature, its humidity. Inside a `<FlightProvider>`, `<Weather>` writes
the climate's temperature into it every frame, and a relative humidity of 1
while the aircraft is in cloud, giving its own back as it leaves:

- **The wing vapour** condenses wherever the wing's low pressure takes
  saturated air below its dew point: in the cloud, at any angle of attack it
  pulls.
- **The contrails** persist where the air is saturated over ice, so they
  stay behind the aircraft in an ice cloud and fade in dry air.

Its `aircraft` prop is a ref to the aircraft, when it is not at the scene's
origin, for where to sample the air. `couple={false}` leaves the flight's
air alone.

## The scene's medium

Core's `set_scene_medium(scene, medium)` is a medium beside `scene.fog`: an
extinction per metre, the light it scatters per its extinction, and how
much of the sun's beam and what diffuse light gets into it. `useClouds`
sets it every frame to the cloud round the camera, and the effects draw
themselves in it:

| package           | what it does in the cloud                                       |
| ----------------- | --------------------------------------------------------------- |
| `afterburner`     | The plumes fade into it with distance.                          |
| `wing-vapor`      | The vapour fades, lit by the beam that gets in and the cloud.   |
| `contrails`       | The trails fade, lit as the vapour.                             |
| `lights`          | The navigation lights and strobes fade with distance.           |
| `countermeasures` | The flames, smoke and chaff fade, lit by the beam that gets in. |

Outside a cloud its extinction is 0, and they draw as they would without it.
`useClouds({ scene: null })` sets no medium; without React, the `scene`
option of `CloudsNode` is the same.
