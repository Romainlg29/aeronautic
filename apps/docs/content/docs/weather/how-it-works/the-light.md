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
scattering misses: a cloud lit only once is dark grey inside. The light
scattered many times is the diffuse light the cloud holds, worked out by
Eddington's two-stream approximation. A slab of optical depth τ lets through
T(τ) = 1 / (1 + ¾ (1 − g) τ) of a diffuse light, g the droplets' mean
asymmetry, about 0.85 over the visible (Hansen and Travis 1974), and
reflects the rest, R = 1 − T: near all of it for a thick cumulus.

A diffuse light of flux E has a radiance E / π. Through τ<sub>s</sub> of
cloud towards the sun, T(τ<sub>s</sub>) of it is left, so the light
scattered many times at a point is E R(τ<sub>col</sub>) T(τ<sub>s</sub>) /
π, τ<sub>col</sub> the column's optical depth through the point, less the
first scattering's mean, E e<sup>−τ<sub>s</sub></sup> / 4π, which the phase
counts. The top of a thick cloud is then as bright as a white surface under
the sun, and a wisp as faint as its few scatterings. Nothing in it is tuned.

## The sky and the ground

The sky lights the top of the cloud and the ground its base, each over half
the sphere. Each reaches a point through the cloud over and under it, again
as a diffuse light: T(τ<sub>up</sub>) of the sky's, T(τ<sub>down</sub>) of
the ground's, T(τ) = 1 / (1 + ¾ (1 − g) τ) being Eddington's two-stream
approximation for a diffuse light through a slab. τ<sub>up</sub> and τ<sub>down</sub> are the optical depths to
the cloud's top and base at the point's own extinction, from the column the
point is in: a cumulus's base is dark because the ground's light is all it
has, and the sea reflects 6 % of what falls on it (Payne 1972).

## The lightning

The four brightest flashes alight light the cloud from within. Each gives
out its stroke's light as it is seen, its energy over the 25 ms it is seen
for: 0.36 MJ, 2.3 GW for 158 µs, for a first stroke (Guo and Krider 1982),
about 15 MW, over 4π r², and it reaches a point through the cloud between as a diffuse
light. Half the way is taken to be cloud as thick as the point's own, an
estimate, since the light comes through gaps as well. It is turned into the
scene's units at 80 lumens a watt, an estimate for a hot channel's spectrum,
and the look's `lux`.

## The step

Each step's light is integrated as Hillaire (2016) has it: the source over
the step, S (1 − e<sup>−σ Δ</sup>) / σ, times what the ray has let through
so far, so a long step loses no energy and a fine one gains none.

## The air

Between the eye and the cloud, the air keeps e<sup>−τ</sup> of the
cloud's light, over the ray's mean distance to what it saw, and shows as
much of the air's own light in its place: by default what is behind the
cloud, since the sky drawn there has the air in it already, so the far cloud
fades into the sky beside it, by day or by night. A sky with stars or a sun
in it gives its light without them, or they would show through the cloud. Its extinction is 3.912 / V at the ground, Koschmieder's
range V, and falls with height as the aerosols thin out above the boundary
layer, e<sup>−h / H</sup> with H about 1.2 km (Bruneton and Neyret 2008,
Hillaire 2020). Along a ray from h<sub>0</sub> above the ground, μ up, over
d, that is τ = σ<sub>0</sub> e<sup>−h<sub>0</sub> / H</sup> d (1 −
e<sup>−x</sup>) / x, x = μ d / H. From above the haze, the clouds under it
are seen clearly.

Koschmieder's range is where a black object fades into the horizon, at 2 %
contrast. A sunlit cloud is several times brighter than the horizon, so it
stays visible further off: about 1.6 V for one nine times as bright. The
march stops at the quality's range, and a cloud cut off there would end in a
line. So the air's transmittance is made to reach zero at the range:
(e<sup>−τ(d)</sup> − e<sup>−τ(R)</sup>) / (1 − e<sup>−τ(R)</sup>). Near the eye this is Koschmieder's. On the
default look, whose V is the low quality's range, it is never off by more
than his 2 %.
