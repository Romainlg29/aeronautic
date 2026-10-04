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

| field           | unit | meaning                       |
| --------------- | ---- | ----------------------------- |
| `temperature_k` | K    | the standard temperature      |
| `pressure_pa`   | Pa   | the pressure                  |
| `pressure`      |      | the pressure over sea level's |

## `moist_air(altitude_m, relative_humidity, temperature_offset_k = 0)`

The air at one altitude on one day. The pressure is the standard one at the
altitude, and the day's offset warms the air at that pressure, so a hot day is
a thinner one. The humidity is relative, so the same 90 % holds far more water
on a hot day.

| field               | unit  | meaning                                          |
| ------------------- | ----- | ------------------------------------------------ |
| `temperature_k`     | K     | the day's offset included                        |
| `pressure_pa`       | Pa    |                                                  |
| `density_kg_m3`     | kg/m³ | of the moist air                                 |
| `sound_m_s`         | m/s   | the speed of sound in it                         |
| `vapour_pa`         | Pa    | the vapour's partial pressure                    |
| `mixing_ratio`      | kg/kg | vapour per kilogram of dry air                   |
| `dew_point_k`       | K     | where it would condense, cooled at this pressure |
| `relative_humidity` |       | as given                                         |

## Single functions

| function                               | returns                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `speed_of_sound(temperature_k)`        | m/s in dry air                                                                    |
| `ram_pressure(mach)`                   | stagnation over static pressure an inlet recovers, with MIL-E-5007's shock losses |
| `saturation_pressure(temperature_k)`   | Pa, over liquid water even below freezing (the Magnus fit)                        |
| `dew_point(vapour_pa)`                 | K, the Magnus fit inverted                                                        |
| `mixing_ratio(vapour_pa, pressure_pa)` | kg of vapour per kg of dry air                                                    |

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
