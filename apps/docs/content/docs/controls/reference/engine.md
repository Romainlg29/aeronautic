---
title: Engine
description: "EngineOptions, the Engine class, add_engine and engine_sides."
---

```ts
import { add_engine, engine_sides } from "@aeronautic/controls";

const engines = engine_sides(rig).map((side) => add_engine(rig, { side }));
```

## `EngineOptions`

| option      | type                            | default                   | what it does                                                                                                         |
| ----------- | ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `side`      | `"left" \| "right" \| "centre"` | every nozzle              | The engine on this side.                                                                                             |
| `throttle`  | `(flight) => number`            | the flight's              | Its throttle, 0 idle to 1.1 full reheat.                                                                             |
| `vectoring` | `boolean \| { pitch?, yaw? }`   | on with a gimbal          | Turn the nozzle with the stick and the pedals. Numbers cap each axis in degrees, or give a model with no gimbal one. |
| `pitch`     | `(flight) => number`            | the stick's               | What it vectors for in pitch, −1 to 1, nose up positive.                                                             |
| `yaw`       | `(flight) => number`            | the pedals'               | What it vectors for in yaw, −1 to 1, nose right positive.                                                            |
| `nozzle`    | `Partial<NozzleSchedule>`       | 0.45, 0, 1                | How open the petals are at idle, military and reheat.                                                                |
| `anchor`    | `Object3D \| string`            | its side's exhaust anchor | Where the exhaust leaves.                                                                                            |
| `rate`      | `number`                        | 40                        | How fast the gimbal turns, in degrees a second.                                                                      |
| `on_vector` | `(pitch_deg, yaw_deg) => void`  | —                         | Called in the frame the nozzle turns, with where the exhaust points: up and right of aft.                            |

## `Engine`

| member      | what it is                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------ |
| `rig`       | The rig.                                                                                   |
| `side`      | Its side, or `null` for one that took every nozzle.                                        |
| `anchor`    | Where its plume goes: the exhaust, or the mount inside a gimbal put in by code.            |
| `parts`     | `{ pitch, yaw, petals }`, its nozzle's parts.                                              |
| `clip`      | The model's clip that opens its nozzle, if any.                                            |
| `vectoring` | `{ pitch, yaw, shape, gimbal }`: limits, `ellipse` or `box`, `model`, `virtual` or `null`. |
| `extras`    | What the model says of its gimbal and exhaust, as `limit_shape`.                           |
| `throttle`  | Its throttle, a function of the flight, for an afterburner to follow.                      |
| `pitch_deg` | Where the exhaust points now, up of aft.                                                   |
| `yaw_deg`   | And right of aft.                                                                          |
| `refresh()` | Read its options again.                                                                    |
| `dispose()` | Stop driving, and take a virtual gimbal out.                                               |

`add_engine(rig, options)` is `new Engine(rig, options)`.

`engine_sides(rig)` gives the sides with an engine of their own, from the
model's nozzle parts and exhaust anchors: `["left", "right"]` for a twin,
`[undefined]` for a single engine on the centre line, `[]` for none.

## `fighter_controls`

`fighter_controls(rig, { pitch_share?, engine? })` drives every part and adds
an engine for each side. It returns a drive with `engines` on it.
