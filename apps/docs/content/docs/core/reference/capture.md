---
title: Capture
description: "Six depth views of a model, and running long work a slice at a time."
---

```ts
import {
  canonical_frame,
  capture_views,
  collect_triangles,
  depth_views,
  run,
  run_async,
} from "@aeronautic/core";
```

The aircraft as six orthographic depth views, from above and below, ahead and
astern, and either side, rasterised on the CPU. `@aeronautic/wing-vapor`'s
`capture_airframe` is built on them. Depth views only see the outside, which is
what the air sees too.

## The canonical frame

Every capture is in the airframe's own frame: **x aft, y up, z out along the
left span**. `CaptureFrame` says where it sits on the model:

| option     | default      | meaning                                   |
| ---------- | ------------ | ----------------------------------------- |
| `position` | `[0, 0, 0]`  | the frame's origin, in the object's frame |
| `forward`  | `[0, 0, -1]` | which way it flies                        |
| `up`       | `[0, 1, 0]`  | which way is up                           |

`canonical_frame(frame)` is the matrix from the canonical frame to the
object's.

## `capture_views(object, options?)`

Every triangle of the model's visible meshes, rasterised three ways.
`CaptureOptions` is a `CaptureFrame` and:

| option       | default        | meaning                                                                        |
| ------------ | -------------- | ------------------------------------------------------------------------------ |
| `resolution` | 128            | pixels along the longest side of the box: about 14 cm on a fighter             |
| `filter`     | visible meshes | which meshes to keep. Hide the gear and the stores, which the air does not see |

It returns `AirframeViews`: `front`, `top` and `side` `DepthView`s, looking
along x, y and z, and the box's `min` and `max`.

A `DepthView` has its `axis`, the two axes `across` it, its `width` and
`height` in pixels, the `origin` of pixel (0, 0) and the `cellM` a pixel
spans, and `near` and `far`: the least and greatest coordinate along the axis
at each pixel, NaN where nothing was hit.

## In two steps

`collect_triangles(object, options?)` gives the model's triangles in the
canonical frame, nine floats each. `depth_views(triangles, resolution = 128)`
rasterises them.

## A slice at a time

A few hundred thousand triangles take tens of milliseconds. Each function has a
`_steps` twin, a generator that yields between slices of a millisecond or two:
`capture_view_steps`, `collect_triangle_steps` and `depth_view_steps`.

- `run(steps)` runs them to the end at once.
- `run_async(steps, budget_ms = 6, signal?)` runs them a few milliseconds at a
  time, handing the thread back between, so the frames keep coming. An
  `AbortSignal` stops it, rejecting with the signal's reason.

```ts
const views = await run_async(capture_view_steps(gltf.scene), 6, signal);
```
