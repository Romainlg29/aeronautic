---
title: The atmosphere
description: "The standard atmosphere's layers, the day's offset and the water in the air."
---

## The standard atmosphere

The International Standard Atmosphere is a table of layers, each with a
constant lapse rate: the temperature falls 6.5 K a kilometre to 11 km, holds
to 20 km, then rises, and so on to 86 km. Above that it is held isothermal, to
a ceiling of 120 km.

Within a layer the pressure follows from the hydrostatic equation. A layer
whose temperature changes gives a power law; one that holds gives an
exponential. `standard_atmosphere` walks the layers up to the altitude, so the
pressure at the top of one is the bottom of the next.

## The day

A real day is warmer or colder than the standard one. `temperature_offset_k`
warms the air at the standard pressure, so a hot day at the same altitude has
the same pressure but thinner air, and a faster speed of sound.

## The water

The humidity is relative, as a weather report gives it: a share of what the
air could hold at its temperature. What it could hold is the saturation
pressure, from the Magnus fit of Alduchov and Eskridge, over liquid water even
below freezing: the droplets a sudden expansion makes are supercooled, and
freeze far too slowly to matter in the tenth of a second they live.

From the vapour pressure follow:

- the **density**, the vapour being lighter than the dry air it replaces, so
  humid air is a little thinner;
- the **mixing ratio**, kilograms of vapour a kilogram of dry air;
- the **dew point**, the Magnus fit inverted: where the air would condense if
  cooled at its pressure.

The vapor reads the dew point to know how far an expansion has to cool the air
before it fogs.

## The inlet

`ram_pressure` is the stagnation pressure over the static one that an inlet
recovers. Below Mach 1 it is the isentropic ratio. Above, a supersonic inlet's
shocks lose some, as MIL-E-5007 schedules it: 1 − 0.075 (M − 1)^1.35 of it is
kept.
