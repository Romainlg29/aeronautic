---
title: Dials
description: "Every field of the airframe, the flare, the flight, the air and the look, with its default."
---

Every dial is a physical quantity. The defaults are the `default_*`
functions'. The program's are in [programs](../../guides/programs/).

## `CountermeasuresAirframe`

`dispensers`: each `{ at, direction? }`. `at` is a position in the group's
frame, or a node of the model. `direction` is which way it throws, down by
default. The default is the docs' fighter's two, measured off its model under
its tail: `[∓1, -0.57, 5]`.

## `Flare`

The default, `FLARE.mju7`, is an MJU-7 class flare.

| field                    | default            | what it is                                                                   |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------- |
| `crossSectionM`          | `[0.0226, 0.0498]` | The grain's two short sides: the 1 × 2 inch case less its walls.             |
| `massKg`                 | `0.253`            | The composition's mass. Its length follows, about 12 cm.                     |
| `densityKgPerM3`         | `1906`             | MTV1's theoretical density, from its ingredients'.                           |
| `burnRateMPerS`          | `3.86e-3`          | How fast each face recedes: MTV1's measured rate.                            |
| `bandEnergyJPerKgSr`     | `179e3`            | What it radiates in its band, per kilogram, per steradian: MTV1's, measured. |
| `bandM`                  | `[1.8e-6, 2.6e-6]` | The band that is measured in.                                                |
| `temperatureK`           | `2100`             | The flame's temperature: an MTV flame's 2000 to 2200 K.                      |
| `emissivity`             | `0.95`             | The flame's, as a graybody.                                                  |
| `dragCoefficient`        | `1.05`             | A tumbling block's, on its mean projected area: a cube's.                    |
| `ejectionMPerS`          | `30.3`             | How fast the cartridge throws it: 99.5 ft/s, measured.                       |
| `halfLightMPerS`         | `150`              | The speed through the air that halves the light at the grain. An estimate.   |
| `glowTimeS`              | `0.05`             | How long the swept products glow: the trail's e-fold time. An estimate.      |
| `trailShare`             | `0.5`              | The share of the light swept off that the trail gives. An estimate.          |
| `pressureExponent`       | `0.094`            | How the burn rate goes with the pressure, r ∝ pⁿ: MTV's, measured.           |
| `ignitionDelayS`         | `0.1`              | How long after it leaves the grain lights. An estimate.                      |
| `smokeYield`             | `1.13`             | The smoke a kilogram burnt leaves: MgO, MgF₂ and carbon, from the mixture.   |
| `smokeExtinctionM2PerKg` | `2000`             | What the smoke stops, per kilogram. An estimate.                             |
| `smokeAlbedo`            | `0.8`              | The share of that it scatters. An estimate.                                  |
| `smokeAsymmetry`         | `0.6`              | How much it scatters on forward, Henyey and Greenstein's g. An estimate.     |

## `CountermeasuresFlight`

| field              | default | what it is                                                    |
| ------------------ | ------- | ------------------------------------------------------------- |
| `airspeedMPerS`    | `250`   | True airspeed: what the flares start from.                    |
| `angleOfAttackRad` | `0`     | Between the forward axis and the oncoming air, nose up.       |
| `sideslipRad`      | `0`     | How far the oncoming air comes from one side, from the right. |

## `CountermeasuresAir`

| field               | default  | what it is                                                                       |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| `altitudeM`         | `1000`   | Metres above sea level: the air's density for the drag, and the haze.            |
| `visibilityM`       | `23_000` | The meteorological range: 23 km is the clear day of the standard rural haze.     |
| `turbulenceM2PerS3` | `1e-3`   | Its dissipation rate, which spreads the smoke: a mixed layer's top. An estimate. |

## `CountermeasuresLook`

| field                      | default                  | what it is                                                             |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `exposure`                 | `exposure_ev100(8)`      | The number one cd/m² is drawn as.                                      |
| `ageYears`                 | `25`                     | The observer's age: the eye scatters more with it.                     |
| `pigmentation`             | `0.5`                    | The eyes: 0 very dark, 0.5 brown, 1 blue or green.                     |
| `sunDirection`             | `[0.4, 0.8, 0.3]`        | Towards the sun, in world space: for the smoke.                        |
| `sunColor`, `sunIntensity` | `[1, 0.96, 0.9]`, `0`    | The sun's light on the smoke, in the scene's units, as the contrails'. |
| `skyColor`, `skyIntensity` | `[0.55, 0.68, 0.9]`, `0` | The sky's, the same from everywhere. None by default: night.           |
