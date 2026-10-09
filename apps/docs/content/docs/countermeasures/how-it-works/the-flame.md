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

What carries the products off is the air's mass flux, ρ v, not its speed:
v½ is sea level's, and grows as the air thins. At 250 m/s the grain keeps
37 % of its light at sea level, 53 % at 6 km and 70 % at 12 km.

## Higher up

MTV's burn rate goes with the pressure to a small power: r = 9.39 p^0.094
mm/s, p in MPa, from strand-burner tests between 0.15 and 1.15 MPa
(Nihon University). The flare's rate is sea level's, and thinner air slows
it, so it burns longer:

| altitude | pressure | burns  |
| -------- | -------- | ------ |
| 0        | 101 kPa  | 2.93 s |
| 1 km     | 90 kPa   | 2.96 s |
| 6 km     | 47 kPa   | 3.15 s |
| 12 km    | 19 kPa   | 3.42 s |

Its light a second is what it burns a second, so it is that much dimmer
for that much longer. The dial is `pressureExponent`.

## Lighting

The cartridge's impulse cartridge fires the flare out, and its igniter
lights the grain a moment later: it leaves dark and lights a few metres
behind. No figure for the MJU-7 is published openly; 0.1 s is an
**estimate**, `ignitionDelayS`.

## The trail cooling

The swept products cool as they go, and redden. Where the trail's light has
fallen by e^-f, they are as hot as a graybody whose luminance has, so the
trail is drawn in that one's colour: 2100 K at the grain, about 1700 K three
e-folds back.

## Left out

- **Altitude and the flame's temperature**: thinner air feeds the flame's
  afterburning in the air less. It is drawn at 2100 K at every altitude.
