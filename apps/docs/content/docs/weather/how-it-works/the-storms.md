---
title: The storms
description: "Thunderstorms with a life, where the air allows, and their lightning and thunder."
---

## Where they fire

Storms fire on a jittered grid, each square of the climate's
`stormSpacingM` giving one at most at a time, where the air is unstable
enough and rising. The likelier the more CAPE and the faster the ascent:
the same squares, the same seed, the same storms. `<Storm>` and the cold
front's squall line add cells of their own.

## Their life

Each storm is a cell with a life, as Byers and Braham (1949) found it:

- **Cumulus.** A tower rising from the condensation level at about half its
  updraft, a thermal's cap rising at about half the speed of the air in it
  (Scorer 1957). The updraft is half of √(2 CAPE), what it would reach
  unmixed (Weisman and Klemp 1982).
- **Mature**, 15 to 30 minutes. It rains, its anvil spreads under the
  tropopause at about 10 m/s, a gravity current, and drifts downwind with
  the wind's shear. The anvil's top is flat, the tropopause's stable air
  over it a lid; only over the updraft's core does the tower overshoot it,
  carried into the stratosphere until its buoyancy frequency N, about
  0.02 s<sup>−1</sup>, turns it back: w / N, 1.4 km for a 27 m/s updraft,
  as overshooting tops stand a kilometre or two over their anvils.
- **Dissipating**, about half an hour. The downdraft takes over, the tower
  and the rain fade, and the anvil, spreading still, outlives it by an hour
  or so.

A storm rains about 0.3 of what it condenses, the rest evaporated or carried
into the anvil (Market et al. 2003 find 0.2 to 0.5), over its core, about a
quarter of its area.

## Its base

A storm's base is flat, at the condensation level of the air it draws in:
that air rises from the same mixed layer and saturates at the same height.
Two things break it:

- **The forward flank.** The rain does not fall where the updraft rises.
  The wind past the storm grows with height, s z / H for a shear s over its
  depth H, so a drop falling at v from h drifts s h² / 2Hv; from halfway
  up, where the rain is taken to grow (an estimate), s H / 8v. A 14 km
  storm in 19 m/s of shear, its 80 mm/h's median drop falling at 7 m/s,
  rains some 5 km downshear of its tower. It falls from the cloud spread
  there, a dome on the same base as high as the rain grows, and the base
  under the updraft is left rain-free.
- **The wall cloud.** Under the updraft's core, the storm draws in air its
  rain has cooled, evaporating into it to its wet bulb and saturating it
  (Fujita 1959). Half its inflow taken to be such air, an estimate, it
  saturates lower: an 830 m base hangs a wall cloud at about 400 m, a few
  hundred metres down, as wall clouds are seen. It stays as long as it
  rains.

## The lightning

A mature storm flashes at random, a Poisson process at the rate Price and
Rind (1992) find for a storm of its height H in kilometres: 3.44 × 10<sup>−5</sup>
H<sup>4.9</sup> a minute over land, 6.4 × 10<sup>−4</sup> H<sup>1.73</sup> over
the sea. A storm 10 km deep over land flashes about three times a minute,
one 12 km deep nearly seven. A share of the flashes strikes the ground, more towards the
equator (Prentice and Mackerras 1977); the rest stay in the cloud.

A ground flash is about four strokes 60 ms apart, each as bright at its peak
as Guo and Krider (1982) measured: 2.3 GW of light for the first, 0.48 GW
for those after. That peak lasts some 158 µs, their strokes' characteristic
width, so a first stroke gives out about 0.36 MJ of light; the eye sees it
for some 25 ms, its persistence and the continuing current's glow, so that
energy is spread over those 25 ms, not the peak held for them. An
intracloud flash is one dimmer, longer glow, a tenth of a first stroke's
light over 0.3 s, an estimate. Its channel
is a fractal path, made by displacing midpoints, its branches dimmer.

Seen from afar by day, little of it shows, as little does. A ground stroke's
channel, a pixel wide at 30 km, is seen near 400 cd/m², a twentieth of
sunlit cloud, for some 25 ms; but it strikes in the storm's rain,
whose 80 mm/h leaves 650 m of visibility, behind the showers on the way.
An intracloud flash lights its cloud by some tens of cd/m², nothing against
the sun's 10<sup>4</sup>. At dusk and at night, the same flashes light the
storm from within.

## The thunder

The thunder reaches a listener at the speed of sound in the air there,
from the channel's nearest point first and its farthest last: it rolls for
the difference. Its loudness is one at a kilometre, falling as the distance.

## The sources

- [earthref.org/ERR/45924](https://earthref.org/ERR/45924): Price and Rind
  (1992), the flash rate.
- [earthref.org/ERR/46331](https://earthref.org/ERR/46331): Prentice and
  Mackerras (1977), the ground flashes' share.
- [par.nsf.gov/servlets/purl/10439533](https://par.nsf.gov/servlets/purl/10439533):
  the strokes of a flash.
- [repository.arizona.edu/handle/10150/325230](https://repository.arizona.edu/handle/10150/325230):
  Guo and Krider (1982), the strokes' light.
- [ntrs.nasa.gov/citations/19830068117](https://ntrs.nasa.gov/citations/19830068117):
  the channel's light.
