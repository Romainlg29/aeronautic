---
title: Light
description: "The haze, the eye's glare, the exposure and a blackbody's colour, shared by the lights and the flares."
---

What a bright point of light needs to be drawn as the eye sees it, shared by
`@aeronautic/lights` and `@aeronautic/countermeasures`.

## The haze

| export                                              | what it is                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `extinction(visibility, density)`                   | The air's extinction per metre at 680, 550 and 440 nm: molecules and haze. |
| `transmission(air, d)`                              | What a path of `d` metres lets through, per channel.                       |
| `density_ratio(altitude)`                           | The air's density at an altitude over sea level's.                         |
| `KOSCHMIEDER`, `RAYLEIGH_SEA_LEVEL`                 | 3.912, and the molecules' extinction at sea level.                         |
| `ANGSTROM_EXPONENT`, `AEROSOL_ALBEDO`, `_ASYMMETRY` | The haze's spectral slope, and how it scatters.                            |
| `WAVELENGTHS_NM`                                    | The three wavelengths the channels stand for.                              |

## The eye

| export                                          | what it is                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `glare_psf(θ, observer)`                        | CIE 146's glare spread function, per steradian per lux.                               |
| `glare_scattered`, `glare_core`, `glare_radius` | What the eye scatters, what is left in the light's disc, and how far the glare shows. |
| `GLARE_MIN_DEG`, `GLARE_MAX_DEG`                | Where CIE 146 holds: a tenth of a degree to a hundred.                                |
| `exposure_ev100(ev)`                            | The number a camera at an EV100 draws one cd/m² as.                                   |

## Colour

| export                 | what it is                                            |
| ---------------------- | ----------------------------------------------------- |
| `planckian(T)`         | A blackbody's chromaticity at a temperature.          |
| `chromaticity_rgb(xy)` | A chromaticity in linear sRGB, at a luminance of one. |

## Drawing the glare

One quad a light, sized to its glare's reach, in a mesh of
`create_glare_geometry(count)` with `create_glare_material(uniforms)`. Each
frame, `lay_glare(geometry, index, camera, light)` lays one, `hide_glare`
clears one, and `glare_laid(geometry, count)` sends them. `glare_pixel`
gives a pixel's angle for the camera, the least a light's disc is drawn as.
