---
title: Dials
description: "Every field of the switches, the lights, the air and the look, with its default."
---

Every dial is a physical quantity. The defaults are the `default_*`
functions'.

## `LightsSwitches`

`navigation`, `anticollision`, `landing` and `taxi`: all `true` by default.

## `NavigationDials`

| field               | default            | what it is                                                                                      |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `scale`             | `1`                | How many times the rule's minimum the lights give inside their arcs.                            |
| `spill`             | `1`                | How much of the spill the rule allows past each arc: 1 the most, 0 a light cut off at its edge. |
| `red`               | `[0.7006, 0.2993]` | The red's chromaticity: a 625 nm LED's.                                                         |
| `green`             | `[0.1142, 0.8262]` | The green's: a 525 nm LED's.                                                                    |
| `whiteTemperatureK` | `2856`             | The white's colour temperature: a filament's, taken as CIE illuminant A.                        |

## `AntiCollisionDials`

| field               | default                                     | what it is                                                               |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `effectiveCd`       | `400`                                       | The effective intensity in the horizontal plane: the rule's least.       |
| `flashesPerMinute`  | `60`                                        | The rule allows 40 to 100.                                               |
| `pulse`             | `{ shape: "exponential", durationS: 2e-4 }` | The flash's shape: a xenon tube's discharge, dying away in about 0.2 ms. |
| `red`               | `[0.7006, 0.2993]`                          | The beacon's chromaticity.                                               |
| `whiteTemperatureK` | `6000`                                      | The strobes' colour temperature: about a xenon arc's.                    |

## `LightsAir`

| field         | default  | what it is                                                                   |
| ------------- | -------- | ---------------------------------------------------------------------------- |
| `altitudeM`   | `0`      | Metres above sea level: the molecules thin with height.                      |
| `visibilityM` | `23_000` | The meteorological range: 23 km is the clear day of the standard rural haze. |

## `LightsLook`

| field          | default             | what it is                                                                      |
| -------------- | ------------------- | ------------------------------------------------------------------------------- |
| `exposure`     | `exposure_ev100(3)` | The number one cd/m² is drawn as.                                               |
| `ageYears`     | `25`                | The observer's age: the eye scatters more with it.                              |
| `pigmentation` | `0.5`               | The eyes: 0 very dark, 0.5 brown, 1 blue or green.                              |
| `perception`   | `"eye"`             | `eye`: a flash at its effective intensity. `camera`: its light over each frame. |

## `LightsIlluminate`

| field           | default | what it is                                         |
| --------------- | ------- | -------------------------------------------------- |
| `navigation`    | `false` | The position lights, as point lights.              |
| `anticollision` | `true`  | The anti-collision lights, as point lights.        |
| `beams`         | `true`  | The lamps, as spot lights with their beams' shape. |
