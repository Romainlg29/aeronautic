---
title: Tracking
description: "From a world transform frame by frame to airspeed, angles, g and rates."
---

`track` reads nothing but the object's world transform and the frame's length.
Everything else is worked out from how that transform changes.

## The airframe's frame

The object's own axes are turned into the airframe's canonical frame (x aft,
y up, z out along the left wing) by its `forward` and `up`. That frame is
built once, and again only when they change.

## Velocity

The position is differenced over the frame, less the wind, and eased toward
with a response of 0.05 s. Taken into the airframe's frame, the velocity has a
forward, an up and a sideways part:

- the **airspeed** is its length;
- the **angle of attack** is `atan2(−up, forward)`: flying along a path above
  the nose is a negative one, below it a positive one;
- the **sideslip** is `asin(−left / speed)`: air from the right, the nose left
  of the path, is positive.

Below a millimetre a second, both angles are zero.

## Load factor

The velocity is differenced again, and eased with a response of 0.15 s, as an
acceleration is twice as noisy. Gravity is added as an upward acceleration, so
an aircraft at rest, or in level flight, feels one g. The load factor is that
sum along the airframe's up axis, over g₀.

A pull up curves the path upward and adds to it. A push over takes from it,
to zero g at the top of a ballistic arc.

## Rates

The turn from the last frame's rotation to this one's is taken as an axis and
an angle, the angle over the frame's length a rate, eased with a response of
0.08 s. Taken into the airframe's frame:

- the roll rate is about forward, right wing down positive;
- the pitch rate is about the right wing, nose up positive;
- the yaw rate is about down, nose right positive.

## Gaps

A frame longer than 0.25 s is not a flight. A tab in the background stops its
frames, and coming back the first one is seconds long: differenced, the
aircraft would seem to have flown kilometres. Tracking starts over instead, as
it does on its first frame, and the flight keeps its last values until the
next.
