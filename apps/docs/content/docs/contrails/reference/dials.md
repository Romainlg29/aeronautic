---
title: Dials
description: "Every field of the airframe, the fuel, the flight, the air and the look, with its default."
---

Every dial is a physical quantity, in metres, radians, seconds, kilograms and
kelvin. The defaults are the `default_contrail_*` functions' and describe the
docs' fighter cruising at the tropopause, in air a little supersaturated over
ice.

## `ContrailAirframe`

| field           | default                               | what it is                                                                                                                       |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `massKg`        | `20_000`                              | Its mass. With the load factor, the lift the wake carries.                                                                       |
| `spanM`         | `14`                                  | Tip to tip. The vortices trail π/4 of it apart.                                                                                  |
| `liftToDrag`    | `9`                                   | Lift over drag at cruise, at 1 g. The thrust is the drag: about 18 for an airliner, 9 for a fighter.                             |
| `fuelPerThrust` | `22.7e-6`                             | Fuel per newton of thrust per second, kg/(N s): 15 mg for a modern fan at cruise, 23 for a fighter's.                            |
| `maxThrustN`    | `117_680`                             | Each engine's most thrust, sea-level static with full reheat, newtons: 12 tonnes-force. It lapses with altitude.                 |
| `dryThrustN`    | `70_608`                              | And dry, at military power: 0.6 of it. It caps a hard pull's until the burner lights. `maxThrustN` for an engine with no reheat. |
| `engines`       | `[[-0.75, 0.05, 7], [0.75, 0.05, 7]]` | Where each exhaust leaves: a position in the group's frame, or a node of the model.                                              |

## `ContrailFuel`

`fuel` takes a name or these numbers, per kilogram burnt:

| field        | kerosene | hydrogen | what it is                                               |
| ------------ | -------- | -------- | -------------------------------------------------------- |
| `waterIndex` | `1.23`   | `8.94`   | Kilograms of water vapour made.                          |
| `heatJPerKg` | `43.2e6` | `120e6`  | Its lower heating value.                                 |
| `iceIndex`   | `1e15`   | `1e13`   | Ice crystals made: one per soot particle that activates. |

## `ContrailFlight`

| field              | default | what it is                                                       |
| ------------------ | ------- | ---------------------------------------------------------------- |
| `airspeedMPerS`    | `250`   | True airspeed: Mach 0.85 at the tropopause.                      |
| `angleOfAttackRad` | `0`     | Nose above the flight path. The trails stream along the path.    |
| `sideslipRad`      | `0`     | The oncoming air from the right, positive, as a `Flight` has it. |
| `loadFactor`       | `1`     | Lift over weight, in g.                                          |
| `throttle`         | `1`     | 0 idle, 1 military power, 1.1 full reheat, as a `Flight` has it. |

## `ContrailAir`

| field                | default  | what it is                                                          |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `altitudeM`          | `11_000` | Above sea level, through the International Standard Atmosphere.     |
| `temperatureOffsetK` | `0`      | How much warmer the day is than the standard one.                   |
| `relativeHumidity`   | `0.66`   | Over water, 0 to 1. At -56.5 °C, 66 % over water is 112 % over ice. |

## `ContrailLook`

| field          | default             | what it is                                                           |
| -------------- | ------------------- | -------------------------------------------------------------------- |
| `sunDirection` | `[0.4, 0.8, 0.3]`   | Towards the sun, in world space.                                     |
| `sunColor`     | `[1, 0.96, 0.9]`    | Linear RGB, or anything three's `Color` takes.                       |
| `sunIntensity` | `3`                 | In the scene's light units.                                          |
| `skyColor`     | `[0.55, 0.68, 0.9]` | The sky's light, the same from every direction.                      |
| `skyIntensity` | `1`                 |                                                                      |
| `exposure`     | `1`                 | A multiplier on the light the ice scatters.                          |
| `anisotropy`   | `0.77`              | How forward-scattering the crystals are: a young contrail's columns. |

## `ContrailQuality`

| preset   | `points` | `puffs` |
| -------- | -------- | ------- |
| `low`    | 64       | 2048    |
| `medium` | 112      | 4096    |
| `high`   | 160      | 8192    |
| `ultra`  | 256      | 16384   |

The points are the ages the plume's width and ice are worked out at, closest
where it changes fastest, young. They stay put: each puff is laid exactly at
its own age, whatever the path does.

The puffs are the plume's eddies, about four to each width of plume, and the
most drawn on each trail. Where a trail asks for more than that, it is drawn
with fewer, larger puffs, sized so that it still wanders round its mean by the
same quarter.
