---
title: The light
description: "How a cloud is lit: the sun once and many times, the sky above and the ground below."
---

At every step of a ray inside cloud, the light it scatters towards the eye
is worked out from the sun, the sky and the ground the
[look](/docs/weather/guides/the-light) gives.

## The sun, once

The sun's light reaches the point through the cloud between it and the
sun: e<sup>−τ</sup> of it, τ the optical depth found by six steps towards
the sun, the first 30 m and each twice the last, so 1.9 km of cloud, the
near cloud finely. It is scattered towards the eye by each scatterer's
phase function, weighted by its share of the extinction:

- **Droplets** by Mie's, through Jendersie and d'Eon's (2023) fit for the
  droplets' diameter, twice their effective radius there: a strong forward
  peak, the silver lining when the sun is behind a cloud.
- **Ice** by Henyey and Greenstein's, with Fu's asymmetry of 0.75.
- **Rain** by Henyey and Greenstein's, with 0.87.

## The sun, many times

A cloud's albedo comes from light scattered tens of times, which a single
scattering misses: a cloud lit only once is dark grey inside. Eddington's
two-stream approximation has a slab of optical depth τ letting

T(τ) = 1 / (1 + ¾ (1 − g) τ)

of a diffuse light through and reflecting the rest, g the droplets' mean
asymmetry over the visible, about 0.85 (Hansen and Travis 1974). The light
scattered many times at a point is the column's reflectance R = 1 − T over
π, the same every way, fading into the cloud as a diffuse light does,
T(τ) − e<sup>−τ</sup>, its first scattering already counted once.

## The sky and the ground

The sky lights the top of the cloud and the ground its base, each over half
the sphere. Each reaches a point through the cloud over and under it, again
as a diffuse light: T(τ<sub>up</sub>) of the sky's, T(τ<sub>down</sub>) of
the ground's. τ<sub>up</sub> and τ<sub>down</sub> are the optical depths to
the cloud's top and base at the point's own extinction, from the column the
point is in: a cumulus's base is dark because the ground's light is all it
has, and the sea reflects 6 % of what falls on it (Payne 1972).

## The step

Each step's light is integrated as Hillaire (2016) has it: the source over
the step, S (1 − e<sup>−σ Δ</sup>) / σ, times what the ray has let through
so far, so a long step loses no energy and a fine one gains none.

## The air

Between the eye and the cloud, the air keeps e<sup>−3.912 d / V</sup> of
the cloud's light, Koschmieder's range V, and adds the haze in its place,
over the ray's mean distance to what it saw.

Koschmieder's range is where a black object fades into the horizon, at 2 %
contrast. A sunlit cloud is several times brighter than the horizon, so it
stays visible further off: about 1.6 V for one nine times as bright. The
march stops at the quality's range, and a cloud cut off there would end in a
line. So the air's transmittance is made to reach zero at the range:
(e<sup>−3.912 d / V</sup> − e<sup>−3.912 R / V</sup>) / (1 −
e<sup>−3.912 R / V</sup>). Near the eye this is Koschmieder's. On the
default look, whose V is the low quality's range, it is never off by more
than his 2 %.
