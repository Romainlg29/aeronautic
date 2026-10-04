---
title: Helpers
description: "The physics and the capture, exported for the main thread, and the TSL."
---

The physics the vapor is drawn from is all on the CPU too, tested, and
exported from `@aeronautic/wing-vapor/physics`. The capture (`capture_airframe`,
`measure_airframe`, `serialize_capture`…) is at the package root.

## The air

The air is [`@aeronautic/core`](../../../core/reference/atmosphere/)'s: import
`moist_air`, `standard_atmosphere`, `saturation_pressure`, `dew_point`,
`mixing_ratio` and the constants `AIR_GAMMA`, `AIR_GAS_CONSTANT`, `AIR_CP` and
`LATENT_HEAT` from `@aeronautic/core`. So is the depth capture: `capture_views`,
`depth_views` and the rest are [the core's](../../../core/reference/capture/).
The condensation below is this package's.

| export                                                                     | what it does                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moist_air(altitude_m, humidity, offset_k?)`                               | The air at one altitude with the water in it: temperature, pressure, density, the speed of sound, the vapor's pressure, mixing ratio and dew point. |
| `standard_atmosphere(altitude_m)`                                          | The International Standard Atmosphere's temperature and pressure.                                                                                   |
| `saturation_pressure(kelvin)`                                              | Magnus's saturation pressure over liquid water.                                                                                                     |
| `dew_point(vapour_pa)`                                                     | Where that vapor would start to condense.                                                                                                           |
| `mixing_ratio(vapour_pa, pressure_pa)`                                     | Kilograms of vapor per kilogram of dry air.                                                                                                         |
| `condensate`, `condensation_table`, `cloud_extinction`, `saturation_ratio` | The moist adiabat, and the liquid water it holds.                                                                                                   |

## The lift

| export                                                     | what it does                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `angle_of_attack_for_load(airframe, g, airspeed_m_s, air)` | The angle of attack that pulls a load factor. Stalled past the wing's maximum. |
| `flight_state(airframe, flight, air)`                      | Mach, lift, load factor, circulations and how far breakdown has reached.       |
| `lift_coefficient`, `lift_slope`, `polhamus`               | DATCOM's slope and Polhamus's vortex lift.                                     |
| `breakdown_angles`, `breakdown_fraction`                   | Where vortex breakdown stands on the wing.                                     |
| `karman_tsien`, `critical_pressure`, `pressure_ratio`      | Compressibility.                                                               |
| `planform`, `sweep_at`                                     | The wing's area, aspect ratio and sweep along the chord.                       |

## The field

`vapor_state` works the whole field out, as the shader sees it.
`tip_deficit`, `edge_deficit`, `wing_deficit`, `cone_deficit` and
`vapor_deficit` are its pressure deficits (one minus the pressure ratio) at a
point of the canonical frame, x aft, y up and z along the span.

## The capture

| export                                                 | what it does                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `capture_airframe(object, options?)`                   | Six depth views of a model, measured. Needs no renderer, so it runs in Node. |
| `capture_airframe_async(object, options?)`             | The same, a few milliseconds at a time.                                      |
| `serialize_capture(measured)`                          | A measurement as plain, versioned JSON.                                      |
| `deserialize_capture(baked)`                           | Read one back. Refuses a bake of another version.                            |
| `capture_views`, `depth_views`, `measure_airframe`     | The steps of the capture, one by one.                                        |
| `shape_planform`, `trapezoid_shape`, `lattice_loading` | The wing as a table of stations, and its loading.                            |

## `@aeronautic/wing-vapor/tsl`

Every piece the material is made of, for building a material of your own:

- **The field:** `vapor_field`, and its parts `tip_vortex`, `edge_vortex`,
  `wing_sheet` and `vapor_cone`.
- **Noise:** `hash_cell`, `value_noise`, `patchiness`.
- **The material:** `create_vapor_material`, `create_vapor_uniforms`,
  `create_vapor_table`, `create_shape_texture`, and the writers that fill them.
