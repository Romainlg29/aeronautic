---
title: Rigging a model
description: "The glTF extras that say what moves, or the names that let it be found."
---

A model can be moved two ways. Rigged, it says outright what moves and how. Not
rigged, its parts are found by their names, and their hinges fitted to their
geometry. The rig is read first, and the names only for what it does not cover.

## Rigged

A part is a node with a `ctrl_type` extra. In Blender, that is a custom
property on the object, exported to glTF as its extras, which three.js hands
over as `userData`. The docs' fighter puts each one under a `HINGE_` node that
sits on the hinge, with the `CTRL_` node's local X along the hinge line.

```json
{
  "name": "CTRL_Elevon_Inner_L",
  "extras": {
    "ctrl_type": "rotation",
    "axis": "X",
    "unit": "deg",
    "min": -30,
    "max": 30,
    "rest": 0,
    "group": "elevons",
    "positive": "trailing_edge_down"
  }
}
```

| extra          | meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `ctrl_type`    | `rotation` or `translation`. Required                                    |
| `axis`         | always `X`: the part turns about, or slides along, its node's local X    |
| `unit`         | `deg` (the default), `rad`, `m`, or `normalized` for a lever from 0 to 1 |
| `deg_per_unit` | for a `normalized` rotation, how many degrees one unit turns             |
| `min`, `max`   | its limits, in its unit                                                  |
| `rest`         | where it is when nothing drives it, and where it was modelled            |
| `group`        | which parts go together, as `elevons` or `gear_doors`                    |
| `positive`     | what a positive value does                                               |

Any other extra is kept in the part's `extras`: the throttle's `ab_detent`, a
nozzle's `limit_shape`.

### Its kind

A part's kind is read from its name and its group together, so either can
say it: `CTRL_Elevon_Inner_L`, or `CTRL_Surface_03` in group `elevons`. The
words it looks for, the specific before the general:

| kind                                                   | words                                                   |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `nozzle_pitch`, `nozzle_yaw`                           | `nozzle` and `pitch`, or `nozzle` and `yaw`             |
| `nozzle_petal`                                         | `petal`, or `nozzle` and `flap`                         |
| `drag_rudder`                                          | `drag rudder`, `split rudder`, `deceleron`, `clamshell` |
| `elevon`                                               | `elevon`                                                |
| `stabilator`                                           | `stabilator`, `taileron`, `all moving`                  |
| `canard`                                               | `canard`, `foreplane`                                   |
| `aileron`                                              | `aileron`, `flaperon`                                   |
| `elevator`, `rudder`                                   | `elevator`, `rudder`                                    |
| `le_flap`                                              | `le flap`, `leading edge flap`, `lef`, `slat`           |
| `flap`                                                 | `flap`                                                  |
| `airbrake`, `spoiler`                                  | `air brake`, `speed brake`, `spoiler`                   |
| `gear_door`, `gear_lever`, `gear`                      | `gear` with `door`, with `lever`, or alone              |
| `stick_pitch`, `stick_roll`, `pedal`, `throttle_lever` | `stick pitch`, `stick roll`, `pedal`, `throttle`        |

Wheels and steering are `other`, as is anything unmatched: still a part, to
drive with `<Drive>` or by hand.

### Its sense

`positive` lets a model call either way positive. The parts that deflect read
it, and turn round a rig that calls the other way positive:
`trailing_edge_up` for a tail surface, `trailing_edge_left` for a rudder,
`exit_up` or `exit_left` for a nozzle, `forward` or `nose_down` for the stick's
pitch, `left` for its roll. The gear reads `retract`, `stow` or `up` to know
which way is up.

### Its side

From its name: `_L`, `Left` or `Port`, `_R`, `Right`, `Starboard` or `Stbd`,
`_C` or `Centre`. A name that doesn't say is placed by where the part sits.

### Clips

A part a clip moves is left to it while the clip is driven, so a gear
retraction keeps its doors and legs in the sequence it was authored in. Name
the clips for what they do: a clip with `gear` and `retract`, `stow` or `up` in
its name is the gear's, one with `nozzle` and `open` an engine's.

## Not rigged

A model with no rig is searched by name, for the parts whose hinge can be
fitted to a flat panel: the flight controls, the flaps, the brakes and the
drag rudders. Nodes named for what is fixed around a part, as a `well`, `bay`,
`seal`, `fairing`, `track` or `actuator`, are left alone.

For each panel found, a hinge is fitted along its forward edge (its aft edge
for a leading-edge flap), a pivot is put in above it on that hinge, and the
pivot is what turns. Its limits are a fighter's:

| kind                                  | limits, degrees |
| ------------------------------------- | --------------- |
| aileron, elevator, stabilator, canard | −25 to 25       |
| elevon, rudder                        | −30 to 30       |
| flap                                  | 0 to 40         |
| le_flap                               | −3 to 25        |
| airbrake, spoiler                     | 0 to 60         |
| drag_rudder                           | 0 to 50         |

Searching by name changes the scene graph, as it puts pivots in. Turn it off
with `<Airframe names={false}>`, or the rig with `rig={false}`, and leave
nodes out with `filter`.

## Which way it faces

The hinges are fitted, and the sides placed, in the aircraft's frame. A model
that does not fly along −Z with +Y up says so with `forward` and `up`, on the
`<Airframe>` or `<ControlSurfaces>`.

Next, [without React](../without-react/).
