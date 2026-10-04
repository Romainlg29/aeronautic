---
title: Choosing the parts
description: "Drive every part with ControlSurfaces, or pick them one by one inside an Airframe."
---

`<ControlSurfaces>` is two components in one: an `<Airframe>`, which finds the
model's parts and moves them, and `<FighterControls>`, which drives every
kind of part the way a fighter's are driven. Take them apart to choose.

## One by one

An `<Airframe>` alone moves nothing. Put inside it the parts that should move:

```tsx
import {
  Airframe,
  Cockpit,
  Elevons,
  Engine,
  Gear,
  Rudders,
} from "@aeronautic/controls/react";

<Airframe object={gltf.scene} animations={gltf.animations}>
  <Elevons />
  <Rudders />
  <Gear />
  <Cockpit />
  <Engine side="left" />
  <Engine side="right" />
</Airframe>;
```

A part left out rests where the model put it. A part that mounts or unmounts
takes its drive with it, so `{armed && <Airbrakes />}` works.

## The parts

| component            | kinds                                                         | from the flight                           |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `<Ailerons>`         | `aileron`                                                     | `roll`                                    |
| `<Elevators>`        | `elevator`                                                    | `pitch`                                   |
| `<Elevons>`          | `elevon`                                                      | `pitch` and `roll`, 60 % pitch by default |
| `<Stabilators>`      | `stabilator`                                                  | `pitch` and `roll`, 60 % pitch by default |
| `<Canards>`          | `canard`                                                      | `pitch`                                   |
| `<Rudders>`          | `rudder`                                                      | `yaw`                                     |
| `<Flaps>`            | `flap`                                                        | `flaps`                                   |
| `<LeadingEdgeFlaps>` | `le_flap`                                                     | `angleOfAttackRad`, and `flaps`           |
| `<Airbrakes>`        | `airbrake`                                                    | `airbrake`                                |
| `<Spoilers>`         | `spoiler`                                                     | `airbrake`                                |
| `<DragRudders>`      | `drag_rudder`                                                 | `airbrake`, and `yaw` on one side         |
| `<Gear>`             | `gear`, `gear_door`, `gear_lever`, the clip                   | `gear`                                    |
| `<Cockpit>`          | `stick_pitch`, `stick_roll`, `pedal`, `throttle_lever`        | `pitch`, `roll`, `yaw`, `throttle`        |
| `<Engine>`           | `nozzle_pitch`, `nozzle_yaw`, `nozzle_petal`, the nozzle clip | `pitch`, `yaw`, `throttle`                |

## Narrowing a part

Every part takes the same selection, to drive fewer parts than its whole kind:

| prop     | meaning                                             |
| -------- | --------------------------------------------------- |
| `side`   | only the parts on `left`, `right` or `centre`       |
| `parts`  | only these, by node name: `["CTRL_Elevon_Outer_L"]` |
| `group`  | only the parts of this rig group                    |
| `filter` | only the parts this function keeps                  |

Given `parts` or `group`, a part component takes them whatever their kind:
`<Ailerons parts={["CTRL_Elevon_Outer_L", "CTRL_Elevon_Outer_R"]} />` drives
the outer elevons as ailerons.

## When two claim one part

When several drives claim a part, the most specific wins: one naming the part,
over one naming its group, over one naming its kind. A `side` makes any of them
a little more specific, and of two as specific, the later one wins. So you can
drive everything with `<FighterControls>`, then take one part over:

```tsx
<ControlSurfaces object={gltf.scene}>
  {/* The outer elevons roll only */}
  <Elevons
    parts={["CTRL_Elevon_Outer_L", "CTRL_Elevon_Outer_R"]}
    pitchShare={0}
  />
</ControlSurfaces>
```

When a drive goes away, its parts go to the next drive that claims them, or
rest.

## Each engine

`<FighterControls>` puts an `<Engine>` on each side the model has a nozzle or
an exhaust anchor on. Its `engine` prop is given to each, and `exhaust` is put
inside each. See [Engines](../engines/).

Next, [shape how they move](../shaping-moves/).
