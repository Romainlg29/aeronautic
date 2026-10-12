---
title: The air
description: "The climate's fields over the ground, and the clouds worked out from them, column by column."
---

The weather is not drawn, it is worked out. At every point of the ground
there is a column of air, and the clouds over it follow from that air as a
forecaster would work them out from a sounding.

## The fields

The air over a point is six numbers: the humidity at the ground, how much
warmer than the air round it a thermal leaves the ground, how high the
inversion caps the mixed layer, the middle and high air's humidity, and how
fast the air is lifted on the large scale. Each is a field over the ground:
its mean, plus a share of the pressure system's pattern, the meso-α scale of
a few hundred kilometres (Orlanski 1975), plus a local pattern of its own,
the meso-β scale of tens of kilometres, where one cumulus field ends and the
next begins.

The system's pattern is shared by every field, so moist air is also rising
air, and both patterns change over hours. Each pattern is smooth noise,
stretched so that its typical swing, two standard deviations, is one: about
95 % of the ground is within one `system` plus one `local` of the mean. The
fields are in the air's frame, carried by the wind.

## The column

From the air over a point, `diagnose` works out the clouds over it:

- **Cumulus.** A thermal rises dry to its condensation level, the cumulus's
  base, then on the moist adiabat. It stops at the first of its equilibrium
  level, the inversion, and the height the dry air it mixes in lets it reach:
  entrainment stops cumulus in dry air well short of their equilibrium level
  (Derbyshire et al. 2004). How much of the sky they cover follows the
  humidity, Sundqvist's (1989) scheme, so that a 70 % day covers about a
  fifth of it (Neggers et al. 2003), and at most 60 %, the rest of the sky
  the subsiding air between them.
- **Stratocumulus.** Where the mixed layer under the inversion nearly
  saturates, a deck forms under it, broken where it only nearly does (Slingo
  1987). Decks are 200 to 400 m thick (Wood 2012): a cloud layer much deeper
  under the inversion is cumulus, not a deck.
- **Altostratus.** Where the middle air is humid, more where it is lifted,
  which cools it towards saturation. Deepening, it is nimbostratus, and
  rains what the ascent condenses.
- **Cirrus.** Where the high air is humid over ice.
- **Showers.** From a cumulus grown deeper than its droplets need to rain
  (see [the water](/docs/weather/how-it-works/the-water)), as hard as its
  updraft condenses.

The parcel's top and its CAPE, over every humidity and warmth, are tabulated
once per climate, so a column costs a few lookups.

## The map

The columns round the camera are baked on the CPU into the weather map:
twelve numbers a texel, the covers, the heights, the anvil, the rain and the
updraft, in three half-float textures the march reads. The air's fields are
smooth over tens of kilometres, so they are worked out on a grid four texels
apart and interpolated; the storms are drawn at the map's own resolution. A
bake is spread over frames, 1.5 ms of each, and shown whole once done. The
map fades to no cloud towards its edge, so the march never meets a hard
edge.
