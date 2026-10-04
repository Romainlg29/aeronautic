---
title: The store
description: "Why the flight is one mutable object, and how every reader skips work when nothing changed."
---

An aircraft's effects read its flight sixty times a second or more. If that
flight were React state, every write would render the tree under it, and a
flight model writes every frame. So it is not.

## One object, written in place

`flight.values` is created once, with the flight, and never replaced. `set`
writes into it. Any reader can take the object once and read it whenever,
for the cost of a property access, with nothing allocated in the frame.

The price is that a reader can't tell a new value by its identity. That is
what the version is for.

## The version

Every write that changed something adds one to `flight.version`. A write that
changed nothing leaves it alone, and calls no listener.

Each effect remembers the flight and the version it last read. In its frame it
compares them, and when neither moved it does none of its own work:

- the afterburner batch reads the throttles, and rewrites its profile's
  altitude, airspeed and temperature offset, only then;
- the vapor copies the airspeed, the angles and the air only then, the
  altitude rounded to 10 m so a climb doesn't rebuild its condensation table
  every frame;
- the control rig works out the parts' targets only then.

A flight held still costs every effect one comparison a frame.

## What follows from a write

`set` writes the fields it is given, then works out what follows. The speeds
(Mach, dynamic pressure, ram pressure) are a few multiplications, done on every
change. The air is a standard atmosphere and a saturation pressure, done only
when the altitude, the day's offset or the humidity is not what it was last
worked out for.

## Rendering on purpose

`useFlight` is the one way in for React. It is `useSyncExternalStore` over
`subscribe`, with two guards:

- the selection is compared, so a write that leaves it the same renders
  nothing;
- `hz` holds back the notifications to at most that many a second, firing the
  last one at the end of a gap so the final value always arrives.

A HUD that rounds its Mach to two places at 10 Hz renders at most ten times a
second, and not at all when the number on screen would be the same.

## Who goes first

Inside the Canvas, the tracker runs at frame priority −1. The control rig and
every effect run at 0 or later, or read the flight where they draw. Each frame,
everything reads the flight as it was tracked in that frame, not the one
before.
