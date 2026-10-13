---
title: Components
description: "<Weather>, its plugins, <Rain>, <Lightning>, useClouds and useWeather."
---

From `@aeronautic/weather/react`.

## `<Weather>`

The weather the components inside it are part of.

| prop        | default  | what it is                                                                       |
| ----------- | -------- | -------------------------------------------------------------------------------- |
| `seed`      | `1`      | Every cloud's seed: the same seed, the same sky.                                 |
| `climate`   | `"fair"` | A [climate](/docs/weather/guides/climates)'s name, or its own.                   |
| `look`      |          | Part of a [`WeatherLook`](/docs/weather/guides/the-light): their light.          |
| `timeScale` | `1`      | Its clock against the frame's. 0 holds the sky still.                            |
| `origin`    |          | Where the scene's origin is in the weather, `[x, z]` in metres.                  |
| `altitudeM` | `0`      | The origin's altitude outside a `<FlightProvider>`; inside one, the flight's.    |
| `weather`   |          | A `Weather` made elsewhere, to share it.                                         |
| `couple`    | `true`   | Whether the `<FlightProvider>`'s flight flies in the weather's air.              |
| `aircraft`  |          | A ref to the aircraft, where the flight's air is sampled. By default the origin. |

The climate and the look are compared by value, so they can be written
inline.

## The plugins

Each adds its plugin to the nearest `<Weather>` while mounted, its props
compared by value. See [plugins](/docs/weather/guides/plugins).

| component                   | what it is                             |
| --------------------------- | -------------------------------------- |
| `<Storm {...StormOptions}>` | A cumulonimbus, where it is told.      |
| `<Front {...FrontOptions}>` | A cold or a warm front moving through. |
| `<Patch {...PatchOptions}>` | A patch of different air.              |
| `<WeatherPlugin plugin>`    | Any plugin. Keep it the same object.   |

`usePlugin(plugin)` does the same from a component of your own; null adds
nothing.

## `<Rain>` and `<Lightning>`

The rain's streaks round the camera, and the flashes' channels under the
cloud, drawn in the `<VolumePassContext>`'s pass if there is one. See
[rain and lightning](/docs/weather/guides/rain-and-lightning).

| prop        | of            | what it is                                 |
| ----------- | ------------- | ------------------------------------------ |
| `weather`   | both          | The weather, by default the nearest.       |
| `onFlash`   | `<Lightning>` | Called with each `Flash` as it strikes.    |
| `onThunder` | `<Lightning>` | Called with each `Thunder` as it is heard. |

## `useClouds(options?)`

The weather's clouds for the canvas's camera: a `CloudsNode`, or null
outside a weather. Made again when the camera, the weather or the quality
change, and disposed of after.

| option    | default      | what it is                                                                      |
| --------- | ------------ | ------------------------------------------------------------------------------- |
| `weather` | the nearest  | The weather to draw.                                                            |
| `quality` | `"medium"`   | A [quality](/docs/weather/guides/quality)'s name, or its settings.              |
| `scene`   | the canvas's | The scene whose effects are drawn in the cloud round the camera. Null for none. |

Composite it with `clouds.over(color, depth)`: the scene's colour, and its
depth texture. A sky that draws stars or a sun gives a third, its light
without them, which the air shows in front of a far cloud: see
[takram's atmosphere](/docs/weather/integrations/takram-atmosphere#the-stars).

## `useWeather()`

The nearest `<Weather>`'s `Weather`, or null.
