---
title: The climates
description: "Every climate's air, field by field, and what it makes."
---

From `@aeronautic/weather`, as `CLIMATES`. Each field is its mean ±
the system's pattern / the local pattern's (see
[climates](/docs/weather/guides/climates)).

## The air

| climate     | `humidity`     | `warmthK`   | `capM`          | `midHumidity`  | `highHumidity` | `liftMPerS`      |
| ----------- | -------------- | ----------- | --------------- | -------------- | -------------- | ---------------- |
| `clear`     | 0.45 ± .08/.06 | 0.8 ± .3/.4 | 1000 ± 300/200  | 0.25 ± .1/.05  | 0.35 ± .2/.1   | −0.02 ± .01/.005 |
| `fair`      | 0.70 ± .06/.06 | 1.2 ± .3/.5 | 2000 ± 300/300  | 0.40 ± .15/.1  | 0.50 ± .2/.15  | 0 ± .02/.01      |
| `unsettled` | 0.78 ± .06/.06 | 1.8 ± .4/.6 | 4500 ± 1500/800 | 0.60 ± .15/.1  | 0.65 ± .2/.15  | 0.01 ± .03/.01   |
| `stormy`    | 0.80 ± .06/.05 | 2.2 ± .5/.6 | 12000           | 0.65 ± .15/.1  | 0.75 ± .2/.15  | 0.03 ± .03/.01   |
| `overcast`  | 0.82 ± .05/.03 | 0.4 ± .2/.2 | 900 ± 200/120   | 0.55 ± .15/.1  | 0.50 ± .2/.1   | 0 ± .01/.005     |
| `frontal`   | 0.85 ± .05/.04 | 0.5 ± .2/.2 | 1500 ± 400/200  | 0.80 ± .12/.06 | 0.90 ± .15/.1  | 0.06 ± .04/.015  |

## The rest

| climate     | `temperatureOffsetK` | `airMass`   | `wind` | `upperWind` | `tropopauseM` | `stormSpacingM` |
| ----------- | -------------------- | ----------- | ------ | ----------- | ------------- | --------------- |
| `clear`     | 0                    | continental | 6, 2   | 25, 5       | 11000         | 30000           |
| `fair`      | 0                    | continental | 6, 2   | 25, 5       | 11000         | 30000           |
| `unsettled` | 4                    | continental | 6, 2   | 25, 5       | 11000         | 30000           |
| `stormy`    | 12                   | continental | 6, 2   | 25, 5       | 12000         | 25000           |
| `overcast`  | 0                    | maritime    | 8, 3   | 25, 5       | 11000         | 30000           |
| `frontal`   | 0                    | continental | 12, 4  | 35, 8       | 11000         | 30000           |

All of them: `groundM` 0, `latitudeDeg` 45, `systemM` 400 km, `localM`
30 km, `evolutionS` three hours, the altostratus from 3.5 km, 1.5 km deep,
and the cirrus from 8.5 km, 1.5 km deep.

## What they make

Over 400 km of ground, seed 1:

| climate     | cumulus base, mean | cumulus cover, mean | deck cover, mean | rain                                          |
| ----------- | ------------------ | ------------------- | ---------------- | --------------------------------------------- |
| `clear`     | 1580 m             | 0                   | 0.01             | none                                          |
| `fair`      | 830 m              | 0.18, 0 to 0.35     | 0                | at most 0.3 mm/h                              |
| `unsettled` | 715 m              | 0.32                |                  | showers, 5 mm/h mean, 17 at most              |
| `stormy`    | 745 m              |                     |                  | 20 mm/h mean under storms                     |
| `overcast`  | 430 m              |                     | 0.89, 0.23 least | drizzle, at most 0.65 mm/h                    |
| `frontal`   | 375 m              |                     |                  | at most 1 mm/h, altostratus 0.64, cirrus 0.82 |

The showers' onset, the depth a cumulus rains past: 1.1 to 1.4 km over land,
400 m over the sea.
