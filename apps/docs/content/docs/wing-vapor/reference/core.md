---
title: Core
description: "WingVapor, the plain three.js class, its options and methods."
---

## `WingVapor`

```ts
import { WingVapor } from "@aeronautic/wing-vapor";

const vapor = new WingVapor(options);
scene.add(vapor.mesh);
```

It needs three's `WebGPURenderer` (either backend) and reads the scene's
depth, so the vapor stops at the wing it sits on.

### Options

Every group is over its defaults.

| option     | type                                        | what it is                                                                                             |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `airframe` | `Partial<VaporAirframe>`                    | The wing and body.                                                                                     |
| `flight`   | `Partial<VaporFlight>`                      | What it is doing.                                                                                      |
| `air`      | `Partial<VaporAir>`                         | The day.                                                                                               |
| `look`     | `Partial<VaporLook>`                        | How it is lit and photographed.                                                                        |
| `effects`  | `Partial<VaporEffects>`                     | Which phenomena to draw. Compiled in.                                                                  |
| `object`   | `Object3D \| null`                          | What it follows. None: the world's origin, or wherever `frame` puts it.                                |
| `frame`    | `WingVaporFrame`                            | `position`, `forward` and `up` of the airframe on what it follows.                                     |
| `shape`    | `WingShape \| null`                         | The wing as a table, from `capture_airframe`, in place of the trapezoid.                               |
| `quality`  | `VaporQualityName \| Partial<VaporQuality>` | The most iterations a pixel's march may take. `"high"`, 160, by default; `setQuality` changes it live. |

### Fields

| field                                          | type                       | what it is                                                 |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `mesh`                                         | `Mesh`                     | The mesh to put in the scene.                              |
| `uniforms`                                     | `VaporUniforms`            | The uniforms the material is driven by.                    |
| `object`                                       | `Object3D \| null`         | What it follows. Writable.                                 |
| `timeScale`                                    | `number`                   | How fast the moisture's clock runs, 1 being real time.     |
| `state`                                        | `Readonly<VaporState>`     | Everything it is drawn from: the air, the lift, the field. |
| `airframe`, `flight`, `air`, `look`, `effects` | `Readonly<…>`              | The dials as they are now.                                 |
| `shape`                                        | `Readonly<WingShape>`      | The wing being drawn, as a table.                          |
| `frameOptions`                                 | `Readonly<WingVaporFrame>` | The frame, as last set.                                    |

### Methods

| method                           | what it does                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `updateFlight(flight)`           | Change some of the flight and keep the rest. Cheap enough for every frame.                                  |
| `updateAir(air)`                 | Change some of the day. Rewrites the condensation table: fine every frame, but not free.                    |
| `updateAirframe(airframe)`       | Change some of the airframe. Rebuilds the wing's table.                                                     |
| `updateLook(look)`               | Change some of the look.                                                                                    |
| `setEffects(effects)`            | Change which phenomena are drawn, over every one on. Rebuilds the material.                                 |
| `setFrame(frame)`                | Move the airframe's frame on what it follows.                                                               |
| `setQuality(quality?)`           | Change the quality, a name or `{ maxSteps }`. Live: no rebuild.                                             |
| `setShape(shape)`                | Draw the wing from a table, or go back to the trapezoid with `null`.                                        |
| `capture(object, options?)`      | Measure a model from six depth views and fly it, all at once. Returns the `MeasuredAirframe`.               |
| `captureAsync(object, options?)` | The same, a few milliseconds a frame. Takes `budgetMs` and an abort `signal` besides the capture's options. |
| `applyCapture(measured)`         | Fly a measured airframe, from a capture or `deserialize_capture`.                                           |
| `dispose()`                      | Free the GPU resources. It cannot be used afterwards.                                                       |

### Capture options

| option                      | type                      | default         | what it is                                |
| --------------------------- | ------------------------- | --------------- | ----------------------------------------- |
| `resolution`                | `number`                  | `128`           | Pixels along the longest side of the box. |
| `filter`                    | `(mesh: Mesh) => boolean` | visible meshes  | Which meshes to keep.                     |
| `position`, `forward`, `up` | `[x, y, z]`               | the vapor's own | The airframe's frame on the model.        |
