---
title: Drawing it
description: "The raymarch: where it strides, where it walks, and how the frames are resolved."
---

The clouds are raymarched at a reduced resolution, a ray a texel, and
resolved over the frames.

## The ray

Each ray runs through the shell of air the layers fill, round the earth's
curve: spheres about the earth's centre, under the scene's origin. From
above it enters through the top, from below through the bottom, and inside
from the eye. It stops at the scene's depth, and at the range.

It strides over clear air, up to `maxStepM`, and once it meets cloud steps
back a stride and walks finely, as finely as a pixel's footprint there and
no finer than `minStepM`. Out of cloud it walks a few fine steps more before
it strides again. Rain is as smooth as the map it is baked in, so a rain
shaft is strided through, and only the cloud's droplets and ice are walked
finely. A ray that lets through less than 1 % of the light
stops: nothing behind would show.

## The frames

Each frame a ray starts somewhere different along its first step, and the
frames are blended, `blend` of the new over the history. A texel's last
value is found where the cloud it saw was the frame before, from the last
frame's view and how far the weather moved since, and kept unless it strays
outside what the texel's neighbours see now. A few dozen steps resolve over
a few frames into what hundreds would show at once.

## The composite

`over(color, depth)` upsamples the clouds to the frame as core's
`volume_pass` does: from the four texels round a pixel, each weighted by
how near the scene it saw sits to the pixel's own depth, so the clouds stay
sharp against the airframe. The clouds are premultiplied: the colour behind
is kept by what they let through, and their light added.
