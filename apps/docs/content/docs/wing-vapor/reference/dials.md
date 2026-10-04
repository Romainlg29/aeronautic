---
title: Dials
description: "Every field of the airframe, the flight, the air, the look and the effects, with its default."
---

Every dial is a physical quantity, in metres, radians, seconds and kelvin. The
defaults are the `default_vapor_*` functions' and describe the docs' fighter
on a humid summer day.

## `VaporAirframe`

The aircraft, in its own frame: it flies along `forward` with `up` up, and
every station is measured from the component's origin, usually the model's.
`capture` measures everything here but the mass, the leading edge's sharpness
and the cores.

| field                   | default | what it is                                                                                        |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `spanM`                 | `14`    | Tip to tip.                                                                                       |
| `rootChordM`            | `9.2`   | The chord where the edges, carried inboard, meet the centreline.                                  |
| `tipChordM`             | `1.6`   | The chord at the tip.                                                                             |
| `leadingEdgeSweepRad`   | 55°     | How far the leading edge is swept. Past about 45° its flow separates into a vortex over the wing. |
| `apexM`                 | `-5.66` | Where the leading edge meets the centreline, aft of the origin. Negative is ahead.                |
| `wingHeightM`           | `0.08`  | How high the wing's mid-plane is above the origin.                                                |
| `dihedralRad`           | -3°     | Dihedral; negative is anhedral.                                                                   |
| `thickness`             | `0.06`  | Thickness over chord: a fighter's is 4 to 6 %, an airliner's 10.                                  |
| `rootSpanM`             | `1.6`   | How far out the wing leaves the body.                                                             |
| `noseM`                 | `9.9`   | How far ahead of the origin the nose is.                                                          |
| `fuselageLengthM`       | `18.5`  | The body of revolution standing in for the fuselage, for the cone.                                |
| `fuselageRadiusM`       | `1.4`   | Its largest radius.                                                                               |
| `fuselageHeightM`       | `0`     | How high its axis is above the origin.                                                            |
| `massKg`                | `20000` | Only for the load factor and `angle_of_attack_for_load`: the vapor follows lift, not weight.      |
| `leadingEdgeSharpness`  | `1`     | 1 for a chined fighter or a delta, about 0.5 for a round-nosed wing.                              |
| `tipCoreRadius`         | `0.02`  | The tip vortex's core just behind the wing, as a share of the span.                               |
| `tipCoreShare`          | `0.35`  | How much of the circulation that core holds.                                                      |
| `leadingEdgeCoreRadius` | `0.02`  | The leading-edge vortex's core, as a share of the local semispan.                                 |

## `VaporFlight`

| field              | default | what it is                                                                              |
| ------------------ | ------- | --------------------------------------------------------------------------------------- |
| `airspeedMPerS`    | `300`   | True airspeed.                                                                          |
| `angleOfAttackRad` | 8°      | Between the wing's chord plane and the oncoming air.                                    |
| `sideslipRad`      | —       | How far the air comes from one side. Positive blows from +Z in the canonical frame.     |
| `rollRateRadPerS`  | —       | About the flight path, the +Z wing going down. Left out, measured from what it follows. |

## `VaporAir`

| field                | default | what it is                                                      |
| -------------------- | ------- | --------------------------------------------------------------- |
| `altitudeM`          | `300`   | Above sea level, through the International Standard Atmosphere. |
| `temperatureOffsetK` | `5`     | How much warmer the day is than the standard one.               |
| `relativeHumidity`   | `0.85`  | 0 to 1. Everything comes down to this.                          |

## `VaporLook`

`sunColor` and `skyColor` take linear `[r, g, b]`, or any three.js
`ColorRepresentation` (`"#ffeedd"`, `0xffeedd`, a `Color`), converted to linear.

| field            | default             | what it is                                                                      |
| ---------------- | ------------------- | ------------------------------------------------------------------------------- |
| `sunDirection`   | `[0.4, 0.8, 0.3]`   | Towards the sun, in world space.                                                |
| `sunColor`       | `[1, 0.96, 0.9]`    | The sun's colour.                                                               |
| `sunIntensity`   | `3`                 | Its brightness, in the scene's light units.                                     |
| `skyColor`       | `[0.55, 0.68, 0.9]` | The sky's light, the same from every direction.                                 |
| `skyIntensity`   | `1`                 | Its brightness.                                                                 |
| `exposure`       | `1`                 | A multiplier on the light the vapor scatters.                                   |
| `dropletRadiusM` | `1e-6`              | The droplets' effective radius. Extinction goes as one over it.                 |
| `humiditySpread` | `0.06`              | How unevenly moist the air is, as a share of its humidity.                      |
| `eddyM`          | `0.6`               | How large the patches of moister air are.                                       |
| `shutterS`       | `1 / 60`            | How long the shutter is open: the patches streak by what the air travels in it. |
| `anisotropy`     | `0.75`              | How forward-scattering the droplets are, -1 to 1.                               |

## `VaporEffects`

All on by default. Compiled in: changing them rebuilds the material.

| field                 | what it draws                                                         |
| --------------------- | --------------------------------------------------------------------- |
| `tipVortices`         | The tubes trailing from the wingtips, at high lift.                   |
| `leadingEdgeVortices` | The tubes over a swept wing at high angle of attack, and their burst. |
| `wing`                | The sheet over the upper surface, and its edge at a shock.            |
| `cone`                | The bell round the whole aircraft near the speed of sound.            |
| `selfShadow`          | Whether the vapor shades itself from the sun.                         |
