---
title: Dials and radiance
description: "Why params, profile and quality are separate, and where the radiance is set."
---

## Three kinds of dial, and why they are separate

|                      | Where it lives                              | What changing it costs             | What is in it                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AfterburnerParams`  | one instance                                | a buffer write, on a version bump  | the engine, in SI units: nozzle radius, exit Mach, pressure ratio, exit and dry temperatures, gamma, molar mass, soot and its survival, particles and their albedo, afterburning, band emission, turbulence, meander, refraction  |
| `AfterburnerProfile` | batch uniforms                              | an upload                          | the world and the camera: altitude, the day's temperature offset, airspeed, exposure, sky light, the visibility cut, the longest plume, the burner threshold, the shock train's shaping, the eddies, the shutter, the step safety |
| `AfterburnerQuality` | uniforms, and one compile-time octave count | an upload; a recompile for octaves | march iterations near and mid, noise octaves                                                                                                                                                                                      |

There is no length among the params and only one colour. A plume's length
comes out of its nozzle and its gas, through the potential-core and
mixing-layer correlations. Its colour comes out of its temperature, through
Planck's law. The one exception is `band_color`, the light of the radicals
burning in the gas, which is a line spectrum and not a temperature.

The split is not tidiness. Params ride on the instance because two engines on
one airframe may burn differently and a formation may not. The attribute budget
is real: against a WebGPU floor of sixteen attributes and eight buffers, the
tier index rides in `v_origin.w` rather than taking a varying slot of its own.
The profile is uniforms because every plume shares it, and a slider on it must
not recompile a shader mid-drag. That includes the air: `atmosphere(profile)`
walks the standard atmosphere once on the main thread, and the shader is handed
temperature, pressure, density, the speed of sound and the ram as five more
uniforms. The step counts are uniforms too: WGSL loops may run to a uniform
bound, and the march breaks early anyway. Octaves stay compiled in, because an
octave the compiler cannot see is an octave it cannot fold away.

---

## Why the radiance is bounded, and where to set it

The march is not an open sum. It solves the radiative transfer along the ray:
what the gas emits at each step, attenuated by what lies in front of it
(Beer-Lambert), and a transmittance for what lies behind. Without that, a ray
running the **length** of the plume adds twenty times what a ray crossing it
adds. A plume is normally seen from behind the aircraft that is leaving, so
that would be most rays.

The emission is physical. The gas glows as a blackbody at the local
temperature, normalised so that one at 2000 K has a luminance of one
(`REFERENCE_TEMPERATURE_K`). Soot emits and absorbs as one over the wavelength,
which reddens it, and the band emission climbs as `exp(-activation_k / T)`. A
real plume therefore runs from a thousandth of the reference to a thousand
times it, and **`exposure` is the single number that decides which part of
that the tone curve sees.** It is a camera's exposure, not a brightness dial.
Set it for the hottest thing you want to keep shape in. Past that point the
core and the disks clip, which is what they do in a photograph too.

The blend is **premultiplied**, `One, OneMinusSrcAlpha`. A clean plume emits and
covers almost nothing, a sooty one covers what is behind it, and neither an
additive blend nor straight alpha does both. Three's own `premultipliedAlpha`
flag stays off: the radiance is premultiplied already, and the flag would
multiply it by the coverage a second time, so a hydrogen plume (all emission,
no coverage) would vanish.

If the plume ever looks like an airbrushed cone, check `exposure` first and
`turbulence` second.
