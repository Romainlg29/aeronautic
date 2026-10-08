---
title: The plume
description: "How fast the exhaust mixes, how much ice it holds, and how much light that ice stops."
---

## Dilution

How fast an exhaust plume mixes is measured. In more than seventy
encounters behind airliners at cruise, Schumann et al. (1998) found the mass
of air a kilogram of fuel's exhaust has mixed with growing as

```
N = 7000 · (t / 1 s)^0.8
```

from 6 ms to hours. Everything about the plume at an age follows from `N`.

## Its width

A metre of trail holds the exhaust of the fuel burnt over that metre, mixed
with `N` times its mass of air. At the plume's density that is an area, and
the plume's Gaussian cross-section has the standard deviation that holds it:

```
σ = √(N · fuel per metre / (2π ρ))
```

For the fighter at 11 km: 1.8 m at a second, 4.4 m at ten, 9 m at a minute.

## Its ice

Once frozen, the crystals take up or give back vapour far faster than the
plume changes, so the plume is held at saturation over ice. Its ice per
kilogram of air is the water it holds, the air's own and the exhaust's, less
what saturation over ice leaves as vapour.

- In air **under** ice saturation, mixing brings in dry air until the ice is
  gone: the trail's end.
- In air **over** it, mixing brings in more vapour than it dilutes: the ice
  grows, slowly, for as long as the air stays supersaturated.

## Its crystals

Every soot particle that activates holds one crystal, about 10¹⁵ per
kilogram of kerosene, and they share the ice. A young contrail's crystals are
under a micron: 0.6 µm at a second. Hydrogen, with no soot, makes a hundred
times fewer, which grow to 6 µm from the same air.

## How much light it stops

Each crystal's extinction cross-section is its geometric one times an
efficiency from van de Hulst's anomalous diffraction, about two for crystals
much larger than the light, less for smaller. Summed across the plume, that
gives an extinction per metre of trail; through the plume's axis, side on,
its optical depth is

```
τ = extinction per metre / (√(2π) σ)
```

about 0.9 for the fighter at a second, 0.4 at ten, 0.2 at a minute: opaque
when young, and a thin veil as it spreads.

## Fuel per metre

The trail's ice and its width scale with the fuel each metre was laid with,
which the history keeps for every stretch: a stretch flown at 2 g, with twice
the drag, is thicker than one flown level.
