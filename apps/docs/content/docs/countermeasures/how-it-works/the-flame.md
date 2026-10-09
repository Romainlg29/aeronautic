---
title: The flame
description: "From what it burns to what the eye sees."
---

What the flame radiates follows from what it burns: Debnath et al.'s Eq. 1,
I = ṁ Hc F ε / 4π, measured for MTV1 as one number, 179 W s/(sr g) between
1.8 and 2.6 µm, a seeker's band. Over the burn it radiates 179 J/sr in that
band for each gram, 45 kJ/sr in all.

That is in the infrared. The flame's temperature carries it to the eye. An
MTV flame is 2000 to 2200 K, emissivity about 0.95: as a graybody at 2100 K,
its luminance over its radiance in the band is the candela each W/sr of the
band brings. The band's intensity over its radiance is the flame's area, a
disc about 60 cm across as it lights.

So an MJU-7 is about 250,000 cd as it lights, and fades as its grain
shrinks. Its colour is the Planckian locus's at 2100 K, a warm white.

The graybody is checked against the old candela: a blackbody at platinum's
freezing point, 2042 K, was 60 cd/cm², and the integral over the CIE photopic
curve gives that.

## In the airstream

Static tests measure the flame still. Thrown at hundreds of metres a
second, the airstream sweeps its hot products off the grain before they
have radiated, and cools them: the flame at the grain gives less, and what
was swept off glows on behind it as a trail.

Radiating competes with being carried off, at a rate that grows with the
speed through the air, so the share left at the grain is 1 / (1 + v / v½).
The trail gives part of the rest, its light falling off by e every v × τ
metres as the products cool, so it is long at release and shrinks as the
flare slows:

| at                | at the grain | trail's e-fold |
| ----------------- | ------------ | -------------- |
| 250 m/s, released | 38 %         | 12.5 m         |
| 60 m/s, after 1 s | 71 %         | 3 m            |
| 20 m/s, falling   | 88 %         | 1 m            |

The form is the physics'; the numbers are **estimates**. No measured curve
of an MTV flare's intensity against airspeed is published openly, so v½ is
150 m/s, τ is 0.05 s, about how long micron-sized oxide stays white-hot in
cold air, and the trail gives half of what is swept off. All three are
dials on `flare`: `halfLightMPerS`, `glowTimeS`, `trailShare`.

## Left out

- **Altitude's toll**: thinner air cools the flame less and feeds it less.
  The airstream's share is the same at every altitude.
- **The trail's colour**: it cools as it goes, and reddens. It is drawn in
  the flame's colour.
- **The smoke**: the magnesium oxide and carbon the flame leaves, to come.
