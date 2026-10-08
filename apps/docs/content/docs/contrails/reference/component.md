---
title: Component
description: "<Contrails>, its props and its ref, and the class underneath."
---

## `<Contrails>`

One aircraft's contrails, following the group it is. Takes every `<group>`
prop (`position`, `rotation`, `scale`, children…), plus:

| prop       | type                                                          | default                     | what it does                                                                                                |
| ---------- | ------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `airframe` | `Partial<ContrailAirframe>`                                   | the docs' fighter           | The mass, span, lift-to-drag, fuel consumption, and the engines.                                            |
| `flight`   | `Partial<ContrailFlight>`                                     | 250 m/s, level              | How fast, at what angles and what load.                                                                     |
| `air`      | `Partial<ContrailAir>`                                        | 11 km, standard, 66 %       | The altitude, the day and its humidity over water.                                                          |
| `look`     | `Partial<ContrailLook>`                                       | a bright day                | The sun and the sky.                                                                                        |
| `fuel`     | `"kerosene" \| "hydrogen" \| ContrailFuel`                    | `"kerosene"`                | What it burns.                                                                                              |
| `lengthS`  | `number`                                                      | `60`                        | How many seconds of trail to draw. Changes live.                                                            |
| `target`   | `Object3D \| null`                                            | —                           | Sit on this object rather than where the component is in the tree. `position` is then in its frame.         |
| `forward`  | `[x, y, z]`                                                   | `[0, 0, -1]`                | Which way the aircraft flies, in the group's frame.                                                         |
| `up`       | `[x, y, z]`                                                   | `[0, 1, 0]`                 | Which way is up for it.                                                                                     |
| `quality`  | `"low" \| "medium" \| "high" \| "ultra" \| { points, puffs }` | `"high"`                    | Ages the plume is worked out at and the most puffs on each trail: 64/2048, 112/4096, 160/8192 or 256/16384. |
| `source`   | `Flight \| null`                                              | nearest provider            | A shared flight: its airspeed, angles, load, altitude, day and humidity win over `flight` and `air`.        |
| `pass`     | `VolumePass \| null`                                          | nearest `VolumePassContext` | Draw the trails in core's `volume_pass`. `null` draws in the scene.                                         |
| `ref`      | `ContrailsHandle`                                             | —                           | The trails themselves, to drive every frame or read their state.                                            |

`airframe`, `flight`, `air` and `look` are compared field by field, so an
inline object is fine. The group's origin is the aircraft's reference point:
every engine given as a position is measured from it.

## The class

`ContrailsHandle` is the `Contrails` class from the package root, the same
one [without React](../../guides/without-react/).

```ts
new Contrails(options?: ContrailsOptions)
```

`ContrailsOptions` takes `airframe`, `flight`, `air`, `look`, `fuel`,
`lengthS`, `quality` and `source` as the props do, plus:

| option     | what it is                                                                |
| ---------- | ------------------------------------------------------------------------- |
| `object`   | The object it follows. Without one, `frame` is in world space.            |
| `frame`    | `{ position, forward, up }`: where the reference point is in that object. |
| `backdrop` | core's `SceneBackdrop`, when the trails are drawn in a pass of their own. |

| member                     | what it does                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| `mesh`                     | What to add to the scene. Places itself every frame.                |
| `state`                    | What the physics made of the day. See below.                        |
| `updateFlight(flight)`     | Change the flight. Cheap: call it every frame.                      |
| `updateAir(air)`           | Change the day.                                                     |
| `updateAirframe(airframe)` | Change the aircraft. A different number of engines rebuilds.        |
| `setFuel(fuel)`            | Change the fuel.                                                    |
| `updateLook(look)`         | Change the light.                                                   |
| `setLength(seconds)`       | Draw more or less trail. Rebuilds.                                  |
| `setQuality(quality)`      | Change the points and puffs. Rebuilds.                              |
| `setFrame(frame)`          | Move the reference point, or change which way is forward and up.    |
| `reset()`                  | Forget the path flown, after a jump or a pause.                     |
| `dispose()`                | Free the geometry, the material and the texture.                    |
| `object`, `source`         | The object followed and the shared flight read. Settable.           |
| `timeScale`                | How fast the trails' time runs against the frames'. `1` by default. |

`airframe`, `flight`, `air`, `look`, `fuel` and `lengthS` read back what it
holds.

### `state`

| field            | type                | what it is                                                      |
| ---------------- | ------------------- | --------------------------------------------------------------- |
| `air`            | `MoistAir`          | The day's air, from core.                                       |
| `iceHumidity`    | `number`            | Its humidity over ice. Over 1, the trail persists.              |
| `criterion`      | `ContrailFormation` | `forms`, `slopePaPerK`, `tangentK` and `thresholdK`.            |
| `formation`      | `PlumeFormation`    | The dilutions at which the plume saturates, and freezes.        |
| `efficiency`     | `number`            | How much of the fuel's heat pushes the aircraft.                |
| `fuelPerMetreKg` | `number`            | Each engine's fuel burnt per metre flown.                       |
| `wake`           | `Wake`              | The vortex pair: spacing, circulation, descent, stratification. |
| `visible`        | `boolean`           | Whether a trail forms.                                          |
| `persistent`     | `boolean`           | Whether it lasts.                                               |

The defaults of every dial are on [Dials](../dials/).
