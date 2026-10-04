---
title: Component
description: "<WingVapor>, its props and its ref."
---

## `<WingVapor>`

One aircraft's wing vapor, following the group it is. Takes every `<group>`
prop (`position`, `rotation`, `scale`, children…), plus:

| prop             | type                       | default            | what it does                                                                                                   |
| ---------------- | -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `airframe`       | `Partial<VaporAirframe>`   | the docs' fighter  | The wing and body. Over a measured shape, it wins for whatever it gives.                                       |
| `flight`         | `Partial<VaporFlight>`     | 300 m/s, 8°        | How fast, at what angle of attack, sideslip and roll rate.                                                     |
| `air`            | `Partial<VaporAir>`        | 300 m, +5 K, 85 %  | The altitude, the day and its humidity.                                                                        |
| `look`           | `Partial<VaporLook>`       | a bright day       | The sun, the sky, the droplets and the shutter.                                                                |
| `effects`        | `Partial<VaporEffects>`    | all on             | Which phenomena to draw. Compiled in: a change rebuilds the material.                                          |
| `target`         | `Object3D \| null`         | —                  | Sit on this object rather than where the component is in the tree. `position` is then in its frame.            |
| `forward`        | `[x, y, z]`                | `[0, 0, -1]`       | Which way the aircraft flies, in the group's frame.                                                            |
| `up`             | `[x, y, z]`                | `[0, 1, 0]`        | Which way is up for it.                                                                                        |
| `capture`        | `Object3D \| null`         | —                  | A model to measure from six depth views, a few milliseconds a frame. See [Any shape](../../guides/any-shape/). |
| `capture_filter` | `(mesh: Mesh) => boolean`  | every visible mesh | Which of its meshes to measure. Leave out the gear and the stores.                                             |
| `measured`       | `MeasuredAirframe \| null` | —                  | A capture done ahead of time, in place of `capture`.                                                           |
| `max_steps`      | `number`                   | `160`              | The most iterations one pixel's march may take.                                                                |
| `ref`            | `WingVaporCore`            | —                  | The vapor itself, to drive every frame or read its state. See [Core](../core/).                                |

`airframe`, `flight`, `air`, `look` and `effects` are compared field by field,
so an inline object is fine. The group's origin is the aircraft's reference
point: every station of `airframe` is measured from it.

The defaults of every dial are on [Dials](../dials/).
