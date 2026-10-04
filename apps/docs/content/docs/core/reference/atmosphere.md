---
title: The atmosphere
description: "The standard atmosphere, the speed of sound, ram pressure and moist air."
---

```ts
import {
  dew_point,
  mixing_ratio,
  moist_air,
  ram_pressure,
  saturation_pressure,
  speed_of_sound,
  standard_atmosphere,
} from "@aeronautic/core";
```

`@aeronautic/afterburner` and `@aeronautic/wing-vapor` export the same
functions, so an aircraft's plume and its vapor fly through the same day.

## `standard_atmosphere(altitude_m)`

The International Standard Atmosphere's temperature and pressure, to 86 km and
isothermal above.

| field          | unit | meaning                       |
| -------------- | ---- | ----------------------------- |
| `temperatureK` | K    | the standard temperature      |
| `pressurePa`   | Pa   | the pressure                  |
| `pressure`     |      | the pressure over sea level's |

## `moist_air(altitude_m, relative_humidity, temperature_offset_k = 0)`

The air at one altitude on one day. The pressure is the standard one at the
altitude, and the day's offset warms the air at that pressure, so a hot day is
a thinner one. The humidity is relative, so the same 90 % holds far more water
on a hot day.

| field              | unit  | meaning                                          |
| ------------------ | ----- | ------------------------------------------------ |
| `temperatureK`     | K     | the day's offset included                        |
| `pressurePa`       | Pa    |                                                  |
| `densityKgPerM3`   | kg/m³ | of the moist air                                 |
| `soundMPerS`       | m/s   | the speed of sound in it                         |
| `vapourPa`         | Pa    | the vapour's partial pressure                    |
| `mixingRatio`      | kg/kg | vapour per kilogram of dry air                   |
| `dewPointK`        | K     | where it would condense, cooled at this pressure |
| `relativeHumidity` |       | as given                                         |

## Single functions

| function                               | returns                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `speed_of_sound(temperature_k)`        | m/s in dry air                                                                    |
| `ram_pressure(mach)`                   | stagnation over static pressure an inlet recovers, with MIL-E-5007's shock losses |
| `saturation_pressure(temperature_k)`   | Pa, over liquid water even below freezing (the Magnus fit)                        |
| `dew_point(vapour_pa)`                 | K, the Magnus fit inverted                                                        |
| `mixing_ratio(vapour_pa, pressure_pa)` | kg of vapour per kg of dry air                                                    |

## Angles

The fields take radians. These convert, so a planform reads as it is drawn:

```ts
import { deg, to_deg } from "@aeronautic/core";

const airframe = { leadingEdgeSweepRad: deg(55) };
to_deg(airframe.leadingEdgeSweepRad); // 55
```

| function          | returns           |
| ----------------- | ----------------- |
| `deg(degrees)`    | the angle, in rad |
| `to_deg(radians)` | the angle, in deg |

## Constants

| constant           | value       | meaning                                  |
| ------------------ | ----------- | ---------------------------------------- |
| `SEA_LEVEL_K`      | 288.15      | K                                        |
| `SEA_LEVEL_PA`     | 101 325     | Pa                                       |
| `AIR_GAMMA`        | 1.4         | dry air's ratio of heat capacities       |
| `AIR_GAS_CONSTANT` | 287.05      | J/(kg K)                                 |
| `AIR_CP`           | 1004.6      | J/(kg K), at constant pressure           |
| `VAPOUR_RATIO`     | 0.622       | water vapour's molar mass over dry air's |
| `LATENT_HEAT`      | 2.501 × 10⁶ | J/kg, of condensation near freezing      |
