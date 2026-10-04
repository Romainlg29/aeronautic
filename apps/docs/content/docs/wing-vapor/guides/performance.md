---
title: Performance
description: "What a frame costs, and how to measure it."
---

## The CPU

About a quarter of a millisecond per aircraft per frame: the flight's state,
both trails and the bounds. The capture and the wing's vortex lattice only run
when the shape changes. `updateAir` rewrites the condensation table, so write
it when the day changes, not every frame.

## The GPU

Each pixel of the vapor's box marches, skipping clear air by the distance the
field reports to each part. In clear air that distance is all a step works
out: the deficits, the moisture's patches and the shading are only looked up
once the march is inside something that can fog. A tip vortex's trail, the
dearest part of the field, is only followed behind the trailing edge, and a
surface whose tips are too weak to fog doesn't look its trails up at all.

Two things keep a frame's cost even:

- **Coverage.** Past 15 % of the screen, the steps coarsen as the square root
  of the box's area on screen, up to three times. Up close, the features a step
  resolves are many pixels across anyway.
- **Detail.** Smaller than 6 % of the screen's height, the moisture's patches,
  the dearest part of a sample, are dropped.

`quality` caps any one pixel: `"low"` (64 steps), `"medium"` (112), `"high"` (160, the default) or `"ultra"` (256), or `{ maxSteps }`:

```tsx
<WingVapor quality="medium" />
```

Self-shadowing costs three more looks at the field for every sample that fogs.
`effects={{ selfShadow: false }}` saves them, at the cost of a thick cone's
grey underside.

## Measuring it

Measure GPU time, not FPS. Create the renderer with `trackTimestamp: true` and
read `renderer.resolveTimestampsAsync("render")`, from the worst view (the
camera inside the vapor cone) and the common one. A frame's timestamps can
resolve a frame or more late, and are coarse, so add them up over a few
seconds and divide by the frames drawn (`renderer.info.frame`), or take a
trimmed mean, rather than reading one frame at a time.
