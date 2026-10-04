---
title: Actuators
description: "Targets, rates and settling: how a part gets from where it is to where the flight wants it."
---

A real control surface doesn't jump to where the stick says. A hydraulic
actuator drives it at a rate it can't exceed, so a full-stick roll takes a
moment to reach full throw, and the gear takes seconds. The rig does the same.

## Two numbers per part

Each part has a **target** and a **value**. The target is where it should
be; the value is where it is.

- **The target** is worked out again only when something changes: the
  flight's `version` moved, a drive came or went, or something was set by
  hand. A still flight costs no `from` calls at all.
- **The value** moves toward the target every frame, at the part's rate, in
  its unit a second. Once there it stops, and a part at its target costs
  nothing.

```
value += sign(target - value) × min(rate × delta, |target - value|)
```

The pose is written only for a part that moved. `on_move` and `on_moved` are
called then, so a gauge reading them updates only when there is something to
show.

## Rates

The defaults are a fighter's, in degrees a second for what turns: 80 for the
ailerons, rudders and spoilers, 60 for the tail surfaces and canards, 40 for
the air brakes and the nozzles' gimbals, 30 for the leading-edge flaps and
the gear legs, 20 for the petals, 10 for the flaps. The stick, the pedals and
the levers are moved by a hand, which is faster than any frame, so they
follow at once.

## Settling

On its first read of a flight, the rig jumps every part to its target rather
than moving it there. A page that opens on a jet in flight shows it in
flight, not lowering its flaps from rest. `settle={false}` turns that off.

## Clips

A clip is scrubbed the same way: a target from 0 to 1, a position moved
toward it, and the clip's time set from the position. By default it moves at
the clip's own speed, so a gear retraction animated over four seconds takes
four. A clip is posed only
once driven, so a model's other clips leave it alone.

## By hand

`set`, `set_group` and `set_clip` give a part or a clip a target of their
own, over any drive. It still moves at its rate, as an actuator would, until
it is given `null` and the drive has it back.
