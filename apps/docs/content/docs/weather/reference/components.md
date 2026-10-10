---
title: Components
description: "<Weather>, <CloudLayer>, <Storm>, useClouds and useWeather."
---

From `@aeronautic/weather/react`.

## `<Weather>`

The weather the layers inside it are part of.

| prop        | default | what it is                                                                          |
| ----------- | ------- | ----------------------------------------------------------------------------------- |
| `seed`      | `1`     | Every cloud's seed: the same seed, the same sky.                                    |
| `day`       |         | Part of a [`WeatherDay`](/docs/weather/guides/the-day): the air the clouds form in. |
| `look`      |         | Part of a [`WeatherLook`](/docs/weather/guides/the-light): their light.             |
| `timeScale` | `1`     | Its clock against the frame's. 0 holds the sky still.                               |
| `origin`    |         | Where the scene's origin is in the weather, `[x, z]` in metres.                     |
| `altitudeM` | `0`     | The origin's altitude outside a `<FlightProvider>`; inside one, the flight's.       |
| `weather`   |         | A `Weather` made elsewhere, to share it.                                            |
| `couple`    | `true`  | Whether the `<FlightProvider>`'s flight flies in the weather's air.                 |
| `aircraft`  |         | A ref to the aircraft, where the flight's air is sampled. By default the origin.    |

## `<CloudLayer>`

A layer of the nearest `<Weather>` while mounted. `genus` is the genus it
starts from, by default `"cumulus-mediocris"`; every other prop is a field of
the [layer](/docs/weather/reference/layer) over the genus's. It is compared
by value, so it can be written inline.

## `<Storm>`

A cumulonimbus layer holding one cloud, where it is told.

| prop             | default    | what it is                           |
| ---------------- | ---------- | ------------------------------------ |
| `at`             |            | Where it stands, `[x, z]` in metres. |
| `diameterM`      | `8000`     | Its tower's diameter at its base.    |
| `topM`           | tropopause | Its top, above sea level.            |
| `anvilDiameterM` | `40000`    | How wide its anvil spreads.          |
| `rainMmPerH`     | `40`       | How hard it rains under its core.    |

Any other prop is a field of its layer: its `windMPerS` carries it and
drifts its anvil, its `updraftMPerS` boils its billows.

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
depth texture.

## `useWeather()`

The nearest `<Weather>`'s `Weather`, or null.
