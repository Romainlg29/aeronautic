---
title: Physics
description: "What @aeronautic/lights/physics exports."
---

Everything the lights are worked out from, for a tool, a test or a HUD.

## The rule

| export                                                             | what it is                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `navigation_intensity(side, az, el)`                               | A position light's intensity in a direction, cd. Azimuth from dead ahead, positive left. |
| `NAV_FORWARD_CD`, `NAV_AFT_CD`                                     | The minima in the horizontal plane, 25.1391.                                             |
| `NAV_VERTICAL`                                                     | The share of them above and below, 25.1393.                                              |
| `NAV_ARC_DEG`, `NAV_OVERLAP_CD`                                    | Each light's arc, 25.1387, and the most it may spill past it, 25.1395.                   |
| `ANTICOLLISION_CD`, `ANTICOLLISION_RATE`, `ANTICOLLISION_VERTICAL` | 25.1401's least intensity, flash rate and vertical shares.                               |

## The flash

| export                                   | what it is                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `pulse_at`, `pulse_energy`               | A flash's shape, and its light over a time, as shares of its peak.              |
| `blondel_rey_window`, `effective_ratio`  | The window the rule integrates over, and the effective intensity per unit peak. |
| `peak_intensity`, `perceived_duration`   | The peak a flash needs for an effective intensity, and how long it seems.       |
| `flash_at(pulse, period, t, perception)` | Its brightness now, as a share of its effective intensity.                      |

## Colour, air and eye

| export                                            | what it is                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `planckian(T)`, `chromaticity_rgb(xy)`            | A blackbody's chromaticity, and a chromaticity in linear sRGB at a luminance of one.  |
| `is_aviation_red`, `_green`, `_white`             | Whether a chromaticity is in the rule's region, 25.1397.                              |
| `extinction(visibility, density)`                 | The air's extinction per metre at 680, 550 and 440 nm.                                |
| `transmission(air, d)`, `density_ratio(altitude)` | What a path lets through, and the air's density at an altitude.                       |
| `glare_psf(θ, observer)`                          | CIE 146's glare spread function, per steradian per lux.                               |
| `glare_scattered`, `glare_core`, `glare_radius`   | What the eye scatters, what is left in the light's disc, and how far the glare shows. |

## Lamps

| export                                | what it is                                              |
| ------------------------------------- | ------------------------------------------------------- |
| `beam_intensity(lamp, x, y, z)`       | A lamp's intensity in a direction of its own frame, cd. |
| `beam_half_angles(lamp, share)`       | How far out the beam falls to a share of its peak.      |
| `beam_range(lamp, air, floor)`        | How far along it its light in the air is worth drawing. |
| `rayleigh_phase`, `henyey_greenstein` | How the air and its haze scatter, by angle.             |
| `exposure_ev100(ev)`                  | The number a camera at an EV100 draws one cd/m² as.     |
