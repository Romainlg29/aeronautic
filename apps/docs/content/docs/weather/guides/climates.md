---
title: Climates
description: "The air the clouds form in, different everywhere, and the days made from it."
---

A day's weather is not one sky. A clear patch gives way to fair-weather
cumulus, those thicken into a deck, and there is a line of showers or a
storm far off. What makes the difference is the air. A climate is that air,
as fields over the ground, and every cloud follows from it.

```tsx
<Weather climate="unsettled" seed={3}>
```

## The days

| climate     | what it is                                                                     |
| ----------- | ------------------------------------------------------------------------------ |
| `clear`     | Dry high pressure, its inversion low: hardly a cloud.                          |
| `fair`      | Fair-weather cumulus, a fifth of the sky on average, here dense, there none.   |
| `unsettled` | Cumulus growing into congestus and showers, and storms where the air allows.   |
| `stormy`    | A warm, humid summer's day without a cap: congestus, showers and storms.       |
| `overcast`  | A stratocumulus deck under a low inversion, broken where the cap rises.        |
| `frontal`   | Lifted, moist air: altostratus thickening into rain, cirrus above, a low deck. |

Their numbers are on [the climates' reference](/docs/weather/reference/climates).

## The air's fields

At every point of the ground the air has:

| field          | what it is                                                         |
| -------------- | ------------------------------------------------------------------ |
| `humidity`     | The relative humidity at the ground, 0 to 1.                       |
| `warmthK`      | How much warmer than the air round it a thermal leaves the ground. |
| `capM`         | How high the inversion capping the mixed layer is, above ground.   |
| `midHumidity`  | The middle troposphere's relative humidity.                        |
| `highHumidity` | The relative humidity over ice at cirrus levels.                   |
| `liftMPerS`    | How fast the air is lifted on the large scale, metres a second.    |

Each field is its `mean`, plus `system` times the pressure system's pattern,
a few hundred kilometres across, plus `local` times a local pattern of its
own, tens of kilometres across. The system's pattern is shared by every
field, so moist air is also rising air. Both patterns change over hours, as
such features do. About 95 % of the ground is within one `system` plus one
`local` of the mean.

## From the air to the clouds

- **The base** of the cumulus is the condensation level of a thermal from
  the ground, 125 m for every kelvin between its temperature and its dew
  point. Humid air has low cumulus.
- **The cumulus** grow from it as high as the first of what stops them: the
  inversion, their equilibrium level, or the dry air they mix in, which
  stops them short in a dry middle troposphere. They cover as much of the
  sky as the humidity makes them, Sundqvist's scheme, at most 60 %.
- **A deck** forms where the condensation level is just under the
  inversion. A cloud layer more than a few hundred metres deep under it is
  cumulus instead.
- **Showers** fall from cumulus grown deeper than their droplets need to
  rain, 400 m over the sea and 1.1 to 1.4 km over land, harder the deeper
  they are.
- **Altostratus and cirrus** form where the middle and high air is humid,
  more where it is lifted, and rain falls steadily from a thick altostratus.
- **Storms** fire where a thermal would rise kilometres on its buoyancy:
  see [plugins](/docs/weather/guides/plugins) and
  [the storms](/docs/weather/how-it-works/the-storms).

## A climate of your own

`make_climate(name, overrides)` starts from a climate and changes any of it,
the fields one by one:

```ts
import { make_climate } from "@aeronautic/weather";

const climate = make_climate("fair", {
  temperatureOffsetK: 8,
  airMass: "maritime",
  wind: [10, 0],
  fields: {
    humidity: { mean: 0.8 },
    capM: { mean: 3000, local: 600 },
  },
});
```

| field                                                    | what it is                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `fields`                                                 | The air's fields, as above.                                           |
| `temperatureOffsetK`                                     | How much warmer than the standard day, at every altitude.             |
| `groundM`                                                | The ground's altitude above sea level.                                |
| `airMass`                                                | `"maritime"` or `"continental"`: fewer, larger droplets over the sea. |
| `latitudeDeg`                                            | The latitude, for how many flashes strike the ground.                 |
| `wind`, `upperWind`                                      | The low and middle clouds' wind, and the anvils' and cirrus', m/s.    |
| `systemM`, `localM`                                      | The patterns' sizes, metres.                                          |
| `evolutionS`                                             | How long the local patterns last, seconds.                            |
| `stormSpacingM`                                          | How far apart storms may fire.                                        |
| `altoBaseM`, `altoDepthM`, `cirrusBaseM`, `cirrusDepthM` | The middle and high cloud's heights.                                  |
| `tropopauseM`                                            | Where the storms' anvils spread.                                      |

Change the climate in place and call `weather.changed()`, or set a new one
with `weather.set({ climate })`. Either way, the map is baked again at once.

## The seed

`<Weather seed>` seeds the air's patterns, the storms and the clouds'
noise: the same seed, the same sky, on any machine. The GPU's noise is baked
from the very function the CPU evaluates.
