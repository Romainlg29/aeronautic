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

| field                      | default | what it is                                                                                        |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `span_m`                   | `14`    | Tip to tip.                                                                                       |
| `root_chord_m`             | `9.2`   | The chord where the edges, carried inboard, meet the centreline.                                  |
| `tip_chord_m`              | `1.6`   | The chord at the tip.                                                                             |
| `leading_edge_sweep_rad`   | 55°     | How far the leading edge is swept. Past about 45° its flow separates into a vortex over the wing. |
| `apex_m`                   | `-5.66` | Where the leading edge meets the centreline, aft of the origin. Negative is ahead.                |
| `wing_height_m`            | `0.08`  | How high the wing's mid-plane is above the origin.                                                |
| `dihedral_rad`             | -3°     | Dihedral; negative is anhedral.                                                                   |
| `thickness`                | `0.06`  | Thickness over chord: a fighter's is 4 to 6 %, an airliner's 10.                                  |
| `root_span_m`              | `1.6`   | How far out the wing leaves the body.                                                             |
| `nose_m`                   | `9.9`   | How far ahead of the origin the nose is.                                                          |
| `fuselage_length_m`        | `18.5`  | The body of revolution standing in for the fuselage, for the cone.                                |
| `fuselage_radius_m`        | `1.4`   | Its largest radius.                                                                               |
| `fuselage_height_m`        | `0`     | How high its axis is above the origin.                                                            |
| `mass_kg`                  | `20000` | Only for the load factor and `angle_of_attack_for_load`: the vapor follows lift, not weight.      |
| `leading_edge_sharpness`   | `1`     | 1 for a chined fighter or a delta, about 0.5 for a round-nosed wing.                              |
| `tip_core_radius`          | `0.02`  | The tip vortex's core just behind the wing, as a share of the span.                               |
| `tip_core_share`           | `0.35`  | How much of the circulation that core holds.                                                      |
| `leading_edge_core_radius` | `0.02`  | The leading-edge vortex's core, as a share of the local semispan.                                 |

## `VaporFlight`

| field                 | default | what it is                                                                              |
| --------------------- | ------- | --------------------------------------------------------------------------------------- |
| `airspeed_m_s`        | `300`   | True airspeed.                                                                          |
| `angle_of_attack_rad` | 8°      | Between the wing's chord plane and the oncoming air.                                    |
| `sideslip_rad`        | —       | How far the air comes from one side. Positive blows from +Z in the canonical frame.     |
| `roll_rate_rad_s`     | —       | About the flight path, the +Z wing going down. Left out, measured from what it follows. |

## `VaporAir`

| field                  | default | what it is                                                      |
| ---------------------- | ------- | --------------------------------------------------------------- |
| `altitude_m`           | `300`   | Above sea level, through the International Standard Atmosphere. |
| `temperature_offset_k` | `5`     | How much warmer the day is than the standard one.               |
| `relative_humidity`    | `0.85`  | 0 to 1. Everything comes down to this.                          |

## `VaporLook`

| field              | default             | what it is                                                                      |
| ------------------ | ------------------- | ------------------------------------------------------------------------------- |
| `sun_direction`    | `[0.4, 0.8, 0.3]`   | Towards the sun, in world space.                                                |
| `sun_color`        | `[1, 0.96, 0.9]`    | The sun's colour.                                                               |
| `sun_intensity`    | `3`                 | Its brightness, in the scene's light units.                                     |
| `sky_color`        | `[0.55, 0.68, 0.9]` | The sky's light, the same from every direction.                                 |
| `sky_intensity`    | `1`                 | Its brightness.                                                                 |
| `exposure`         | `1`                 | A multiplier on the light the vapor scatters.                                   |
| `droplet_radius_m` | `1e-6`              | The droplets' effective radius. Extinction goes as one over it.                 |
| `humidity_spread`  | `0.06`              | How unevenly moist the air is, as a share of its humidity.                      |
| `eddy_m`           | `0.6`               | How large the patches of moister air are.                                       |
| `shutter_s`        | `1 / 60`            | How long the shutter is open: the patches streak by what the air travels in it. |
| `anisotropy`       | `0.75`              | How forward-scattering the droplets are, -1 to 1.                               |

## `VaporEffects`

All on by default. Compiled in: changing them rebuilds the material.

| field                   | what it draws                                                         |
| ----------------------- | --------------------------------------------------------------------- |
| `tip_vortices`          | The tubes trailing from the wingtips, at high lift.                   |
| `leading_edge_vortices` | The tubes over a swept wing at high angle of attack, and their burst. |
| `wing`                  | The sheet over the upper surface, and its edge at a shock.            |
| `cone`                  | The bell round the whole aircraft near the speed of sound.            |
| `self_shadow`           | Whether the vapor shades itself from the sun.                         |
