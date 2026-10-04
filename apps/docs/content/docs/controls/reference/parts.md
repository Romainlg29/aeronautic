---
title: Parts
description: "The part functions, their options, and ControlSurface and ControlAnchor."
---

Each part function takes the rig and its options, and returns a
[`ControlDrive`](../rig/#controldrive). The components are the same
functions.

| function             | kinds                                                  | `from` gives                              |
| -------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `ailerons`           | `aileron`                                              | a share of throw, −1 to 1                 |
| `elevators`          | `elevator`                                             | a share of throw                          |
| `elevons`            | `elevon`                                               | a share of throw                          |
| `stabilators`        | `stabilator`                                           | a share of throw                          |
| `canards`            | `canard`                                               | a share of throw                          |
| `rudders`            | `rudder`                                               | a share of throw                          |
| `flaps`              | `flap`                                                 | a share of travel, 0 to 1                 |
| `leading_edge_flaps` | `le_flap`                                              | degrees, leading edge down                |
| `airbrakes`          | `airbrake`                                             | a share of travel                         |
| `spoilers`           | `spoiler`                                              | a share of travel                         |
| `drag_rudders`       | `drag_rudder`                                          | a share of travel                         |
| `cockpit`            | `stick_pitch`, `stick_roll`, `pedal`, `throttle_lever` | a share of throw; of travel for the lever |
| `gear`               | `gear`, `gear_door`, `gear_lever`, the clip            | how far down, 0 to 1                      |

`combine_drives(drives)` makes several drives one.

## `PartOptions`

| option   | type                               | what it does                                  |
| -------- | ---------------------------------- | --------------------------------------------- |
| `parts`  | `string[]`                         | These parts, whatever their kind.             |
| `group`  | `string`                           | A rig group, whatever its kind.               |
| `side`   | `"left" \| "right" \| "centre"`    | Only this side.                               |
| `filter` | `(part) => boolean`                | Keep only the parts this passes.              |
| `from`   | `(flight, part) => number \| null` | The command, in the terms of the table above. |
| `rate`   | `number`                           | In the part's unit a second.                  |
| `onMove` | `(value, part) => void`            | Called in the frame a part moves.             |

`TailOptions` adds `pitchShare`, 0.6 by default.
`LeadingEdgeFlapOptions` adds `startDeg` (2) and `perDeg` (1.4).
`CockpitOptions` adds `throttle`, a function of the flight.

## `GearOptions`

| option   | type                            | what it does                                                                                                    |
| -------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `side`   | `"left" \| "right" \| "centre"` | Only this side's gear.                                                                                          |
| `from`   | `(flight) => number`            | How far down, 0 up to 1 down. The flight's `gear` by default.                                                   |
| `rate`   | `number`                        | In the parts' unit a second.                                                                                    |
| `onMove` | `(value, part) => void`         | Called in the frame a part moves.                                                                               |
| `clip`   | `string \| RegExp \| false`     | The retraction clip. By default one named for the gear and `retract`, `stow` or `up`. `false` drives the parts. |

## `ControlSurface`

| field                            | what it is                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| `name`                           | The node's name.                                                |
| `kind`                           | Its `SurfaceKind`.                                              |
| `node`                           | The node that moves.                                            |
| `motion`                         | `rotation` or `translation`, about or along the node's local X. |
| `unit`                           | `deg`, `rad`, `m` or `normalized`.                              |
| `scale`                          | Radians or metres per unit.                                     |
| `min`, `max`                     | Its limits, in its unit.                                        |
| `rest`                           | The value it was posed at when found.                           |
| `side`                           | `left`, `right` or `centre`.                                    |
| `group`                          | The rig's group, or the kind's name.                            |
| `positive`                       | What a positive value does.                                     |
| `foundBy`                        | `rig`, `name` or `virtual`.                                     |
| `extras`                         | Everything else its extras said.                                |
| `basePosition`, `baseQuaternion` | The pose at zero, which values are measured from.               |

`SurfaceKind` is one of `aileron`, `elevator`, `elevon`, `stabilator`,
`canard`, `rudder`, `flap`, `le_flap`, `airbrake`, `spoiler`, `drag_rudder`,
`nozzle_pitch`, `nozzle_yaw`, `nozzle_petal`, `gear`, `gear_door`,
`gear_lever`, `stick_pitch`, `stick_roll`, `pedal`, `throttle_lever` or
`other`.

## `ControlAnchor`

| field    | what it is                                             |
| -------- | ------------------------------------------------------ |
| `name`   | The node's name.                                       |
| `kind`   | Its `fx_kind`, or its name after `FX_`, in snake case. |
| `side`   | `left`, `right` or `centre`.                           |
| `node`   | The node.                                              |
| `extras` | Everything else its extras said.                       |

## Finding them yourself

| function                       | what it does                                                  |
| ------------------------------ | ------------------------------------------------------------- |
| `find_surfaces(root, options)` | The parts of a model, as a rig would find them.               |
| `find_anchors(root, options)`  | Its anchors.                                                  |
| `pose_surface(surface, value)` | Pose a part at a value, in its unit.                          |
| `surface_kind(name)`           | What kind a name is.                                          |
| `name_side(name)`              | Which side a name says, or `null`.                            |
| `fit_hinge(points, leading?)`  | The hinge line along a panel's forward edge, or its aft edge. |
