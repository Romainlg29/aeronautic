---
title: Weather and CloudsNode
description: "The plain classes: the weather, its sample, and its clouds' node."
---

From `@aeronautic/weather`.

## `Weather`

```ts
new Weather({ seed?, layers?, day?, look? })
```

| member             | what it is                                                           |
| ------------------ | -------------------------------------------------------------------- |
| `seed`             | Every cloud's seed.                                                  |
| `layers`           | Its `CloudLayer`s.                                                   |
| `day`, `look`      | Its `WeatherDay` and `WeatherLook`.                                  |
| `time`             | Its clock, seconds.                                                  |
| `origin`           | Where the scene's origin is: x, altitude above sea level, z, metres. |
| `velocity`         | How fast `advance` moves the origin, `[x, z]` metres a second.       |
| `set(options)`     | Changes any of the seed, the layers, the day and the look.           |
| `changed()`        | Says the layers, the day or the seed were changed in place.          |
| `add(layer)`       | Adds a layer; returns what takes it away again.                      |
| `advance(seconds)` | Runs the clock, and moves the origin at its velocity.                |
| `sample(x, y, z)`  | The air at a point of the scene, a `WeatherSample`.                  |

## `WeatherSample`

| field                  | what it is                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- |
| `extinction`           | Per metre: the droplets', the ice's and the rain's together.                 |
| `water`, `ice`, `rain` | Each one's share of it, per metre.                                           |
| `visibilityM`          | How far one sees through it: Koschmieder's 3.912 over its extinction.        |
| `inCloud`              | Whether there are droplets or ice there; rain alone is not cloud.            |
| `up`, `down`           | About the optical depth of the cloud over and under it, to its top and base. |

## `CloudsNode`

```ts
new CloudsNode(weather, camera, { quality?, scene? })
clouds(weather, camera, options?) // the same
```

| member               | what it is                                                                   |
| -------------------- | ---------------------------------------------------------------------------- |
| `over(color, depth)` | The colour with the clouds composited in front of it, stopping at the depth. |
| `medium`             | The cloud round the camera as a `SceneMedium`, worked out each frame.        |
| `dispose()`          | Frees its targets and textures.                                              |

## The rest

- `cloud_layer(genus, overrides?)`: a layer of a genus.
- `CLOUD_GENERA`: every genus, low to high.
- `weather_medium(weather, x, y, z, out?)`: the cloud at a point as a scene
  medium.
- `default_weather_day()`, `default_weather_look()`: fresh defaults.
- `WEATHER_QUALITY`, `resolve_weather_quality(quality)`: the qualities.

`@aeronautic/weather/physics` holds the microphysics behind them: the
condensation level, the adiabat, the droplets', the ice's and the rain's
extinction, and Mie's phase.
