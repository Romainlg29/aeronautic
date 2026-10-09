---
title: Programs
description: "Bursts, salvos and taking turns."
---

A dispenser set, an ALE-47's say, fires to a program the crew or the threat
picks. `program` is one:

| field            | default   | what it is                                                        |
| ---------------- | --------- | ----------------------------------------------------------------- |
| `burst`          | `2`       | Flares in each burst.                                             |
| `burstIntervalS` | `0.25`    | Between the flares of a burst, seconds.                           |
| `salvo`          | `4`       | Bursts in the salvo.                                              |
| `salvoIntervalS` | `1`       | Between the starts of two bursts, seconds.                        |
| `alternate`      | `true`    | Whether the dispensers take turns, or each leaves from the first. |
| `payload`        | `"flare"` | What each release throws: `"flare"` or `"chaff"`.                 |

By default, then, eight flares over three and a quarter seconds, from both
sides in turn: a pattern as wide as the aircraft, and as long as its speed
carries it in that time.

```tsx
// One flare a side, at once, and nothing more
<Countermeasures program={{ burst: 2, burstIntervalS: 0, salvo: 1 }} />
```

```tsx
// The same program, as chaff
countermeasures.current?.fire({ payload: "chaff" });
```

`fire(program)` on the ref overrides the program for one press. `stop()`
drops what is still to come of it; the flares already out burn on. `clear()`
puts them all out.

`program_releases(program, dispensers)` in `/physics` gives the schedule
itself: each release's time from the press, and its dispenser.

## Many at once

`quality` caps how many are drawn at once, the oldest dropped first, and how
many chaff clouds, and how many of the brightest flares light the scene:

| quality  | flares | chaff | point lights |
| -------- | ------ | ----- | ------------ |
| `low`    | 16     | 16    | 0            |
| `medium` | 32     | 32    | 1            |
| `high`   | 64     | 64    | 2            |
| `ultra`  | 128    | 128   | 4            |

A flare burns about three seconds, so even `low` holds a long program. A
chaff cloud lasts about half a minute.
