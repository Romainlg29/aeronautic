---
title: Physics
description: "What @aeronautic/countermeasures/physics exports."
---

Everything the flares are worked out from, for a tool, a test or a HUD.

## The grain

| export                                    | what it is                                                  |
| ----------------------------------------- | ----------------------------------------------------------- |
| `FLARE`                                   | The flares by name: `mju7`.                                 |
| `MTV_FRACTIONS`, `MTV_DENSITIES`          | MTV1's composition by mass, and its ingredients' densities. |
| `mixture_density(fractions, densities)`   | A mixture's theoretical density.                            |
| `grain_length(flare)`, `burn_time(flare)` | The grain's length, and how long it burns.                  |
| `grain_at(flare, age)`                    | Its sides, mass and burning surface after burning a while.  |
| `mass_rate(flare, grain)`                 | What it burns a second, kg/s.                               |

## The flame

| export                                     | what it is                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `band_intensity(flare, grain)`             | Its intensity in its band, W/sr.                                      |
| `luminous_per_band(flare)`                 | The candela each W/sr of the band brings, at the flame's temperature. |
| `flare_light(flare, grain)`                | Its luminous intensity, cd, and the radius of a flame that bright.    |
| `planck(λ, T)`, `band_radiance(a, b, T)`   | A blackbody's spectral radiance, and its radiance over a band.        |
| `blackbody_luminance(T)`, `PHOTOPIC`, `KM` | Its luminance, cd/m², from the CIE photopic curve and 683 lm/W.       |

## The flight

| export                             | what it is                                                     |
| ---------------------------------- | -------------------------------------------------------------- |
| `mean_area(grain)`                 | A tumbling grain's mean projected area: a quarter its surface. |
| `drag_per_speed2(flare, grain, ρ)` | Its drag deceleration over its speed squared, 1/m.             |
| `terminal_speed(flare, ρ)`         | How fast it falls once slowed, m/s.                            |
| `G0`                               | Standard gravity.                                              |

## The programs

| export                                  | what it is                                     |
| --------------------------------------- | ---------------------------------------------- |
| `default_program()`                     | Two flares, four times.                        |
| `program_releases(program, dispensers)` | Each release's time from the press, and where. |

The glare, the haze and the exposure are core's: `glare_psf`, `extinction`,
`transmission`, `exposure_ev100` and the rest, from `@aeronautic/core`.
