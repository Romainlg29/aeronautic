---
title: The air and the parcel
description: "Why the cloud forms where the pressure drops, and why humidity decides everything."
---

Wing vapor is not smoke and not exhaust. It is the day's own water, condensed
for a moment where the air round the aircraft is expanded enough to cool past
its dew point. So the package starts with the air.

## The air

The International Standard Atmosphere gives the pressure, temperature and
density at the altitude, shifted by the day's temperature offset. The vapor
sits on top:

- its partial pressure, from the relative humidity times Magnus's saturation
  pressure over liquid water (the droplets are supercooled, so never over ice);
- the mixing ratio, kilograms of vapor per kilogram of dry air;
- the dew point, where that vapor would start to condense if cooled at this
  pressure.

`moist_air` works all of it out on the main thread.

## The parcel

Air swept past a wing has its pressure dropped in well under a millisecond,
far too fast for heat to flow in, so it expands adiabatically and cools. Past
its dew point the vapor condenses, and gives up its latent heat. That warms
the parcel back up, and holds the cloud to far less water than a dry
expansion would suggest.

The parcel is solved on the moist adiabat. The liquid water it holds, against
the pressure ratio it is expanded to, goes into a small lookup table, made
once per day and altitude. That table is why `updateAir` costs more than
`updateFlight`: a few hundred adiabats.

## Why humidity decides everything

The cooling a wing or a vortex makes is tens of kelvin at most. A day whose
dew point is further below the air's temperature than that stays clear
however hard the pull. At 30 % on a warm day nothing fogs. At 95 % a gentle
turn trails its tips.

The field everywhere else is a question of how far the pressure drops: the
[lift](../the-lift/) sets how strong the vortices and the suction are, and
[the pressure field](../the-pressure-field/) adds them up.
