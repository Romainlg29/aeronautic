---
title: The march and the light
description: "How the cloud is marched, lit and shadowed, and what the model leaves out."
---

## The march

One box round everything that can fog, marched per pixel. The field reports
how far each point is from anything that could fog, so clear air is skipped in
long steps. Wherever the pressure is low enough:

1. the table gives the liquid water the parcel holds there;
2. two octaves of noise make the moisture patchy, streaked along the flow by
   the shutter;
3. the droplets scatter the sun (Henyey–Greenstein, mostly forward) and the
   sky.

The blend is premultiplied, as a cloud's is, and the scene's depth stops the
vapor at the wing it sits on.

The physics is all on the CPU too, in `vapor-field.ts`, where it is tested.
The shader mirrors it node for node.

## Self-shadowing

At every sample that holds water, three looks at the field towards the sun
(0.4, 1.4 and 4 m out) give the optical depth the sunlight crossed to get
there. The sun's light is split as clouds' is:

- the droplets' forward peak is dimmed by e^−τ;
- what has scattered many times diffuses round the cloud, and is dimmed only by
  e^−τ/4.

That gives a thick cone its grey underside. The shadow samples leave out the
tip vortices: a tube a metre across shades almost nothing.
`effects.selfShadow` turns it off.

## What it leaves out

- The vapor shades itself, but the aircraft doesn't shade it.
- A roll's and a sideslip's asymmetry is a loading per side, not a recomputed
  lattice: good for the trends, not the last ten per cent.
- No contrails from the engines' exhaust: the afterburner's plumes carry no
  water yet.
- The numbers are textbook correlations, good to ten or twenty per cent. That
  is far better than the eye can tell in a cloud that appears or not on a
  degree of dew point. `tipCoreRadius`, `tipCoreShare` and
  `leadingEdgeCoreRadius` are the empirical ones.

What a frame costs, and how to measure it, is in
[Performance](../../guides/performance/).
