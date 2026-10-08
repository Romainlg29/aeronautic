---
title: Drawing it
description: "What runs where, and what is left out."
---

Everything about each light is worked out on the CPU, a handful of lights a
frame: where it is, which way the camera is from it in the aircraft's axes,
how much the rule or the lamp sends that way, and what the air lets through.
The GPU only spreads that over the screen as glare, one quad a light sized to
the glare's reach, and sums each beam's light in the air inside its cone.

## Left out

- **The haze between a lamp and the ground** it lights: under a per cent at a
  taxi light's distances.
- **A lens's flare**: the glare is the eye's, with no spikes or ghosts.
- **The intensity towards the camera** is worked out once a frame, from where
  the camera was when the frame began.
- **A page's own bloom**, if it has one, adds to the glare.
