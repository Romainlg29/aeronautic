---
title: Quality
description: "How finely the clouds are drawn, against how fast."
---

`useClouds({ quality })` takes a name, or any of the settings over
`"medium"`'s:

| setting           | low    | medium | high   | what it is                                           |
| ----------------- | ------ | ------ | ------ | ---------------------------------------------------- |
| `resolutionScale` | 0.35   | 0.5    | 0.6    | The clouds' resolution against the frame's, per axis |
| `steps`           | 132    | 171    | 240    | The most steps a ray takes                           |
| `minStepM`        | 8      | 5      | 3      | The finest step, metres                              |
| `rangeM`          | 60 km  | 80 km  | 120 km | How far the clouds are drawn                         |
| `detailM`         | 4 km   | 8 km   | 16 km  | How near the detail noise roughens the clouds' edges |
| `mapSize`         | 192    | 256    | 384    | The weather map's texels a side                      |
| `mapExtentM`      | 144 km | 192 km | 288 km | The ground it spans                                  |
| `blend`           | 0.08   | 0.1    | 0.12   | Each frame's share over the history                  |

```tsx
import { WEATHER_QUALITY } from "@aeronautic/weather";

const clouds = useClouds({
  quality: { ...WEATHER_QUALITY.low, rangeM: 30_000 },
});
```

## Where the time goes

- **The march** is the cost: a ray a texel at the reduced resolution, so
  halving `resolutionScale` quarters it. Each frame samples its steps at
  new places along them and is blended over the last, so a low step count
  resolves over a few frames rather than banding.
- **The steps** are as many as it takes to reach `rangeM` with none longer
  than 5, 4 or 3 % of its distance: `steps_to(rangeM, share)`. A ray that
  needs more than it has stretches its steps by a constant ratio, so it still
  reaches its end, more coarsely far off. Too few, and a far step is longer
  than the small clouds there, caught by one frame and missed by the next,
  flickering as they go by. Rays that meet cloud stop as it turns opaque, so
  mostly those along the horizon take them all.
- **Inside a cloud** a ray walks finely from the camera, so its steps run
  out sooner; there is little to see far off in a cloud anyway.
- **The weather map** is baked on the CPU, a few rows a frame within
  1.5 ms, and shown whole once done, again and again as the clouds change.
  It is baked at once when the climate, the seed or a plugin changes, or
  when the camera has crossed nearly a third of its extent. Calling
  `weather.changed()` every frame bakes it every frame.
- **The storms** are drawn into the map at its own resolution; the air's
  fields, smooth over tens of kilometres, on a grid four times coarser.
- **The look** only writes uniforms: change it every frame if the light
  does.
- **The noise** is baked once per seed.

With no cloud round the camera at all, nothing is marched.
