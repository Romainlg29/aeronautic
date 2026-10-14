---
title: Quality
description: "How finely the clouds are drawn, against how fast."
---

`useClouds({ quality })` takes a name, or any of the settings over
`"medium"`'s:

| setting           | low    | medium   | high     | what it is                                           |
| ----------------- | ------ | -------- | -------- | ---------------------------------------------------- |
| `resolutionScale` | 0.35   | 0.5      | 0.6      | The clouds' resolution against the frame's, per axis |
| `steps`           | 132    | 171      | 240      | The most steps a ray takes to `shapeM`               |
| `farSteps`        | 28     | 32       | 33       | The most it takes past it, to `rangeM`               |
| `minStepM`        | 8      | 5        | 3        | The finest step, metres                              |
| `shapeM`          | 60 km  | 80 km    | 120 km   | How far the clouds are drawn as themselves           |
| `rangeM`          | 300 km | 500 km   | 800 km   | How far they are drawn at all                        |
| `detailM`         | 4 km   | 8 km     | 16 km    | How near the detail noise roughens the clouds' edges |
| `mapSize`         | 192    | 256      | 384      | The weather map's texels a side                      |
| `mapExtentM`      | 144 km | 192 km   | 288 km   | The ground it spans                                  |
| `farMapSize`      | 160    | 224      | 352      | The far map's texels a side                          |
| `farMapExtentM`   | 720 km | 1 200 km | 1 920 km | The ground it spans                                  |
| `blend`           | 0.08   | 0.1      | 0.12     | Each frame's share over the history                  |

```tsx
import { WEATHER_QUALITY } from "@aeronautic/weather";

const clouds = useClouds({
  quality: { ...WEATHER_QUALITY.low, rangeM: 150_000 },
});
```

## Where the time goes

- **The march** is the cost: a ray for one texel of every two by two at the
  reduced resolution each frame, in turn, the others kept from their history
  where the cloud they saw has moved to, so halving `resolutionScale`
  quarters it. Each frame samples its steps at new places along them and is
  blended over the last, so a low step count resolves over a few frames
  rather than banding.
- **The steps** to `shapeM` are as many as it takes to reach it with none
  longer than 5, 4 or 3 % of its distance: `steps_to(shapeM, share)`. A ray
  that needs more than it has stretches its steps by a constant ratio, so it
  still reaches its end, more coarsely far off. Too few, and a far step is
  longer than the small clouds there, caught by one frame and missed by the
  next, flickering as they go by. Rays that meet cloud stop as it turns
  opaque, so mostly those along the horizon take them all.
- **The sun** is marched from each point of cloud in six steps, each twice
  the last, 1.9 km in all; past `detailM`, where no detail shows the first
  metres' shading, in three, each four times the last, as far.
- **Past `shapeM`** a pixel is hundreds of metres across and a step
  kilometres long, through many clouds and the gaps between: there the ray
  takes `farSteps` steps, 6 % of their distance each, through the clouds'
  mean density, read from a coarser map, and lets the sun in through the
  layer over each point. No noise is read, so the clouds reach the horizon
  for a few percent of the march: from 11 km up it is 380 km off, and a
  storm's top is seen from twice that. Where the one hands over to the other
  moves each frame over the last fifth of `shapeM`, so it shows no line.
- **Inside a cloud** a ray walks finely from the camera, so its steps run
  out sooner; there is little to see far off in a cloud anyway.
- **The weather maps** are baked on the CPU, a few rows a frame within
  1.5 ms, and shown whole once done, again and again as the clouds change:
  the near one three frames in four, the far one the fourth.
  It is baked at once when the climate, the seed or a plugin changes, or
  when the camera has crossed nearly a third of its extent. Calling
  `weather.changed()` every frame bakes it every frame.
- **The storms** are drawn into the map at its own resolution; the air's
  fields, smooth over tens of kilometres, on a grid four times coarser.
- **The look** only writes uniforms: change it every frame if the light
  does.
- **The noise** is baked once per seed.

With no cloud round the camera at all, nothing is marched.
