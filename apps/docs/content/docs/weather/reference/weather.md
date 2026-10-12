---
title: Weather and CloudsNode
description: "The plain classes: the weather, its samples, its plugins, its clouds' node, its rain and its lightning."
---

From `@aeronautic/weather`.

## `Weather`

```ts
new Weather({ seed?, climate?, look?, plugins? })
```

| member                | what it is                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| `seed`                | Every cloud's seed.                                                        |
| `climate`             | Its `Climate`.                                                             |
| `look`                | Its `WeatherLook`.                                                         |
| `plugins`             | Its `WeatherPlugin`s.                                                      |
| `time`                | Its clock, seconds.                                                        |
| `origin`              | Where the scene's origin is: x, altitude above sea level, z, metres.       |
| `velocity`            | How fast `advance` moves the origin, `[x, z]` metres a second.             |
| `lightning`           | Its `Lightning`: the flashes alight, and `brightest(time, count)`.         |
| `cells`               | The storms round the camera now.                                           |
| `set(options)`        | Changes any of the seed, the climate, the look and the plugins.            |
| `changed()`           | Says the climate or a plugin was changed in place.                         |
| `use(plugin)`         | Adds a plugin; returns what takes it away again.                           |
| `on(event, fn)`       | Listens for `"flash"` or `"thunder"`; returns what stops listening.        |
| `advance(seconds)`    | Runs the clock, moves the origin, bakes the map and flashes the lightning. |
| `sample(x, y, z)`     | The air at a point of the scene, a `WeatherSample`.                        |
| `column(x, z)`        | The clouds over a point of the scene, a `CloudColumn`.                     |
| `air(x, z)`           | The air over a point of the scene, an `AirColumn`, plugins applied.        |
| `air_at(x, z)`        | Where a point of the scene is in the air's frame.                          |
| `to_scene(x, alt, z)` | Where a point of the air's frame is in the scene.                          |

## `WeatherSample`

| field                  | what it is                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- |
| `extinction`           | Per metre: the droplets', the ice's and the rain's together.                 |
| `water`, `ice`, `rain` | Each one's share of it, per metre.                                           |
| `visibilityM`          | How far one sees through it: Koschmieder's 3.912 over its extinction.        |
| `inCloud`              | Whether there are droplets or ice there; rain alone is not cloud.            |
| `up`, `down`           | About the optical depth of the cloud over and under it, to its top and base. |
| `rainMmPerH`           | How hard it rains there, under the cloud or not.                             |

## `CloudColumn`

| field                        | what it is                                     |
| ---------------------------- | ---------------------------------------------- |
| `cumulus`, `stratus`         | The cumulus's and the deck's share of the sky. |
| `alto`, `cirrus`             | The altostratus's and the cirrus's.            |
| `baseM`                      | The condensation level, above sea level.       |
| `cumulusTopM`, `stratusTopM` | The tallest cumulus's top, and the deck's.     |
| `altoBaseM`, `altoTopM`      | The altostratus's base and top.                |
| `anvilM`                     | How thick a storm's anvil is over it.          |
| `rainMmPerH`                 | How hard it rains under the cloud.             |
| `updraftMPerS`               | How fast the cumulus rises.                    |

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

## `RainStreaks` and `Bolts`

Meshes: add them where the effects are drawn.

| member                                   | what it is                             |
| ---------------------------------------- | -------------------------------------- |
| `new RainStreaks(weather)`               | The rain's streaks round the camera.   |
| `rain.update(camera, seconds, heightPx)` | Lays them for the frame.               |
| `rain.rate`                              | How hard it rains at the camera, mm/h. |
| `new Bolts(weather)`                     | The flashes' channels under the cloud. |
| `bolts.update(camera, heightPx)`         | Lays the channels alight now.          |

## `Flash` and `Thunder`

| field                                 | what it is                                                    |
| ------------------------------------- | ------------------------------------------------------------- |
| `flash.kind`                          | `"ground"` or `"cloud"`.                                      |
| `flash.strokes`                       | Its strokes: when each strikes, `atS`, and its peak, `peakW`. |
| `flash.startS`                        | When it began, on the weather's clock.                        |
| `flash.points`, `segments`, `weights` | Its channel, in the air's frame.                              |
| `flash.centre`                        | Where its light comes from.                                   |
| `thunder.distanceM`                   | How far its nearest part is.                                  |
| `thunder.durationS`                   | How long it rolls.                                            |
| `thunder.loudness`                    | One at a kilometre, falling as the distance.                  |

## The rest

- `storm`, `front`, `patch`: the plugins, and `ground_to_air(context, x, z)`.
- `CLIMATES`, `make_climate(name, overrides?)`: the climates.
- `diagnose(prepared, air, out?)`: the clouds an air column makes.
- `weather_medium(weather, x, y, z, out?)`: the cloud at a point as a scene
  medium.
- `default_weather_look()`, `look_lux(look)`: the light.
- `WEATHER_QUALITY`, `resolve_weather_quality(quality)`, `steps_to(range, share)`:
  the qualities.

`@aeronautic/weather/physics` holds the physics behind them: the standard
atmosphere, the parcel and its CAPE, the condensation level, the adiabat,
the droplets', the ice's and the rain's extinction, the rain's onset and its
drops, and Mie's phase.
