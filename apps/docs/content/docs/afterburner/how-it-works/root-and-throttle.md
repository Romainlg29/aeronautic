---
title: The root and the throttle
description: "Why the flame stays on the nozzle, and what the throttle changes."
---

## Why the flame stays on the nozzle

A plume is bolted to a steel nozzle. If the eye can find any reason to read the
fire and the aircraft as two objects it will, and no amount of correct geometry
downstream fixes that impression.

### Nothing at the root may move

Everything time-varying is gated behind one curve, `plume_freedom`, which is
zero at the lip and one by `free_at`:

```glsl
float rooted = clamp(along / max(uFreeAt, PLUME_EPSILON), 0.0, 1.0);

return pow(rooted, uRootStiffness);
```

**It is a power, not a smoothstep, and that is the whole point.** Think of a
blade of grass: rooted hard, bending further the further you get from the root.
A smoothstep only _starts_ slowly — the one this replaced reached half its depth
less than two metres from a nine metre plume's lip, which is right on the
engine, and read as the fire shivering on its own nozzle.

Two curves ride it, differing only in how they end:

| Curve          | Shape                                      | What rides it                               |
| -------------- | ------------------------------------------ | ------------------------------------------- |
| `agitation`    | freedom, faded out again past `churn_peak` | the edge chew, the interior bite, the pulse |
| freedom itself | still climbing at the tip                  | the tail's displacement off the axis        |

The chew has to fade because it scales the surface and the tail has no body left
to scale — past about half the length the tail has closed to a fraction of a
nozzle, and chewing something that thin punches straight through it into rings.
The wander displaces a whole cross-section, which a thin tail takes without
tearing, so the tail whips instead of breaking up. It is also the cheap way
round: the displacement only varies **along** the plume, so `wander_noise` is
one-dimensional — two hashes a sample, against the sixteen two 3D lookups cost.

The rule, if this is ever retuned: **anything time-varying gets multiplied by
one of them.** Nothing that varies with `uTime` may reach the lip unattenuated.

### The dither is seeded in the plume's frame, and split per pixel

A screen-space dither is nailed to the screen. Hold the camera still and it is
perfect: every pixel keeps its offset and the march is steady. Move the camera
and the plume slides across those pixels, so each point of the flame draws a
different offset every frame and the step error changes with it — which reads as
the root shimmering and coming loose from the nozzle, and only ever while the
camera is moving. So the offset is seeded from where the ray enters the plume,
in whole cells of the plume's own frame (`ditherScale` of them a metre), and a
point keeps it however the camera moves.

That alone is not enough. Neighbouring pixels mostly enter in the same cell, so
they take the same offset and march in lockstep, and the banding it was meant
to break comes back as concentric ripples round the plume, worst seen from
astern, where the rays are longest. (Hashing the entry point unfloored is worse
still: the hash then varies smoothly, and the ripples follow its contours.) The
cell's hash is therefore added to interleaved gradient noise on the pixel,
modulo one. The pixel's share is what the paragraph above warns against, but
the root now sits in the shock train, which is marched finely whatever the
view ([frame budget](../frame-budget/)), so the step error it could move is small.

### And the root has to be the brightest part of it

This is the one that reads as detachment in a **still frame**:

| What                                     | Why it detached the flame                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An ignition ramp                         | Any hole between the can and the fire is a gap. There is none: the lip is translucent because a ray crosses one nozzle's width of it there, which the march gives for free      |
| Flat emission along the plume            | A widening plume then puts _more_ gas in the ray's way, so the brightest part sits five metres aft. `burn_decay` makes it fall from the lip instead                             |
| A can whose exit is wider than the plume | `NOZZLE_THROAT_FLARE` used to widen the can _aft_, leaving a dark rim of hardware around the fire. It is convergent now, and the exit measures exactly what the plume is given  |
| A plume starting on the exit plane       | Coplanar with the rim, so any angle putting the rim in front cut the first millimetres off with the depth test. `NOZZLE_PLUME_INSET` plants it a third of the way up the throat |

The last two are the aircraft's, not the field's — see `jet-fighter.tsx`. That
is the trap: a plume can be perfectly welded to the frame it was handed and
still look loose, because the frame was in the wrong place.

---

## Throttle

The one thing a frame writes per nozzle, and one float of it.

- **The travel**: 0 is idle, 1 is military power, the most the engine makes
  dry, and 1.1 is full reheat. `AFTERBURNER_MAX_THROTTLE` is that 1.1, and
  `clamp_throttle` holds a value inside it.
- **`burner_lit`**: zero below `burnerThreshold`, which is 1, the military
  power detent. Past it the first zone lights within `PLUME_LIGHT_OFF` of
  throttle, to `PLUME_MIN_REHEAT` of full, and the rest stage in up to 1.1.
  The batch also eases each plume toward its throttle over `responseS`, a
  quarter of a second by default, so a burner lights over a moment as a real
  one does rather than in a frame. A threshold of zero is an engine
  with no burner, always lit: a rocket.
- **Dry thrust**: below the burner the engine leaves at `dry_temperature`,
  which climbs from `idleTemperature` of the way above the air at idle to
  `dryTemperatureK` at military power. Gas that cool is transparent, so it
  shows only as heat shimmer, and there are no shock diamonds: they need the
  burner's heat to glow. What a real dry engine shows is its last turbine
  stage and jet pipe, glowing a dull red seen up the nozzle from nearly
  astern. `dryGlow` sets how bright, from `PLUME_IDLE_GLOW` of it at idle to
  all of it at military power, and the lip hides it from the side. Once the
  burner lights the glow is drowned out, and the camera opens up for the
  first, dim zone: `plume_adaptation` is the gain an auto-exposure would add,
  a share `adaptation` of the way to full-power brightness, fading out as
  the burner climbs to 1.1.
- **The pressure ratio**: falls toward `idlePressure` of full, because a
  throttled engine is a lower chamber or turbine pressure. The shock train
  shortens and tightens with it, and an overexpanded rocket pinches harder.

The length then follows from the gas, as it does at full power. Nothing scales
it directly. `burner_lit` is exported and tested, and the vertex shader
computes the same curve per instance.
