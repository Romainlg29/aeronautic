---
title: Disturbance
description: "The potential core, stretched eddies, the helical mode and the breathing shock cells."
---

## Disturbance

A shape with noise on it is not a jet. Five things separate the two, and each
one is a piece of flow physics rather than a look.

### The potential core

A jet leaves the nozzle as laminar flow with a mixing layer only at its **edge**,
and that layer eats inward until it reaches the axis about five diameters down.
Before it does, the core is smooth; after it, the whole cross-section is
turbulent. So the interior disturbance is weighted:

```glsl
float mixed = smoothstep(0.0, uCorePotential, along);
float edge = smoothstep(uCoreEdge, 1.0, radial / radius);

float shear = mix(edge, 1.0, mixed);
```

Stirring the core from the lip is what made the first version one uniform cloud
of noise end to end, with no difference between the part that is still a jet and
the part that is already weather. This is also what lets the root read as hot
and solid while the tail reads as torn.

The core is also a **cone**, and the temperature profile has to say so. It used
to be a top hat over the whole half-width, relaxing to a Gaussian by the end of
the core. Because the half-width grows downstream, the hot region widened with
it, and a fighter's plume read as a long, even barrel. Now the core's radius
closes linearly from the nozzle's at the lip to nothing at the end of the core.
Across the mixing layer, from the core's edge to the half-width, the gas falls
as a Gaussian. Past the core that is the far field's own Gaussian, so nothing
downstream changes. The hot, bright part is then the narrowing cone that every
photograph of a reheat flame shows, and that flight sims draw.

### Eddies are stretched, and they coarsen

A jet stretches what is in it, so the noise domain is stretched the same way —
`uEddyStretch` divides only the axial coordinate. Isotropic noise reads as smoke
sitting behind an aircraft; the same field at three to one reads as gas being
dragged out of a pipe. And the mixing layer thickens downstream, so
`uEddyGrowth` coarsens the scale with `along`: one eddy at the lip is not one
eddy at the tail.

### The helical mode

A round jet's first instability is helical, not random. The column winds about
its own axis and the wind runs aft with the flow, so `plume_drift` carries a
deterministic corkscrew underneath its broadband noise:

```glsl
float turn = TAU * (uHelixTurns * station / v_plume.x - uTime * ...);

drift += vec2(cos(turn + seed), sin(turn + seed)) * v_disturb.z;
```

Noise alone gives a plume that wobbles. This is what makes one _turn_.

### The train starts aft of the lip

A shock train stands about a nozzle diameter downstream of the exit plane,
never on it. `shock_onset` is that delay, and without it the plume is a string
of beads that begins inside the can — which is the single thing that made the
first thin version read as a machined part rather than as gas.

`shock_growth` is the other half: real trains stretch hard as the jet slows, and
evenly spaced cells all the way down read as a ruler however well shaded.

### The cells breathe

The nozzle pressure ratio is never quite steady, so the whole shock train slides
fore and aft a fraction of a spacing. `cell_jitter` is that. Without it the disks
are a ruler laid down the plume, and a ruler is the one thing in the picture that
could not be gas.

### The tail lets go — and it has to have something to let go _with_

This is the piece that took two attempts. A jet does not end in a point. The
supersonic core closes, and what is left **spreads** as it entrains the air
around it: a real plume is at its widest where it has stopped being a jet.

`plume_body_radius` is therefore a closing core plus an opening mixing region:

```glsl
float close = pow(max(0.0, 1.0 - along), uTaperPower);
float spread = uPlumeSpread * along * along;

return v_plume.y * (grow * close + spread);
```

Three things had to follow from it, and none of them work without the others:

- **The chew climbs instead of fading.** It used to fade past `churn_peak`,
  because chewing a tail that had closed to a fraction of a nozzle punched
  straight through it into rings. The tail has body again, so the reason is
  gone and the opposite is what is wanted — `tail_churn` makes the mixing
  region a couple of times more agitated than the barrel, which is the real
  difference between a supersonic column and what follows it.
- **The emission cannot end with the fire.** The burn decay times `1 - t²`
  goes to zero at the tip whatever else happens, so the spread was opening out
  into something completely invisible and the plume still read as a streak that
  simply stopped. `tail_glow` is a second, dimmer term gated to the same
  region: what is no longer burning but is still hot, which is the part that
  churns.
- **The diamonds have to be out of the way.** `shock_decay` at 4.2 keeps the
  train inside the first third. Left running the whole length it competes with
  the break-up and the plume reads as a rope with beads on it.

The hull follows: with a spread the frustum can no longer close to a point, so
`hull_taper` returns `spread / (1 + spread)`. Costs about 30% more fragment
work — 3.7MP went from 36.5 to 28.1 fps — which the frame had.

### The rate a corkscrew can actually be drawn at

`helix_hz`, and emphatically **not** the sway's own speed over its own scale.
That works out at about seven revolutions a second, which is forty degrees of
phase between one frame and the next. The real instability genuinely is that
fast; at sixty frames a second it aliases, and what it looks like is the column
snapping about laterally at random rather than winding — worst right where the
plume is widest and the eye is already looking. Under a hertz is what can be
drawn. The wander had the same problem for the same reason and its speed came
down with it.
