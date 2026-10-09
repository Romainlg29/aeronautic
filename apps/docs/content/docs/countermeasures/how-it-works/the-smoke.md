---
title: The smoke
description: "What the flame burns to, laid along each flare's path, spreading and lit."
---

The flame burns to a white smoke: magnesium oxide and fluoride, and the
Teflon's carbon. It is laid along the flare's path through the air, where
it stays as the aircraft flies on.

## How much

The Teflon's fluorine takes the magnesium it can to MgF₂ and leaves its
carbon as soot; the rest of the magnesium burns in the air to MgO. A
kilogram of MTV, 500 g of magnesium and 450 g of Teflon, leaves 561 g of
MgF₂, 108 g of carbon and 466 g of MgO: 1.13 kg of smoke, `smokeYield`, its
50 g of Viton left aside.

Along its path it holds what the grain burnt there: ṁ Y / v a metre, the
grain's mass rate times the yield over its speed through the air. A flare
that is fast leaves it thin, one that has slowed leaves it thick:

| at                | smoke a metre | through its middle, as laid |
| ----------------- | ------------- | --------------------------- |
| 250 m/s, released | 0.64 g        | τ 2.7                       |
| 60 m/s, after 1 s | 2.7 g         | τ 11                        |
| 30 m/s, falling   | 5.4 g         | τ 22                        |

## How it spreads

Across its path the air's turbulence spreads it, as Richardson's law spreads
two points apart: σ² = σ₀² + ½ ε t³, from the flame's own width. ε is the
air's dissipation rate, `turbulenceM2PerS3` on `air`: 10⁻³ m²/s³, the top
of a mixed layer, by default, an **estimate** of a typical day. It stays a
few metres wide for half a minute, then grows fast: 10 m at a minute, 30 m
at two.

Its optical depth through its middle is κ λ / (√(2π) σ), its cross-section
a Gaussian's. It is let go once that falls below 0.02, or the air has
carried it past the day's visibility from the aircraft: at 250 m/s, about a
minute and a half.

## How it is lit

It scatters what falls on it, once, by Henyey and Greenstein's phase: the
sun's light and the sky's, given on `look` as the contrails' are, and the
flares'. Each burning flare lights the smoke near it as I / (d² + σ²),
brightest by far where it has just passed. A trail shows that light times
1 − e^-τ over what is behind it, and hides that much of it.

What a white oxide smoke stops and scatters is not measured for an MTV
flare's. Its particles are a fraction of a micron; 2 m² a gram
(`smokeExtinctionM2PerKg`), 0.8 of it scattered, the soot taking the rest
(`smokeAlbedo`), and a g of 0.6 (`smokeAsymmetry`) are **estimates**.

## Left out

- **The wind**: the smoke drifts with the air the flares are laid in. A
  wind moves that air, the aircraft and its smoke alike.
- **Its own shadow**: the sunlight reaching a point of it has not crossed
  the rest of it. A thick young trail is as lit on its far side.
- **Light scattered more than once**: in a thick trail more of it reaches
  the eye than once-scattered light gives.
