---
title: "<Lights>"
description: "Every prop of the component."
---

`<Lights>` takes every `<group>` prop, and these:

| prop            | type                          | what it is                                                                                                   |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `airframe`      | `Partial<LightsAirframe>`     | Where the lights are. Compared array by array: keep it in a memo.                                            |
| `switches`      | `Partial<LightsSwitches>`     | Which are on.                                                                                                |
| `navigation`    | `Partial<NavigationDials>`    | The position lights' intensity, spill and colours.                                                           |
| `anticollision` | `Partial<AntiCollisionDials>` | The beacons' and strobes' intensity, rate, flash and colours.                                                |
| `air`           | `Partial<LightsAir>`          | The altitude and the day's visibility.                                                                       |
| `look`          | `Partial<LightsLook>`         | The exposure, and the eye the glare is for.                                                                  |
| `illuminate`    | `Partial<LightsIlluminate>`   | Which lights light the scene as well as being seen.                                                          |
| `gear`          | `number`                      | The landing gear, 0 up to 1 down. Down by default.                                                           |
| `target`        | `Object3D \| null`            | Sit on this object rather than where the component is. `position` is then in its frame.                      |
| `forward`       | `[x, y, z]`                   | Which way the aircraft flies, in the group's frame. -Z by default.                                           |
| `up`            | `[x, y, z]`                   | Which way is up for it. +Y by default.                                                                       |
| `quality`       | `LightsQualityName`           | How finely the beams' light in the air is summed: `low`, `medium`, `high` or `ultra`, 8 to 48 samples a ray. |
| `source`        | `Flight \| null`              | A shared flight for the altitude, the air's density and the gear. The provider's by default.                 |
| `pass`          | `VolumePass \| null`          | Draw the beams in core's volume pass. The context's by default.                                              |
| `ref`           | `Ref<LightsHandle>`           | The `Lights` itself, to drive every frame.                                                                   |
