---
title: Shaping the moves
description: "Give a part its own from, its own rate, and hear it move."
---

Each part has a default way of reading the flight. Give it a `from` for
another one.

## `from`

A part's `from` answers in the part's own terms:

| part                                                        | `from` gives                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| ailerons, elevators, elevons, stabilators, canards, rudders | a share of throw, −1 to 1, trailing edge down (rudder: right)          |
| flaps, air brakes, spoilers, drag rudders                   | a share of travel, 0 to 1                                              |
| leading-edge flaps                                          | degrees, leading edge down                                             |
| the cockpit                                                 | a share of throw for the stick and the pedals, of travel for the lever |
| the gear                                                    | how far down, 0 to 1                                                   |

It is given the flight's values and the part, and returns null to leave the
part where it was going:

```tsx
// Ailerons that wash out with speed, as a fly-by-wire limits them
<Ailerons
  from={(f, part) =>
    f.roll * (part.side === "left" ? 1 : -1) * Math.min(1, 150 / f.airspeed_m_s)
  }
/>

// Rudders that also toe in with the air brake
<Rudders
  from={(f, part) => f.yaw + f.airbrake * (part.side === "left" ? 0.3 : -0.3)}
/>
```

Each share is turned into the part's own value with its own limits, and in its
own positive sense, so the same `from` moves a rig that calls up positive the
right way too.

A `from` is read where it is, whenever the flight changes: changing it
re-renders nothing and adds no drive. Write it inline.

## Elevons and stabilators

`pitch_share` is how much of their throw is pitch, the rest being roll, 0.6 by
default. 1 makes them elevators, 0 ailerons.

## Leading-edge flaps

They droop with the angle of attack, from `start_deg` (2° by default) at
`per_deg` degrees a degree (1.4 by default), and fully with the flaps down.

## The cockpit's throttle

The throttle lever moves to its reheat detent at military power, then on to
the stop at full reheat. Where the detent is is the lever's `ab_detent` extra,
or 0.85 of its travel. Give `<Cockpit throttle={(f) => …}>` to show a
throttle other than the flight's.

## `rate`

How fast the part moves, in its unit a second, over the rig's rate for its
kind. Infinity follows at once.

```tsx
<Flaps rate={4} />
```

The rig's rates are on `<Airframe rates={{ flap: 4 }}>` or
`<ControlSurfaces rates={…}>`. See [Actuators](../../how-it-works/actuators/).

## `on_move`

Called in the frame a part moves, with its value in its unit:

```tsx
<Gear on_move={(value, part) => clunk(part.name, value)} />
```

## Any part

`<Drive>` drives whatever it selects, by name, group, kind or side, with a
`from` in the part's own unit:

```tsx
// The refuelling probe, out with the gear
<Drive parts={["CTRL_Probe"]} from={(f, part) => f.gear * part.max} />
```

And `<Clip>` scrubs a clip of the model from the flight, 0 to 1:

```tsx
<Clip clip="ANIM_Bay_Open" from={(f) => (f.airbrake > 0.5 ? 1 : 0)} />
```

Next, [engines](../engines/).
