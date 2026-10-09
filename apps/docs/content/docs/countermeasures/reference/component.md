---
title: "<Countermeasures>"
description: "Every prop of the component."
---

`<Countermeasures>` takes every `<group>` prop, and these:

| prop       | type                                  | what it is                                                                              |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `airframe` | `Partial<CountermeasuresAirframe>`    | Where the dispensers are. Compared array by array: keep it in a memo.                   |
| `flare`    | `FlareName \| Partial<Flare>`         | The flare: a make's name, or fields over the MJU-7's.                                   |
| `program`  | `Partial<Program>`                    | What firing lets go.                                                                    |
| `flight`   | `Partial<CountermeasuresFlight>`      | How the aircraft moves through the air.                                                 |
| `air`      | `Partial<CountermeasuresAir>`         | The altitude and the day's visibility.                                                  |
| `look`     | `Partial<CountermeasuresLook>`        | The exposure, and the eye the glare is for.                                             |
| `fire`     | `number`                              | Fires the program each time it changes. Its first value fires nothing.                  |
| `target`   | `Object3D \| null`                    | Sit on this object rather than where the component is. `position` is then in its frame. |
| `forward`  | `[x, y, z]`                           | Which way the aircraft flies, in the group's frame. -Z by default.                      |
| `up`       | `[x, y, z]`                           | Which way is up for it. +Y by default.                                                  |
| `quality`  | `CountermeasuresQualityName \| {...}` | How many flares are drawn and light the scene: `low`, `medium`, `high` or `ultra`.      |
| `source`   | `Flight \| null`                      | A shared flight for the airspeed, the angles, the altitude and the air's density.       |
| `ref`      | `Ref<CountermeasuresHandle>`          | The `Countermeasures` itself: `fire`, `release`, `stop`, `clear`, `burning`, `pending`. |
