---
title: The day
description: "Whether a trail forms, and whether it lasts: the air's temperature and its humidity over ice."
---

The same aircraft trails nothing on one day and a cirrus sheet on the next.
Two numbers of the day decide which.

## Cold enough: does it form?

The exhaust is hot and wet. As it mixes with the air round it, both its heat
and its water are diluted by the same air, so it cools and dries along a
straight line. A contrail forms if that line crosses water saturation on the
way: the air must be colder than the **threshold** the Schmidt–Appleman
criterion gives for the day's pressure, humidity and the engines.

On a standard day, for the default fighter on kerosene in dry air:

| altitude | air      | threshold | trail |
| -------- | -------- | --------- | ----- |
| 8 km     | -37.0 °C | -48.5 °C  | none  |
| 9 km     | -43.5 °C | -50.0 °C  | none  |
| 10 km    | -50.0 °C | -51.4 °C  | none  |
| 11 km    | -56.5 °C | -52.2 °C  | forms |

Humid air lifts the threshold a little, and a warmer day
(`temperatureOffsetK`) eats into the margin under it. The engines matter too: the
more of the fuel's heat goes into pushing the aircraft, the less is left to
warm the plume, so an efficient airliner trails in air a degree warmer than a
fighter.

`state.visible` says whether it forms, and `state.criterion` gives the
threshold and the mixing line's slope.

## Wet enough: does it last?

Once formed and frozen, the trail is ice. What happens to it next is the
air's **humidity over ice**:

- **Under 100 %**, the ice evaporates as the trail mixes with the dry air
  round it. It lasts seconds: under ten at 50 %.
- **Over 100 %**, the air is supersaturated over ice. The crystals take up
  the excess vapour as they mix into it and grow: the trail persists, and
  spreads into a sheet of cirrus as long as the air stays that way.

`state.iceHumidity` and `state.persistent` say which.

## Humidity over water, humidity over ice

`air.relativeHumidity` is over water, as `@aeronautic/core` and a `Flight`
take it. At contrail temperatures ice saturates at far less vapour than
water: at -56.5 °C, 59 % over water is 100 % over ice. Turn one into the
other with the helpers:

```ts
import { moist_air } from "@aeronautic/core";
import {
  humidity_over_water,
  ice_humidity,
} from "@aeronautic/contrails/physics";

const temperature_k = moist_air(11_000, 0, 0).temperatureK;

// 112 % over ice, the default day: 66 % over water
const relativeHumidity = humidity_over_water(1.12, temperature_k);

// And back
ice_humidity(moist_air(11_000, relativeHumidity, 0)); // 1.12
```

## A day from the provider

Inside a [`<FlightProvider>`](../../../core/guides/one-flight/), the altitude,
temperature offset and humidity come from its flight and win over `air`, so
every package on the aircraft flies the same day.
