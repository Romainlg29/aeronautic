---
title: Quality
description: "How finely the clouds are drawn, against how fast."
---

`useClouds({ quality })` takes a name, or any of the settings over
`"medium"`'s:

| setting           | low   | medium | high   | what it is                                           |
| ----------------- | ----- | ------ | ------ | ---------------------------------------------------- |
| `resolutionScale` | 0.35  | 0.5    | 0.6    | The clouds' resolution against the frame's, per axis |
| `steps`           | 64    | 96     | 160    | The most steps a ray takes                           |
| `minStepM`        | 8     | 5      | 3      | The finest step, metres                              |
| `maxStepM`        | 600   | 400    | 250    | The longest stride over clear air, metres            |
| `rangeM`          | 60 km | 80 km  | 120 km | How far the clouds are drawn                         |
| `mapSize`         | 384   | 512    | 1024   | The weather map's texels a side                      |
| `mapExtentM`      | 96 km | 128 km | 192 km | The ground it spans                                  |
| `blend`           | 0.08  | 0.1    | 0.12   | Each frame's share over the history                  |

```tsx
import { WEATHER_QUALITY } from "@aeronautic/weather";

const clouds = useClouds({
  quality: { ...WEATHER_QUALITY.low, rangeM: 30_000 },
});
```

## Where the time goes

- **The march** is the cost: a ray a texel at the reduced resolution, so
  halving `resolutionScale` quarters it. Each frame starts its steps at a
  new offset and is blended over the last, so a low step count resolves
  over a few frames rather than banding.
- **Inside a cloud** a ray walks finely from the camera, so its steps run
  out sooner; there is little to see far off in a cloud anyway.
- **The weather map** is baked once, and again only after the camera has
  crossed a quarter of its extent or when the layers, the day or the seed
  change. Changing a layer every frame rebakes it every frame.
- **The look** only writes uniforms: change it every frame if the light
  does.
- **The noise** is baked once per seed.

With no layers, nothing is marched.
