---
title: Components
description: "<Airframe>, <ControlSurfaces>, <FighterControls>, <Engine>, <Drive>, <Clip>, <Attach> and the hooks."
---

All from `@aeronautic/controls/react`.

## `<Airframe>`

A model's moving parts. It makes a [`ControlRig`](../rig/) for the model and
moves it every frame, but drives nothing by itself: put the parts that should
move inside it.

| prop            | type                          | default          | what it does                                                         |
| --------------- | ----------------------------- | ---------------- | -------------------------------------------------------------------- |
| `object`        | `Object3D \| null`            | —                | The model, as a loaded glTF's scene. Required.                       |
| `animations`    | `AnimationClip[]`             | —                | Its clips, for the gear, the nozzles and anything else to scrub.     |
| `source`        | `Flight \| null`              | nearest provider | The flight its parts read. `null` moves only what is set by hand.    |
| `rates`         | `Partial<ControlRates>`       | —                | How fast each kind moves, over the [defaults](../rig/#rates).        |
| `settle`        | `boolean`                     | `true`           | Jump to the flight's pose on the first read, rather than move there. |
| `forward`, `up` | `[x, y, z]`                   | `-Z`, `+Y`       | Which way the model faces, for fitting hinges and placing sides.     |
| `rig`           | `boolean`                     | `true`           | Read `CTRL_` nodes' extras.                                          |
| `names`         | `boolean`                     | `true`           | Find parts by name where there is no rig, putting pivots in.         |
| `filter`        | `(node: Object3D) => boolean` | —                | Leave nodes out.                                                     |
| `priority`      | `number`                      | `0`              | The frame callback's priority, as `useFrame`'s.                      |
| `ref`           | `ControlRig`                  | —                | The rig, to move parts by hand or read where they are.               |

`object`, `animations`, `rig`, `names`, `filter`, `forward` and `up` make
the rig: changing one makes a new one. The rest apply live.

## `<ControlSurfaces>`

An `<Airframe>` with `<FighterControls>` inside it: every prop of both, and
its children go inside the airframe.

## `<FighterControls>`

Every part, driven the way a fighter's are, and an `<Engine>` for each side
with a nozzle or an exhaust anchor.

| prop         | type                             | default | what it does                                              |
| ------------ | -------------------------------- | ------- | --------------------------------------------------------- |
| `pitchShare` | `number`                         | `0.6`   | How much of an elevon's or a stabilator's throw is pitch. |
| `engine`     | `EngineOptions` but side, anchor | —       | Given to each engine.                                     |
| `exhaust`    | `ReactNode`                      | —       | Put inside each engine, as an `<Afterburner />`.          |

## The parts

Each takes [`PartOptions`](../parts/#partoptions), and drives every part of
its kind unless told which:

| component            | moves                                    | extra props                                |
| -------------------- | ---------------------------------------- | ------------------------------------------ |
| `<Ailerons>`         | ailerons, with roll                      |                                            |
| `<Elevators>`        | elevators, with pitch                    |                                            |
| `<Elevons>`          | elevons, with pitch and roll             | `pitchShare`                               |
| `<Stabilators>`      | all-moving tails, with pitch and roll    | `pitchShare`                               |
| `<Canards>`          | canards, with pitch                      |                                            |
| `<Rudders>`          | rudders, with yaw                        |                                            |
| `<Flaps>`            | trailing-edge flaps                      |                                            |
| `<LeadingEdgeFlaps>` | leading-edge flaps, with angle of attack | `startDeg`, `perDeg`                       |
| `<Airbrakes>`        | air brakes                               |                                            |
| `<Spoilers>`         | spoilers, with the air brake             |                                            |
| `<DragRudders>`      | split drag rudders, braking and yawing   |                                            |
| `<Cockpit>`          | stick, pedals, throttle lever            | `throttle`                                 |
| `<Gear>`             | legs, doors, lever, retraction clip      | see [`GearOptions`](../parts/#gearoptions) |

## `<Engine>`

One engine's nozzle and gimbal. Takes [`EngineOptions`](../engine/), and a
`ref` to the `Engine`. Its children sit in its context: an `<Afterburner>`
inside it sits on its exhaust and runs at its throttle.

## `<Drive>`

A drive of your own. Takes [`DriveOptions`](../rig/#driveoptions): which
parts, and `from`, where each should be for a flight.

```tsx
<Drive parts={["CTRL_Radar_Array_C"]} from={(flight) => flight.pitch * 10} />
```

## `<Clip>`

Scrubs a clip from the flight. Takes [`ClipDriveOptions`](../rig/#clipdriveoptions).

```tsx
<Clip clip="ANIM_Bay_Open" from={(flight) => flight.airbrake} />
```

## `<Attach>`

Puts its children in a part's or an anchor's frame.

| prop     | type     | what it does                                |
| -------- | -------- | ------------------------------------------- |
| `part`   | `string` | A part, by name: the children move with it. |
| `anchor` | `string` | Or an anchor, by name.                      |

## Hooks

| hook              | returns                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `useAirframe()`   | The nearest `<Airframe>`'s `ControlRig`, or `null` before it is made. |
| `usePart(name)`   | A [`ControlSurface`](../parts/#controlsurface), or `null`.            |
| `useAnchor(name)` | A [`ControlAnchor`](../parts/#controlanchor), or `null`.              |
| `useEngine()`     | The nearest `<Engine>`'s `Engine`, or `null`.                         |

Options given to a part, a `<Drive>` or a `<Clip>` are read in place, so an
inline `from` is fine: a new function each render costs nothing.
