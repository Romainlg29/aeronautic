---
title: Mixing
description: "From a stick, pedals and a throttle to each part's angle: throw, travel, senses and drives."
---

The flight holds what the pilot asks for: `pitch`, `roll` and `yaw` from −1 to
1, `throttle` to 1.1, `flaps`, `airbrake` and `gear` from 0 to 1. Each part
turns that into an angle, in two steps: a **command**, in the part's terms,
then a **value**, in its unit.

## Throw and travel

A surface that deflects both ways takes a share of its **throw**, −1 to 1.
`deflect` gives a share of `max` one way and of `−min` the other, so a
surface that goes 25° up and 15° down reaches both at full stick.

A part that goes one way, a flap or an air brake, takes a share of its
**travel**, 0 to 1, from `min` to `max`.

## Senses

Each kind has a positive sense the mixing is written in: trailing edge down,
a rudder's trailing edge right, an exhaust down and right. A model that calls
the other way positive says so in its `positive` extra, and `sense_of` turns
the command round.

A roll needs one more: the left wing's trailing edges go down to roll right,
the right wing's up. `roll_sense` is `1` on the left, `−1` on the right.

## What each part reads

| kind               | command                                                             |
| ------------------ | ------------------------------------------------------------------- |
| aileron            | `roll × roll_sense`                                                 |
| elevator           | `−pitch`: stick back, trailing edge up                              |
| elevon, stabilator | `−pitch × share + roll × roll_sense × (1 − share)`, `share` 0.6     |
| canard             | `pitch`: ahead of the wing, its trailing edge goes down for nose up |
| rudder             | `yaw`                                                               |
| flap               | `flaps`                                                             |
| le_flap            | `(alpha − 2°) × 1.4` past 2°, plus `flaps × max`, in degrees        |
| airbrake, spoiler  | `airbrake`                                                          |
| drag_rudder        | `airbrake`, plus the yaw toward its side, to 1                      |
| stick, pedals      | `pitch`, `roll`, `yaw`                                              |
| throttle lever     | `throttle`, past the reheat detent above 1                          |
| gear legs          | `1 − gear`, for the parts whose `positive` is a retraction          |
| gear doors         | `gear × rest`: open to the pose they were modelled in               |

An engine's petals follow its throttle on a schedule: 0.45 open at idle,
closing to 0 at military power, then opening to 1 by full reheat. Its gimbal
takes the stick's pitch and the pedals' yaw, so the exhaust goes up with the
stick back and right with the right pedal. With a round limit, the pair is
scaled back onto the ellipse when it falls outside.

## Which drive moves a part

Several drives can take one part: `<FighterControls>` takes every rudder, and
a `<Rudders side="left">` beside it the left one. The more specific drive
wins:

| selects by | specificity |
| ---------- | ----------- |
| `parts`    | 3           |
| `group`    | 2           |
| `kinds`    | 1           |
| a `side`   | + 0.5       |

Between two as specific, the later one wins. Disposing a drive hands its
parts to the next that takes them, or back to rest.

A part a driven clip moves is left to the clip, so a gear retraction keeps
its legs and doors in the order they were animated.
