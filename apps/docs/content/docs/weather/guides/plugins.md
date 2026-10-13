---
title: Plugins
description: "Storms placed by hand, fronts, patches of air, and your own."
---

What the weather is made of past its climate is its plugins. Each is added
while its component is mounted:

```tsx
<Weather climate="fair">
  <Storm at={[25_000, 5000]} diameterM={10_000} />
  <Front kind="cold" at={[-80_000, 0]} speedMPerS={10} />
  <Patch at={[0, 0]} radiusM={15_000} change={{ humidity: 0.15 }} />
</Weather>
```

Their props are compared by value, so they can be written inline. Without
React, `weather.use(storm({ ... }))` adds one and returns what takes it
away again.

Points are in the air's frame, metres carried by the climate's wind, so a
storm drifts with the clouds round it. One placed over a point of the ground
is at `ground_to_air(context, x, z)` of it.

## `<Storm>`

A cumulonimbus. Its tower reaches the tropopause, its anvil spreads
downwind, and it rains and flashes under it. By default it is mature at the
clock's start, its anvil spread. With `ageS={0}` it grows from a cumulus as
you watch.

| prop             | default           | what it is                                    |
| ---------------- | ----------------- | --------------------------------------------- |
| `at`             |                   | Where it stands, `[x, z]` in metres.          |
| `diameterM`      | from its depth    | Its tower's width.                            |
| `topM`           | the tropopause    | Its top, above sea level.                     |
| `rainMmPerH`     | what it condenses | How hard it rains at its core.                |
| `anvilDiameterM` | `30000`           | How wide its anvil spreads at most.           |
| `lifeS`          | for ever          | How long it stays mature, then it dissipates. |
| `ageS`           | mature at start   | How long before the clock's start it began.   |

## `<Front>`

A front moving through the weather.

- **A cold front**: the cold air undercuts the warm, so a line of storms
  forms along it and the air clears behind.
- **A warm front**: the warm air overruns the cold. Cirrus come a thousand
  kilometres ahead, then altostratus, then nimbostratus and its rain at the
  front.

| prop         | default | what it is                                         |
| ------------ | ------- | -------------------------------------------------- |
| `kind`       |         | `"cold"` or `"warm"`.                              |
| `at`         |         | A point on it at the clock's start, on the ground. |
| `headingDeg` | `0`     | Which way it moves, degrees from x towards z.      |
| `speedMPerS` | `8`     | How fast it moves over the ground.                 |

## `<Patch>`

A patch of different air: moister, drier, warmer, lifted. Its `change` is
added to each field of the air at its centre, falling off as a Gaussian, to
e<sup>−1</sup> at `radiusM`.

## Your own

A plugin is any of the stages the weather is made in, changed:

```tsx
import type { WeatherPlugin as Plugin } from "@aeronautic/weather";
import { WeatherPlugin } from "@aeronautic/weather/react";

// A dry slot: the middle air dried along a band
const dry_slot: Plugin = {
  name: "dry-slot",
  air: (air, x, z) => {
    const across = Math.abs(z - 20_000) / 10_000;

    air.midHumidity -= 0.3 * Math.exp(-across * across);
  },
};

<WeatherPlugin plugin={dry_slot} />;
```

| stage    | when                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| `air`    | The air over a point, before the clouds are worked out from it.                        |
| `cells`  | Storms reaching into a region, added to those the climate fires.                       |
| `column` | The clouds over a point, once worked out: a lone lenticular, a hole punched in a deck. |
| `update` | Once a frame, before any of it, to move with the clock.                                |

Each is handed the weather's `context`: its clock, its seed, its climate,
and the climate's tables. The air is clamped to what air can be after the
plugins change it. A plugin whose settings change calls
`weather.changed()`, and the map is baked again.

Keep a `<WeatherPlugin>`'s `plugin` the same object: a new one is a new
plugin, added again.
