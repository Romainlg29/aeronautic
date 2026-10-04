---
title: Speed and shear
description: "How exhaust speed and the two kinds of shear shape the texture."
---

## Speed, and the two ways a flow field shears

The exhaust ran at 11 m/s, a sixtieth of what leaves a real afterburner, and it
looked exactly like what it was: slow motion. It could not go faster because a
noise field advected past about a fifth of its own period per frame strobes
rather than flows.

The way out is the **shutter**. A feature that travels while the shutter is open
is not recorded where it was — it is recorded that much _longer_. Stretching the
domain by exactly that is what a camera does to anything moving, so the period
along the flow grows with the speed and the ratio that has to stay under a fifth
stays put however fast the gas goes. It is also the whole visual language of
speed: fast gas is streaked gas. It costs nothing — no second lookup, just a
longer period.

That bought 11 m/s → **300**, measured as nineteen times the per-frame motion
with the camera held still, and no strobing (`gap1` well under `gap5`).

The ratio that has to stay under a fifth settles at
`1 / (60 * eddyStretch * shutterS)` however fast the flow goes — 0.13 at the
defaults. **The speed is not what limits this.** What does are two things that
have no shutter of their own:

- **The wander.** `wander_noise` is one-dimensional and unblurred, so its
  wavelength has to grow with the speed by hand: `sway_scale_m` is 19 m at
  300 m/s, which keeps it moving a sixth of a wander per frame.
- **How much axial structure is left.** At 300 m/s the axial period is 37 m
  against a 13 m plume, so there is under half of one along it. The lateral
  filaments carry the texture from here on, which is exactly why they are what
  the field is built from.

The trap is that a flow field can shear in two different ways, and this one did
both before it worked. **Anything that varies along the plume must not divide or
multiply the time term.**

- **The velocity gradient.** A jet decelerates, so the obvious move is to
  subtract `time * speed(x)`. That is not a flow: each station advects at its
  own rate, so the field is sheared a little further every second until the tail
  is a comb of stripes finer than anything that was ever in it. What convects
  rigidly is the _travel time_ to a station, which for a linear velocity profile
  is a logarithm — `plume_station`. The time term is then the same everywhere.
- **The period.** Same mistake one level down, and much less obvious. The axial
  coordinate was divided by a period built from the _local_ eddy scale and the
  _local_ speed. The time term is enormous — 85 m/s is nearly a kilometre by ten
  seconds in — so dividing it by something that varies along the plume varies
  the quotient in proportion, and the comb comes straight back.
  `plume_flow_period` is deliberately built from the nozzle's numbers alone and
  used everywhere.

The eddies still coarsen downstream. That is the **lateral** scale's job, and the
lateral coordinate carries no time term, so nothing shears.

### Why the texture is filaments, and why that is what lets it go fast

The shutter buys speed by lengthening features along the flow, so at 165 m/s the
axial period is over twenty metres — longer than the plume. Anything relying on
_axial_ detail is gone.

Which is fine, because a real exhaust's texture is not axial. It is longitudinal
**filaments**: fine across the flow, drawn out to nothing along it. Look at any
launch photograph. And a filament that runs along the flow is invariant to being
blurred along the flow — so the lateral detail survives whatever the speed is.

That is the whole reason the plume can be this fast and still look like
something. The dials that do it are `turbulence_scale_m` at 0.16 (fine across)
against `eddyStretch` at 9 (long along), which is a sixty to one aspect ratio
before the shutter has its say.

It also means the tail should **close**, not billow. `plume_spread` came back
down to 0.18: a column of filaments drawing to a point is what the reference
looks like, and a wide turbulent bell is what a much slower jet looks like. The
side effect is a much smaller hull, which paid for the third octave of noise
twice over — 3.7MP went from 28.1 to 33.9 fps.

Both failures look identical — a regular comb of stripes in the tail, spacing
growing downstream — and neither looks like a flow bug. The tell is that they
get finer the longer the scene runs.
