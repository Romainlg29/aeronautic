---
title: Flight
description: "The Flight class, what it holds, and default_flight_input."
---

```ts
import { Flight, default_flight_input } from "@aeronautic/core";
```

## `new Flight(input?)`

One aircraft's flight. `input` is a `Partial<FlightInput>` over
`default_flight_input()`.

| member                             | what it is                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `values`                           | `FlightValues`: one object for the flight's life, written in place. Read it, don't write it    |
| `version`                          | counts the writes that changed something                                                       |
| `air`                              | the `MoistAir` it flies through, as `moist_air` gives it                                       |
| `set(input)`                       | writes the fields given, keeps the rest. Does nothing when nothing changed. Returns the flight |
| `subscribe(listener)`              | calls `listener` after each write that changed something. Returns what stops it                |
| `track(object, delta_s, options?)` | works the flight out from how `object` moved since the last call. Returns the flight           |
| `reset_tracking()`                 | the next `track` only starts watching                                                          |

## `FlightInput`

What can be written. Defaults are `default_flight_input()`'s.

| field                  | default | unit     | meaning                                      |
| ---------------------- | ------- | -------- | -------------------------------------------- |
| `airspeed_m_s`         | 0       | m/s      | true airspeed                                |
| `angle_of_attack_rad`  | 0       | rad      | positive with the nose above the flight path |
| `sideslip_rad`         | 0       | rad      | positive when the air blows from the right   |
| `load_factor`          | 1       | g        | lift over weight                             |
| `roll_rate_rad_s`      | 0       | rad/s    | right wing down positive                     |
| `pitch_rate_rad_s`     | 0       | rad/s    | nose up positive                             |
| `yaw_rate_rad_s`       | 0       | rad/s    | nose right positive                          |
| `throttle`             | 1       | 0 to 1.1 | 0 idle, 1 military power, 1.1 full reheat    |
| `roll`                 | 0       | −1 to 1  | the stick, right positive                    |
| `pitch`                | 0       | −1 to 1  | the stick, aft positive                      |
| `yaw`                  | 0       | −1 to 1  | the pedals, right positive                   |
| `flaps`                | 0       | 0 to 1   | fully down at 1                              |
| `airbrake`             | 0       | 0 to 1   | fully out at 1                               |
| `gear`                 | 0       | 0 to 1   | down at 1                                    |
| `altitude_m`           | 0       | m        | above sea level                              |
| `temperature_offset_k` | 0       | K        | how much warmer than the standard day        |
| `relative_humidity`    | 0.6     | 0 to 1   |                                              |

## `FlightValues`

`FlightInput`, and what follows from it:

| field                 | unit  | meaning                                                                 |
| --------------------- | ----- | ----------------------------------------------------------------------- |
| `mach`                |       | airspeed over the speed of sound                                        |
| `dynamic_pressure_pa` | Pa    | ½ρV²                                                                    |
| `temperature_k`       | K     | the air's, the day's offset included                                    |
| `pressure_pa`         | Pa    | the air's static pressure                                               |
| `pressure_ratio`      |       | over sea level's 101 325 Pa                                             |
| `density_kg_m3`       | kg/m³ | the moist air's                                                         |
| `density_ratio`       |       | over 1.225 kg/m³, sea level's on a standard day                         |
| `sound_m_s`           | m/s   | the speed of sound                                                      |
| `dew_point_k`         | K     | where the vapour would condense                                         |
| `ram`                 |       | stagnation over static pressure an inlet recovers, `ram_pressure(mach)` |

## `FlightTrackOptions`

What `track` takes as its third argument, and `<FlightProvider>` as props.

| option        | default      | meaning                                                          |
| ------------- | ------------ | ---------------------------------------------------------------- |
| `forward`     | `[0, 0, -1]` | which way the object flies, in its own frame                     |
| `up`          | `[0, 1, 0]`  | which way is its up, in its own frame                            |
| `position`    | `[0, 0, 0]`  | the frame's origin, in the object's frame                        |
| `sea_level_y` | none         | world height of sea level. Left out, the altitude is not tracked |
| `wind`        | none         | the wind in world space, m/s                                     |
| `world_up`    | `[0, 1, 0]`  | which way gravity pulls against, in world space                  |

`track` writes `airspeed_m_s`, `angle_of_attack_rad`, `sideslip_rad`,
`load_factor`, the three rates and, with `sea_level_y`, `altitude_m`. A first
call, a `delta_s` of zero or less, or one over 0.25 s only starts watching.
