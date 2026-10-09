---
title: Physics
description: "What @aeronautic/countermeasures/physics exports."
---

Everything the flares and chaff are worked out from, for a tool, a test or a HUD.

## The grain

| export                                    | what it is                                                  |
| ----------------------------------------- | ----------------------------------------------------------- |
| `FLARE`                                   | The flares by name: `mju7`.                                 |
| `MTV_FRACTIONS`, `MTV_DENSITIES`          | MTV1's composition by mass, and its ingredients' densities. |
| `mixture_density(fractions, densities)`   | A mixture's theoretical density.                            |
| `grain_length(flare)`, `burn_time(flare)` | The grain's length, and how long it burns.                  |
| `grain_at(flare, age)`                    | Its sides, mass and burning surface after burning a while.  |
| `mass_rate(flare, grain)`                 | What it burns a second, kg/s.                               |
| `flare_at_pressure(flare, p)`             | The flare burning at a pressure: its rate as MTV's goes.    |
| `SEA_LEVEL_PA`, `SEA_LEVEL_DENSITY`       | Sea level's pressure and density, which the rates are at.   |

## The flame

| export                                     | what it is                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `band_intensity(flare, grain)`             | Its intensity in its band, W/sr.                                      |
| `luminous_per_band(flare)`                 | The candela each W/sr of the band brings, at the flame's temperature. |
| `flare_light(flare, grain, …, v, ρ)`       | Its luminous intensity, cd, its trail's, and its flame's radius.      |
| `airstream_share(flare, v, ρ)`             | The share of its light the airstream leaves at the grain.             |
| `trail_colors(flare, rgb, f, n)`           | Its trail's colours as it cools, over f e-folds of its light.         |
| `planck(λ, T)`, `band_radiance(a, b, T)`   | A blackbody's spectral radiance, and its radiance over a band.        |
| `blackbody_luminance(T)`, `PHOTOPIC`, `KM` | Its luminance, cd/m², from the CIE photopic curve and 683 lm/W.       |

## The flight

| export                             | what it is                                                     |
| ---------------------------------- | -------------------------------------------------------------- |
| `mean_area(grain)`                 | A tumbling grain's mean projected area: a quarter its surface. |
| `drag_per_speed2(flare, grain, ρ)` | Its drag deceleration over its speed squared, 1/m.             |
| `terminal_speed(flare, ρ)`         | How fast it falls once slowed, m/s.                            |
| `G0`                               | Standard gravity.                                              |

## The smoke

| export                        | what it is                                          |
| ----------------------------- | --------------------------------------------------- |
| `smoke_sigma(σ₀, ε, t)`       | How wide the smoke has spread, Richardson's law.    |
| `henyey_greenstein(cos θ, g)` | The phase function it scatters with, per steradian. |

## The chaff

| export                             | what it is                                                      |
| ---------------------------------- | --------------------------------------------------------------- |
| `CHAFF`                            | The chaff by name: `rr178`.                                     |
| `chaff_mass(chaff)`                | The payload's mass, kg.                                         |
| `dipole_count(chaff)`              | How many dipoles it holds, of the typical cut.                  |
| `chaff_cross_section(chaff)`       | The light they all stop, π d L / 4, m².                         |
| `air_viscosity(T)`                 | The air's dynamic viscosity, Sutherland's law, Pa·s.            |
| `chaff_fall_speed(chaff, T, ρ)`    | How fast a dipole falls broadside: Lamb's drag in Oseen's flow. |
| `dipole_tumble_rate(chaff, ε)`     | How fast the air's eddies turn a dipole, rad/s.                 |
| `glint_share(α, \|s + v\|, sweep)` | The share of its dipoles that glint to the eye over a frame.    |
| `SUN_RADIUS_RAD`                   | The sun's angular radius.                                       |
| `chaff_bloom(chaff, age)`          | How far the cloud has bloomed, 0 to 1.                          |

## The programs

| export                                  | what it is                                     |
| --------------------------------------- | ---------------------------------------------- |
| `default_program()`                     | Two flares, four times.                        |
| `program_releases(program, dispensers)` | Each release's time from the press, and where. |

The glare, the haze and the exposure are core's: `glare_psf`, `extinction`,
`transmission`, `exposure_ev100` and the rest, from `@aeronautic/core`.
