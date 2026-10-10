---
title: The water
description: "From the day's air to the cloud's droplets, ice and rain."
---

A cloud is air lifted until it cools to its dew point, and lifted on: the
water it carries past that height condenses on the aerosol in it. How much
follows from the moist adiabat, how many droplets from the air's aerosol,
and those two set the droplets' size. So each cloud's water is worked out
from the day, as a meteorologist would work out the cloud.

## The base

A parcel lifted from the ground cools dry-adiabatically, g / c<sub>p</sub>,
about 9.8 K a kilometre, keeping its water, until the air it has cooled to
can hold no more. That height, the lifted condensation level, is found by
bisection; it is close to Espy's 125 m for each kelvin between the
temperature and the dew point. On the default day, 15 °C and 70 % at sea
level, it is 680 m.

## The water

From the base the parcel rises saturated, cooling at the moist adiabatic
lapse rate (the AMS Glossary's), slower than the dry because its condensing
water gives up its heat. What it condenses by each height is the most water
the cloud can hold there: its adiabatic water, tabulated from base to top.

A real cloud keeps only a share of it, as it mixes with the dry air round it
and rains out: the layer's `adiabaticFraction`, near 0.8 in stratocumulus
(Albrecht et al. 1990) and a third or less in deep convection (Warner 1955).

## The droplets

The water condenses on the aerosol, a number of droplets per cubic
centimetre set by the air mass: 74 in marine air, 288 over land (Miles,
Verlinde and Clothiaux 2000). They share the water, so their effective
radius, their volume over their area, is

r<sub>e</sub> = (3 LWC / (4π ρ<sub>w</sub> N k))<sup>1/3</sup>,

k the spread of their sizes, 0.80 in marine air and 0.67 over land (Martin,
Johnson and Spice 1994). Droplets of tens of microns stop twice their cross
section of light, so the extinction is

σ = 3 LWC / (2 ρ<sub>w</sub> r<sub>e</sub>).

At 0.5 g/m³ of water, over land: droplets of 8.5 µm, σ = 0.088 per metre, a
visibility of 44 m. Over the sea, fewer and larger droplets of 12.6 µm stop
less, 0.059 per metre, 66 m. The same water makes a dimmer, more
translucent cloud over the sea.

## The ice

Above the homogeneous freezing point, −38 °C, every droplet is ice; between
it and 0 °C a share of them is, linearly here, an estimate, since
supercooled droplets are common. Crystals of tens of microns stop light as
Fu (1996) fits it, β = IWC (a<sub>0</sub> + a<sub>1</sub> / D), and scatter
it with an asymmetry of 0.75, their halos left out.

## The rain

Under a raining cloud, from its base to the ground, the drops are Marshall
and Palmer's (1948) for the rain rate: N(D) = N<sub>0</sub> e<sup>−ΛD</sup>.
Each stops twice its cross section, so together they stop
π N<sub>0</sub> / Λ<sup>3</sup>, 0.365 R<sup>0.63</sup> per kilometre: at
40 mm/h, 3.7 per kilometre, a visibility of about a kilometre. They scatter
with an asymmetry of 0.87 (Hansen and Travis 1974).
