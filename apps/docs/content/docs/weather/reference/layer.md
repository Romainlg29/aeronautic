---
title: The layer
description: "Every field of a CloudLayer and a CloudCell, in SI units."
---

Every field is a physical quantity; each genus sets them as that cloud is
observed (see [the genera](/docs/weather/reference/genera)).

## `CloudLayer`

| field               | what it is                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `form`              | `"cumuliform"`, made of clouds, or `"stratiform"`, a sheet.                                                         |
| `baseM`             | Its base above sea level, metres, or `"condensation"`: the day's lifted condensation level.                         |
| `depthM`            | How deep it is: a sheet's thickness, a cumuliform layer's deepest cloud, or `"tropopause"`.                         |
| `cover`             | The share of the sky it covers, 0 to 1: oktas over eight.                                                           |
| `diameterM`         | A cumuliform layer's smallest and largest cloud, metres; a sheet's cells.                                           |
| `sizeExponent`      | As many clouds of each diameter as D<sup>−exponent</sup>.                                                           |
| `aspect`            | A cumuliform cloud's height over its diameter.                                                                      |
| `crown`             | How square its top is: 2 a dome, more a tower rounding off only at its top.                                         |
| `anvil`             | A cumulonimbus's anvil: its `diameterM`, its `thicknessM` under the tropopause, and its `drift` downwind, in radii. |
| `rainMmPerH`        | How hard it rains under its cores, mm/h; 0 for none.                                                                |
| `adiabaticFraction` | The share of the adiabatic water the cloud keeps as it mixes with the air round it.                                 |
| `airMass`           | `"maritime"` or `"continental"`: what its droplets formed on.                                                       |
| `iceSizeM`          | Its ice crystals' generalised effective size, metres.                                                               |
| `updraftMPerS`      | How fast its air rises: its billows boil upward at it.                                                              |
| `billowM`           | The size of its billows: the length its shape's noise repeats over, metres.                                         |
| `detailM`           | The same, of the detail worn into them.                                                                             |
| `stretch`           | How far its billows are drawn out along the wind: 1 for none.                                                       |
| `windMPerS`         | The wind carrying it, in the scene's x and z.                                                                       |
| `cells`             | Clouds placed by hand, in a cumuliform layer.                                                                       |
| `seed`              | Its own seed, mixed with the weather's. By default its place in the sky.                                            |

## `CloudCell`

| field            | what it is                                                                    |
| ---------------- | ----------------------------------------------------------------------------- |
| `at`             | Its centre, in the weather's x and z, metres.                                 |
| `diameterM`      | Its diameter at its base.                                                     |
| `topM`           | Its top above sea level. By default its aspect's, or the tropopause for a Cb. |
| `anvilDiameterM` | How wide its anvil spreads. By default the layer's.                           |
| `rainMmPerH`     | How hard it rains under its core. By default the layer's.                     |
