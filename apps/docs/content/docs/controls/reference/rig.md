---
title: ControlRig
description: "The rig: its parts, its drives, its clips, and moving it by hand."
---

```ts
import { ControlRig } from "@aeronautic/controls";

const rig = new ControlRig(gltf.scene, {
  animations: gltf.animations,
  source: flight,
});
```

## `ControlRigOptions`

| option          | type                          | default    | what it does                                                          |
| --------------- | ----------------------------- | ---------- | --------------------------------------------------------------------- |
| `animations`    | `AnimationClip[]`             | —          | The clips, scrubbed by `drive_clip` or `set_clip`.                    |
| `source`        | `Flight \| null`              | `null`     | The flight its drives read. `null` moves only what is set by hand.    |
| `rates`         | `Partial<ControlRates>`       | —          | How fast each kind moves, over the defaults.                          |
| `settle`        | `boolean`                     | `true`     | Jump to the flight's pose on the first read.                          |
| `rig`           | `boolean`                     | `true`     | Read `CTRL_` nodes' extras.                                           |
| `names`         | `boolean`                     | `true`     | Find parts by name where there is no rig. It changes the scene graph. |
| `filter`        | `(node: Object3D) => boolean` | —          | Leave nodes out.                                                      |
| `forward`, `up` | `[x, y, z]`                   | `-Z`, `+Y` | Which way the model faces.                                            |

## Members

| member                         | what it is                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `root`                         | The model.                                                                                       |
| `surfaces`                     | Every part found.                                                                                |
| `anchors`                      | Every anchor found.                                                                              |
| `clips`                        | The clips, by name: `{ clip, action }`.                                                          |
| `source`                       | The flight read. Writable.                                                                       |
| `rates`                        | The rate of each kind. Call `refresh()` after writing it.                                        |
| `surface(name)`                | A part by name.                                                                                  |
| `anchor(name)`                 | An anchor by name.                                                                               |
| `value(name)`                  | Where a part is now, in its unit.                                                                |
| `drive(options)`               | Add a drive. Returns a `ControlDrive`.                                                           |
| `drive_clip(options)`          | Add a clip's drive. Returns a `ControlDrive`.                                                    |
| `set(name, value)`             | Move a part by hand, in its unit, clamped. `null` gives it back.                                 |
| `set_group(group, share)`      | Move a rig group, or a kind, by hand, 0 to 1 of its travel. `null` gives it back.                |
| `set_clip(name, share, rate?)` | Scrub a clip by hand, 0 to 1, at `rate` shares a second or the clip's own. `null` gives it back. |
| `on_moved(listener)`           | Called after anything moved, once a frame at most. Returns what stops it.                        |
| `add_surface(surface)`         | Add a part made by code.                                                                         |
| `remove_surface(name)`         | Take a part away.                                                                                |
| `refresh()`                    | Read every drive's options again.                                                                |
| `update(delta_s)`              | Move everything one frame on.                                                                    |
| `dispose()`                    | Stop the clips. The parts stay where they are.                                                   |

## `DriveOptions`

Which parts, and where each should be.

| option    | type                               | what it does                                                      |
| --------- | ---------------------------------- | ----------------------------------------------------------------- |
| `parts`   | `string[]`                         | The parts by name.                                                |
| `group`   | `string`                           | A rig group, as `elevons`.                                        |
| `kinds`   | `SurfaceKind[]`                    | Kinds of part, as `["aileron"]`.                                  |
| `side`    | `"left" \| "right" \| "centre"`    | Narrows any of them.                                              |
| `filter`  | `(part) => boolean`                | Keep only the parts this passes.                                  |
| `from`    | `(flight, part) => number \| null` | Where the part should be, in its unit, clamped. `null` leaves it. |
| `rate`    | `number`                           | In the part's unit a second, over the rig's rate for its kind.    |
| `on_move` | `(value, part) => void`            | Called in the frame a part moves.                                 |

With none of `parts`, `group` and `kinds`, a drive is for every part.

## `ClipDriveOptions`

| option    | type                               | what it does                                                  |
| --------- | ---------------------------------- | ------------------------------------------------------------- |
| `clip`    | `string \| RegExp`                 | The clip, by name or a pattern its name matches.              |
| `side`    | `"left" \| "right" \| "centre"`    | Only the clips whose name says this side.                     |
| `from`    | `(flight, clip) => number \| null` | How far through, 0 to 1. `null` leaves it.                    |
| `rate`    | `number`                           | Shares of the clip a second. By default, the clip's own time. |
| `on_move` | `(position, clip) => void`         | Called in the frame it moves.                                 |

## `ControlDrive`

| member      | what it does                                                         |
| ----------- | -------------------------------------------------------------------- |
| `parts`     | The parts it claimed, whether or not a more specific drive won them. |
| `refresh()` | Read its options again.                                              |
| `dispose()` | Stop: its parts go to the next drive that claims them, or rest.      |

## Rates

`default_control_rates`, in each kind's unit a second:

| kind                                 | rate     |
| ------------------------------------ | -------- |
| aileron, rudder, spoiler             | 80       |
| elevator, elevon, stabilator, canard | 60       |
| drag_rudder, gear_door               | 60       |
| airbrake                             | 40       |
| nozzle_pitch, nozzle_yaw             | 40       |
| le_flap                              | 30       |
| gear                                 | 30       |
| nozzle_petal                         | 20       |
| flap                                 | 10       |
| levers, stick, pedals, other         | Infinity |

`selects(select, part)` says whether a `DriveSelect` takes a part.
