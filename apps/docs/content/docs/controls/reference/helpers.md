---
title: Helpers
description: "deflect, travel, the senses, the nozzle schedule, the throttle lever and the default mixing."
---

For writing a `from` of your own, in the same terms the parts use.

| helper                               | returns                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `deflect(part, share)`               | The value for a share of throw, −1 to 1, either side of zero, in the kind's positive sense.       |
| `travel(part, share)`                | The value for a share of travel, 0 to 1, from `min` to `max`.                                     |
| `sense_of(part)`                     | `-1` when the model calls the other way positive than the kind does, else `1`.                    |
| `roll_sense(part)`                   | Which way a roll right moves it: `1` on the left wing, `-1` on the right, `0` on the centre line. |
| `nozzle_opening(throttle, schedule)` | How open the petals are, 0 to 1.                                                                  |
| `throttle_lever(throttle, detent)`   | Where the lever sits, 0 to 1, past its reheat detent above military power.                        |
| `mix_surface(part, flight, mixing)`  | Where a part should be for a flight, in its unit, or `null` when the flight doesn't drive it.     |
| `default_control_mixing()`           | The mixing a fighter flies with.                                                                  |

```tsx
// Ailerons that droop with the flaps, as flaperons
<Ailerons
  from={(flight, part) => flight.roll * roll_sense(part) + flight.flaps * 0.5}
/>

// Spoilers that only open on the down-going wing
<Spoilers
  from={(flight, part) => Math.max(-flight.roll * roll_sense(part), 0)}
/>
```

## `ControlMixing`

| field               | default | what it is                                                |
| ------------------- | ------- | --------------------------------------------------------- |
| `elevon_pitch`      | `0.6`   | How much of an elevon's or a stabilator's throw is pitch. |
| `le_flap_per_alpha` | `1.4`   | Degrees down per degree of angle of attack.               |
| `le_flap_start_deg` | `2`     | Where the leading-edge flaps start to droop.              |
| `thrust_vectoring`  | `true`  | Vector from the stick and the pedals.                     |
| `nozzle_idle`       | `0.45`  | How open the petals are at idle.                          |
| `nozzle_military`   | `0`     | At military power.                                        |
| `nozzle_reheat`     | `1`     | At full reheat.                                           |

`NozzleSchedule` is its three `nozzle_` fields.
