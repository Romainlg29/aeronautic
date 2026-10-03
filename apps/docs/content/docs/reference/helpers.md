---
title: Passes and helpers
description: "afterburner_pass, presets, the atmosphere, propellants and the jet on the CPU."
---

## `afterburner_pass(scene, camera, options?)`

Draws the plumes in a pass of their own, at a share of the frame, and
composites them depth-aware. See [Half resolution](../../guides/half-resolution/).

| option             | default | what it is                                  |
| ------------------ | ------- | ------------------------------------------- |
| `resolution_scale` | `0.5`   | The plumes' resolution against the frame's. |

It returns an `AfterburnerPass`: `{ output, scene, backdrop, scene_pass, plume_pass }`.

## Presets

| export                                         | what it is                                                     |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `AFTERBURNER_PRESETS`                          | Every built-in preset, `{ params, profile, propellant? }`.     |
| `AFTERBURNER_QUALITY`                          | The quality presets.                                           |
| `get_afterburner_preset(preset?)`              | A name or object to its preset. None: `afterburner_turbulent`. |
| `resolve_afterburner_params(input?, preset?)`  | Complete params over a preset and the defaults.                |
| `resolve_afterburner_profile(input?, preset?)` | Complete profile likewise.                                     |
| `resolve_afterburner_quality(input?)`          | Complete quality.                                              |
| `default_afterburner_params()`                 | Fresh defaults. Safe to mutate.                                |
| `default_afterburner_profile()`                | Fresh defaults.                                                |
| `default_afterburner_quality()`                | Fresh defaults.                                                |

## The air

| export                            | what it is                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `standard_atmosphere(altitude_m)` | ISA temperature (K) and pressure (share of sea level), to 86 km.                                            |
| `atmosphere(profile)`             | `AirState`: `{ temperature_k, pressure, density, sound_m_s, ram }`, the day and the ram of flight included. |

## Propellants

| export                                      | what it is                                                    |
| ------------------------------------------- | ------------------------------------------------------------- |
| `equivalence_ratio(propellant)`             | Fuel over oxidiser against stoichiometric. Above one is rich. |
| `propellant_effects(propellant)`            | The soot, soot survival and afterburning the mix makes.       |
| `propellant_params(propellant, reference?)` | The params it sets, scaled from a reference engine if given.  |

`Propellant` is `{ fuel: "kerosene" | "methane" | "hydrogen", mixture_ratio }`.

## The jet on the CPU

The same physics the shader runs, for gameplay and UI:

| export                                                     | what it is                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `jet_state(params, throttle, profile, scale?)`             | `JetState`: the expanded jet, core length, spreads, shock spacing, reach, soot formed… |
| `burner_lit(throttle, profile)`                            | How much reheat is lit, 0 to 1.                                                        |
| `jet_half_width(x_m, state)`, `jet_centreline(x_m, state)` | The width and centreline excess at a station.                                          |
| `plume_extent(params)`                                     | How far out the field reaches, in half-widths.                                         |
| `nozzle_outline_fit(aspect, squareness)`                   | `{ area_scale, reach }`: a shaped exit against the round one of its area.              |
| `clamp_nozzle_squareness`, `NOZZLE_SQUARENESS_MIN`/`_MAX`  | The squareness range the shader draws, 0.5 to 24.                                      |
| `plume_lod`, `plume_screen_span`, `PLUME_LOD_*`            | The tier choice, as the vertex shader makes it.                                        |
| `build_plume_hull(sides)`                                  | The proxy hull geometry.                                                               |

## Light

| export                                                          | what it is                                         |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `blackbody_rgb(kelvin)`                                         | Linear RGB of a blackbody, normalised.             |
| `blackbody_luminance(kelvin)`                                   | Its luminance against the reference temperature's. |
| `get_blackbody_lut()`                                           | The lookup texture the shader samples.             |
| `REFERENCE_TEMPERATURE_K`, `BLACKBODY_MIN_K`, `BLACKBODY_MAX_K` | The constants behind it.                           |

## Material

| export                        | what it is                                               |
| ----------------------------- | -------------------------------------------------------- |
| `create_afterburner_material` | The material a batch draws with, for a mesh of your own. |
| `AFTERBURNER_ATTRIBUTES`      | The instance attribute names it reads.                   |
| `AfterburnerOutline`          | The `outline` hook: `{ radius, reach }`.                 |

A custom geometry writes the shape attributes too: `afterburner_outline` is
aspect, squareness, roll and outline length, and `afterburner_outline_fit` is
`nozzle_outline_fit`'s `area_scale` and `reach`. See
[Shaped nozzles](../../guides/nozzle-shapes/).

The rest of the shader is in `r3f-afterburner/tsl`: see
[Shader hooks and TSL](../../guides/shader-hooks/#the-tsl-itself).
