---
title: Drawing it
description: "Glare, light, and what runs where."
---

Everything about each flare is worked out on the CPU, a few dozen a frame:
its grain, its intensity, where it is. The GPU only spreads that over the
screen as glare, one quad a flare.

Each flame is drawn as [the lights'](../../../lights/how-it-works/glare/)
are, with the same code from `@aeronautic/core`: its illuminance at the eye,
through the haze, times CIE 146's glare spread function for the observer.
What the eye does not scatter stays in the flame's own disc, its true size
or a pixel. The glare reaches as far as the eye's scatter carries that much
light over what the screen shows.

The brightest flares also light the scene: three's point lights, at their
intensity in candela times the exposure, their colour the flame's. How many
is the quality's.

## Left out

- **The flame's shape**: it is drawn as a disc of its area, not a plume
  stretched by the airstream.
- **A lens's flare**: the glare is the eye's, with no spikes or ghosts.
