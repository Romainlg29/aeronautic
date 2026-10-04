---
title: What a frame may spend
description: "Step budgets, quality presets and half resolution."
---

## What a frame may spend

A near plume that fills the screen marches every pixel of it. The step count is
therefore shared out by the area the plume covers. That area is measured from
the nearest point of the plume's axis rather than from the nozzle, because a
camera in the tail of a long plume is far from the nozzle and still inside the
gas:

```ts
budget = clamp(sqrt(PLUME_STEP_AREA / covered), 0, 1); // PLUME_STEP_AREA = 0.3
```

A frame then costs about the same however close the camera comes. At that range
a step's features are many pixels across anyway. The budget rides in the
`v_outer` varying, along with the jet's thinning. Scaling the canvas's resolution
(DPR) to hold the frame rate is up to the app, not the library.

The shock train is the exception. Its cells are finer than the stride the
budget leaves, and that stride follows the view. If the train were marched at
it, a ray would hit or miss a cell depending on where the camera stood, and the
diamonds would slide and fade as it moved. The stretch of each ray that lies
inside the train is therefore marched finely, whatever the budget:

- **Where:** inside a cylinder about the axis, the nozzle's radius plus as far
  as the meander can carry it, from the lip to `SHOCK_TRAIN_LENGTHS = 3` shock
  lengths past the first disk. The cells live in the inviscid core, and the
  hull is many times wider, so most rays never enter it and pay nothing.
- **How finely:** `SAMPLES_PER_CELL = 5` along the axis, and
  `SAMPLES_ACROSS_CORE = 4` across the core for the lozenge's taper, whichever
  asks for more.
- **Bounded:** the extra steps are capped at `FINE_STEP_CAP = 2` near budgets.
  A ray straight down the axis crosses every cell, about twenty for a fighter's
  reheat, so it is given room for them. A coarse step never runs past the
  train's start, but stops on it.

Outside the train the budget's stride applies, and the far tier keeps its
single sample.

The eddy noise is the dearest part of a sample, and it is skipped where it
cannot show. Deep in the potential core the profile is flat, and far past the
mixing layer it has fallen to nothing, so however far an eddy pushes the point
the answer is the same. Only a point the eddies could push into the layer pays
for the noise. A ray down the axis spends most of its length in the core, so
this matters most astern.

Where it is paid for, it is cheap. The eddies were hashed value noise, eight
hashes and seven mixes an octave. They now read a 64³ volume of gradient noise
(`noise-volume.ts`), two independent bytes a texel and 512 KiB in all, built
once at start up as the blackbody lookup is, so the library still ships no
assets. The volume tiles every 16 noise cells; each octave is offset from the
last so their tiles do not line up. It is sampled at an explicit level, which is
safe inside the march's divergent loop. Gradient noise, now that it costs
nothing more, has no lattice showing through once the domain is stretched along
the flow, and it is graded to value noise's mean and spread, so every dial tuned
against the one reads the same against the other. Where a step is so long that
the eddies would blur to their mean anyway, the fetches are skipped outright.

The meander reads the same volume. Its two sideways curves come from the two
channels of one fetch, down a line slanted across the volume so it does not
repeat with the tile, where they were four hashes before.

Empty space is skipped twice over. Far from the gas, a coarse bound worked out
from the point alone (the plume's widest reach there, padded by the most the
meander could carry it) says how far the ray can leap, before the frame and its
meander fetch are worked out at all. Only once a step lands near the gas does
the full bound, and then the sample, take over; a ray in the gas does not
re-check the coarse bound until it leaves again. Abeam of a booster this took
about a quarter off the frame.

Measured astern of a fighter at DPR 1 (in the plume, looking up it into the
burner, 1024×768), the worst case went from 11.1 ms to about
7 ms of GPU a frame. Abeam, it costs about 1.4 ms.

### Half resolution

The rest of the cost is the pixel count, so `afterburner_pass` draws the plumes
at half of it. The plumes go in a scene of their own. That scene is cleared to
transparent black whatever the renderer's clear colour, and drawn after the
opaque scene, so the material reads the scene's depth and colour (for the
haze) from that pass rather than from the viewport.

Upsampling a plume is easy except at an edge in front of it, such as a
nozzle's lip. There a low-resolution texel holds plume from both sides, and
plain bilinear filtering bleeds glow onto the metal as a fringe. Each of the
four nearest texels is therefore weighted by how close the scene's depth under
it is to the depth under the pixel. The weight is a Gaussian in the difference,
as a share (`DEPTH_TOLERANCE = 0.03`) of the pixel's own depth. The result is
composited as premultiplied alpha.

Astern, at the same settings, it takes the frame from 6.8 ms to 2.7 ms. The
dither's grain becomes two pixels wide, which the bloom hides.
