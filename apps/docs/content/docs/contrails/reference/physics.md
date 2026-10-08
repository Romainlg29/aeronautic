---
title: Physics
description: "The criterion, the plume, the ice and the wake, from @aeronautic/contrails/physics."
---

Everything the trails are worked out from is exported on its own, for a
flight model, a HUD or a test. The air itself is `@aeronautic/core`'s
`moist_air`.

```ts
import { moist_air } from "@aeronautic/core";
import { CONTRAIL_FUEL } from "@aeronautic/contrails";
import { schmidt_appleman } from "@aeronautic/contrails/physics";

const air = moist_air(11_000, 0.66, 0);
const { forms, thresholdK } = schmidt_appleman(
  air,
  CONTRAIL_FUEL.kerosene,
  0.3,
);
```

## Ice and water

| export                         | what it gives                                          |
| ------------------------------ | ------------------------------------------------------ |
| `water_saturation_pressure(T)` | Over supercooled water, Pa (Murphy & Koop, 2005).      |
| `ice_saturation_pressure(T)`   | Over ice, Pa (Murphy & Koop, 2005).                    |
| `ice_humidity(air)`            | A `MoistAir`'s relative humidity over ice.             |
| `humidity_over_water(rhi, T)`  | The humidity over water that is `rhi` over ice at `T`. |
| `HOMOGENEOUS_FREEZING_K`       | 235.15 K: where droplets freeze without a nucleus.     |
| `ICE_DENSITY`                  | 917 kg/m³.                                             |

## The criterion and the plume

| export                               | what it gives                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `mixing_slope(p, fuel, η)`           | The mixing line's slope, Pa/K.                                                                |
| `schmidt_appleman(air, fuel, η)`     | `{ forms, slopePaPerK, tangentK, thresholdK }`.                                               |
| `dilution(t)`                        | Kilograms of air a kilogram of fuel's exhaust has mixed with at age `t`: 7000 t^0.8.          |
| `age_at_dilution(N)`                 | Its inverse.                                                                                  |
| `mixture(N, air, fuel, η)`           | The plume's `{ temperatureK, water }` at a dilution.                                          |
| `plume_formation(air, fuel, η)`      | `{ dilution, freezeDilution }`: where it saturates over water, and where its droplets freeze. |
| `plume_at(t, emission, air, fuel)`   | The plume at an age: its width, ice, crystal radius and extinction.                           |
| `extinction_efficiency(r, n?)`       | Van de Hulst's anomalous diffraction, at 550 nm.                                              |
| `PLUME_MIN_AGE_S`, `PLUME_MAX_AGE_S` | 6 ms and 10⁴ s: the ages the dilution was measured over.                                      |

## The wake

| export                                     | what it gives                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `buoyancy_frequency(h, ΔT?)`               | The Brunt–Väisälä frequency of the standard atmosphere, rad/s.               |
| `wake(m, n, b, ρ, V, N, ε?)`               | `{ spacingM, circulationM2PerS, descentMPerS, buoyancyRadPerS, lifetimeS }`. |
| `link_time(ε*)`                            | Sarpkaya's time to link, in the pair's own time `b₀ / w`.                    |
| `CRUISE_EDDY_DISSIPATION_M2_S3`            | 10⁻⁷ m²/s³: the turbulence at the cruise levels.                             |
| `wake_descent(wake, t)`                    | How far the pair has sunk at an age, metres.                                 |
| `capture_time(wake, d)`                    | How long a vortex takes to draw in exhaust `d` metres from its core.         |
| `exhaust_offset(wake, engine, t, target?)` | Where an engine's exhaust is at an age, in the frame it left in.             |

## The trail

| export                              | what it gives                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `trail_ages(points, length, from?)` | The ages a straight trail's points are drawn at: evenly in `ln(1 + t / from)`, as its plume ages. |
| `TrailHistory`                      | The path flown, by time. `lay` puts each puff exactly where the exhaust of its age is.            |
| `TRAIL_MIN_AGE_S`                   | 0.02 s: the earliest a trail's points start from, when the plume forms sooner.                    |
| `TRAIL_POINTS_PER_EFOLD`            | 4: the fewest points the plume is worked out at per e-fold of its age.                            |

## The engines

| export                  | what it gives                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `thrust_lapse(p, T, M)` | The share of its sea-level static thrust an engine has at full power: 0.36 at 11 km, Mach 0.85. |
| `THROTTLE_RATIO`        | 1: the inlet's total temperature the lapse breaks at (Mattingly, Heiser and Pratt, eq. 2.54).   |
