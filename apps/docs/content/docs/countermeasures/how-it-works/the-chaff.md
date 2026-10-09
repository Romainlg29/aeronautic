---
title: The chaff
description: "A cartridge of dipoles torn into a cloud, sinking where it was let go."
---

A chaff cartridge holds millions of aluminised glass fibres, each cut to
half a radar's wavelength. The airstream tears the packet into a cloud,
which stays where it formed as the aircraft flies on. To the eye it is a
faint grey puff.

`fire({ payload: "chaff" })` lets a program of it go, from the same
dispensers as the flares.

## The payload

`CHAFF.rr178`, an RR-178 class cartridge, holds 88,775 m of dipole
(Dalkıran, Bilkent University), a mil thick, 25.4 µm, the usual. Glass is
2540 kg/m³ and aluminium 2700: at 2600 for the two it throws 117 g, a little
under the third of a pound US patent 4,653,403 gives.

Its cuts span 2 to 20 GHz, 7.5 to 75 mm. Taken at their geometric mean,
24 mm, that is about 3.7 million dipoles.

## The bloom

The airstream tears the packet apart layer by layer: in a fifth of a
second it is a cloud 1.5 to 2 m across and 10 to 12 m long, at about
800 ft/s (US patent 4,653,403). Those are taken as ±2σ of a Gaussian,
`bloomWidthM` 1.75 and `bloomLengthM` 11 at `bloomAtMPerS` 244. The length
is laid along its path, so it goes with the speed it was thrown at; it is
never shorter than the cloud is wide.

It grows as 1 − (1 − t/T)², fast at first and less as the packet slows.
The throw is taken as the flare's, 30 m/s from the same impulse cartridge:
an **estimate**.

## The fall

A fibre that thin is stopped by the air within a metre, so the cloud
stays where it formed, in the air. It then falls broadside. Its Reynolds
number across it is a few tenths: the air's wake reaches only a few of its
diameters, far short of its length, so Stokes's drag over the whole rod
does not hold. Each length of it is a cylinder in Oseen's flow, with
Lamb's drag 4πμU / (½ − γ − ln(Re/8)) a metre, against its weight:

U = ρ g d² (½ − γ − ln(Re/8)) / (16 μ)

solved in a few steps, the drag going with the speed only through the
logarithm. μ is Sutherland's. Thinner air falls it faster higher up:

| altitude | falls at |
| -------- | -------- |
| 0 m      | 0.18 m/s |
| 1 km     | 0.19 m/s |
| 6 km     | 0.22 m/s |
| 12 km    | 0.28 m/s |

One-mil chaff is measured to fall at 0.6 to 1 ft/s, 0.18 to 0.3 m/s, at sea
level, about twice that at 40,000 ft (Stine, 1980). US patent 5,212,488
gives 0.3 m/s.

## How it spreads

After the bloom the air's turbulence spreads it as it does the
[smoke](../the-smoke/), Richardson's law from its bloomed size. It is let
go once even seen end on its depth falls below 0.02, or the air has
carried it past the day's visibility: at the default 10⁻³ m²/s³, about
half a minute.

## How it is lit

The fibres stop light with their shadow: a quarter of their surface over
every orientation, as any convex body's, π d L / 4, 1.77 m² for the
cartridge. Spread over the cloud's Gaussian, that is its optical depth:
about 1.5 through its middle as it blooms, seen end on, 0.23 side on.

Aluminium reflects 0.91 of visible light. A convex mirror turned every way
scatters the same in every direction, so the cloud is lit with an
isotropic phase, 1/4π: the sun's light and the sky's from `look`, and each
burning flare's, I / (d² + σ²). At night only the flares show it.

## The glints

That isotropic light is the mean. Each fibre is a mirror cylinder: it sends
a source's light on a cone round its axis, and the eye is on that cone only
when the axis is square to h, half way between the source and the eye. A
source of angular radius α allows |a · h| < α / |s + v|, and for axes turned
every way that bound is the share of fibres glinting: a quarter of a
percent for the sun behind the eye, every fibre looking into it.

Those few carry all of the light. Over a frame each fibre sweeps through
more of them as it turns: the air's eddies its own size tumble it at
(ε / L²)^⅓ (Parsa et al., 2012), 1.2 rad/s at the default turbulence, its
order-one constant taken as 1, an **estimate**; and the view turning turns h
half as fast. So each pixel holds a mean count of glints, its dipoles there
times that share, and draws a Poisson count of them: where the cloud is
dense, hundreds and a smooth grey; where it thins, a few or none, and it
glitters. The sky lights it from everywhere and does not glint.

## The flash

Once the airstream lets them go, the fibres fall level: a rod falling
broadside is turned back to it by the flow's own torque, as ρ U² / (μ ln(L/d))
(Khayat and Cox, 1989), while the eddies tumble it at (ε / L²)^⅓. Their
balance leaves it a tilt σ = √(tumble / (2 righting)), about 2.5° at sea
level: the scaling is Khayat and Cox's, its constant taken as 1 and used
past where they derived it, an **estimate**, kept under 0.2 rad.

A cloud of mirror facets sends ρ E D(h) / 4 towards the eye, D the share of
its mirror facing h. For fibres turned every way that gives back the
isotropic light above; level, their axes lie within σ of the horizontal and
D goes as e^(−z) I₀(z) / (σ √(2π) |h_y|), z = cot²η / (4σ²), η the elevation
of h. Far from the vertical that is 1 / (π cos η), the fibres facing up
lighting it less and sideways more; at the vertical, where the sun's
reflection would be, it is 1 / (σ √(2π)): seen from above, the sun overhead,
the cloud flashes about eighteen times brighter than turned every way, within
a few degrees. Over every h it sends out the same light, to within a tenth of
a percent. More of its fibres catch the sun there, so the flash is smoother
than its glitter.

Level, a fibre also shows more of itself from above than edge on: its shadow
is 4/π of the mean seen from straight above, 8/π² from the side.

## Left out

- **Bent fibres**: cut fibres are a little bent, and flutter as they fall;
  they are taken as straight.
- **The wind**: the cloud drifts with the air, as the smoke does.
- **The radar**: what the cloud returns to a radar is not drawn, only what
  the eye sees.
