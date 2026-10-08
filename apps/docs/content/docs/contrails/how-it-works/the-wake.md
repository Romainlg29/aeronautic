---
title: The wake
description: "The vortex pair that draws the trails in and carries them down."
---

## The vortex pair

A wing's lift leaves behind it a pair of counter-rotating vortices, rolled up
within a few spans from its sheet. For an elliptic loading they are π/4 of the
span apart, and by Kutta–Joukowski each carries the circulation

```
Γ = L / (ρ V b₀),    b₀ = π/4 · span
```

Each sinks in the other's downwash at

```
w = Γ / (2π b₀)
```

For the fighter at 11 km: Γ ≈ 196 m²/s and w ≈ 2.8 m/s. For a 70 t airliner,
whose span spreads the same lift wider: Γ ≈ 307 m²/s, w ≈ 1.8 m/s.

## Into the vortices

The exhaust leaves the engines between and below the vortices, and is drawn
round the one on its side. How long that takes is the time the vortex turns
the flow through a radian at the engine's distance from its core,
`2π d² / Γ`. A fighter's engines, close to the centreline, are well inboard of
its cores, and their trails are drawn out to them within a second or two. An
airliner's engines sit under the wing, nearer the cores.

## Down, and stopped

The pair sinks, and carries its trails down with it. Sinking through stably
stratified air, it warms by compression and becomes buoyant against the air
round it, which slows it. In air of buoyancy frequency `N`,

```
descent(t) = w / N · sin(N t),    until N t = π/2
```

so it stops at `w / N` after a quarter period. `N` is 0.012 rad/s under the
tropopause and 0.021 above it, from the standard atmosphere's lapse rate.

## Linked, and gone

The air's own turbulence bends the two vortices towards each other until they
touch and reconnect into rings, the Crow instability, and the wake stops
sinking. Sarpkaya fit the time it takes in the pair's own time, `t₀ = b₀ / w`,
against the turbulence measured by the pair's descent:

```
ε* = (ε b₀)^⅓ / w

T = 9                       ε* < 0.001
T = 9.18 − 180 ε*           ε* < 0.0121
T^¼ · exp(−0.7 T) = ε*      ε* < 0.2535
T = 0.8039 ε*^−¾            beyond
```

with `ε` the eddy dissipation rate, 10⁻⁷ m²/s³ in the weak turbulence of the
cruise levels. The pair sinks until `T t₀`, then stays where it is. An
airliner's wake links in about two minutes, after the stratification has
already stopped it; a fighter's, smaller and faster, in about half a minute.

| at 11 km | fighter, 1 g | 2 g  | 9 g   | airliner, 1 g |
| -------- | ------------ | ---- | ----- | ------------- |
| w        | 2.8 m/s      | 5.7  | 25.5  | 1.8           |
| links at | 33 s         | 17 s | 3.9 s | 114 s         |
| sinks    | 89 m         | 96 m | 99 m  | 107 m         |

A harder pull makes a stronger pair that sinks faster, and links sooner in
proportion: the fighter's trails drop about the same 90 m at any g, only
sooner.

## Pushed

Pushed under 0 g the wing lifts downwards: the vortices turn the other way,
and the pair rises above the path at the same speed it would have sunk,
carrying its trails up.

That is the primary wake. In the real atmosphere some of the exhaust is left
behind at flight level as the pair descends, and the rings the linked
vortices make spread and decay; neither is drawn.
