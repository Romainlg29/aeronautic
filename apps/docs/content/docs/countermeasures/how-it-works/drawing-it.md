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

Each flare's smoke is a ribbon facing the camera through the points it
left, about ten a second, four σ wide or two pixels. Each point carries the
light it scatters and its depth through its middle, both worked out on the
CPU; the GPU spreads the depth across the ribbon as a Gaussian and shows
1 − e^-τ of the light. Points are kept in the air's frame, less how far the
air has moved since: laying them costs nothing a frame after.

Each chaff cloud is one quad facing the camera, three σ each way of its
two axes as they show from where the camera is: its length along its
path, foreshortened, and its width. The CPU gives its corners the light it
scatters and its depth through its middle; the GPU spreads that as a
Gaussian across both axes and shows 1 − e^-τ of it. The sun's and the
flares' share comes by glints: each pixel draws a Poisson count of them for
the mean its depth and the CPU's count per unit of depth give, from a hash
of the pixel, the cloud and the step of the clock.

The lights, the glare, the trails, the smoke and the chaff are all drawn from the
first frame, before any flare leaves: a light added or a material first
drawn has three build its pipeline, and that stalls the frame for a second.

## Left out

- **The flame's shape at the grain**: it is drawn as a disc of its area.
  The trail behind it is a ribbon facing the camera, as wide as the flame
  or two pixels, its luminance the trail's light per metre over its width.
- **A lens's flare**: the glare is the eye's, with no spikes or ghosts.
