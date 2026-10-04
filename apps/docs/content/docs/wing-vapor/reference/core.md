---
title: Core
description: "WingVaporCore, the plain three.js class, its options and methods."
---

## `WingVaporCore`

```ts
import { WingVaporCore } from "@aeronautic/wing-vapor";

const vapor = new WingVaporCore(options);
scene.add(vapor.mesh);
```

It needs three's `WebGPURenderer` (either backend) and reads the scene's
depth, so the vapor stops at the wing it sits on.

### Options

Every group is over its defaults.

| option      | type                     | what it is                                                               |
| ----------- | ------------------------ | ------------------------------------------------------------------------ |
| `airframe`  | `Partial<VaporAirframe>` | The wing and body.                                                       |
| `flight`    | `Partial<VaporFlight>`   | What it is doing.                                                        |
| `air`       | `Partial<VaporAir>`      | The day.                                                                 |
| `look`      | `Partial<VaporLook>`     | How it is lit and photographed.                                          |
| `effects`   | `Partial<VaporEffects>`  | Which phenomena to draw. Compiled in.                                    |
| `object`    | `Object3D \| null`       | What it follows. None: the world's origin, or wherever `frame` puts it.  |
| `frame`     | `WingVaporFrame`         | `position`, `forward` and `up` of the airframe on what it follows.       |
| `shape`     | `WingShape \| null`      | The wing as a table, from `capture_airframe`, in place of the trapezoid. |
| `max_steps` | `number`                 | The most iterations a pixel's march may take. 160 by default.            |

### Fields

| field                                          | type                       | what it is                                                 |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `mesh`                                         | `Mesh`                     | The mesh to put in the scene.                              |
| `uniforms`                                     | `VaporUniforms`            | The uniforms the material is driven by.                    |
| `object`                                       | `Object3D \| null`         | What it follows. Writable.                                 |
| `time_scale`                                   | `number`                   | How fast the moisture's clock runs, 1 being real time.     |
| `state`                                        | `Readonly<VaporState>`     | Everything it is drawn from: the air, the lift, the field. |
| `airframe`, `flight`, `air`, `look`, `effects` | `Readonly<…>`              | The dials as they are now.                                 |
| `shape`                                        | `Readonly<WingShape>`      | The wing being drawn, as a table.                          |
| `frame_options`                                | `Readonly<WingVaporFrame>` | The frame, as last set.                                    |

### Methods

| method                            | what it does                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `update_flight(flight)`           | Change some of the flight and keep the rest. Cheap enough for every frame.                                   |
| `update_air(air)`                 | Change some of the day. Rewrites the condensation table: fine every frame, but not free.                     |
| `update_airframe(airframe)`       | Change some of the airframe. Rebuilds the wing's table.                                                      |
| `update_look(look)`               | Change some of the look.                                                                                     |
| `set_effects(effects)`            | Change which phenomena are drawn, over every one on. Rebuilds the material.                                  |
| `set_frame(frame)`                | Move the airframe's frame on what it follows.                                                                |
| `set_shape(shape)`                | Draw the wing from a table, or go back to the trapezoid with `null`.                                         |
| `capture(object, options?)`       | Measure a model from six depth views and fly it, all at once. Returns the `MeasuredAirframe`.                |
| `capture_async(object, options?)` | The same, a few milliseconds a frame. Takes `budget_ms` and an abort `signal` besides the capture's options. |
| `apply_capture(measured)`         | Fly a measured airframe, from a capture or `deserialize_capture`.                                            |
| `dispose()`                       | Free the GPU resources. It cannot be used afterwards.                                                        |

### Capture options

| option                      | type                      | default         | what it is                                |
| --------------------------- | ------------------------- | --------------- | ----------------------------------------- |
| `resolution`                | `number`                  | `128`           | Pixels along the longest side of the box. |
| `filter`                    | `(mesh: Mesh) => boolean` | visible meshes  | Which meshes to keep.                     |
| `position`, `forward`, `up` | `[x, y, z]`               | the vapor's own | The airframe's frame on the model.        |
