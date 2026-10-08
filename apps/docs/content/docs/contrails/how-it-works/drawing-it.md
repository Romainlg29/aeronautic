---
title: Drawing it
description: "The path flown, the plume's eddies as puffs left in the air, and the light through them."
---

## The path flown

A trail is laid in the air, not behind the aircraft. Every frame the class
records where the aircraft is, how it is turned and how it is flying, keyed by
time, in steps of at most a thirtieth of a second. Each puff of a trail is
then the exhaust left at its age ago: the aircraft's position and attitude at
that moment, the engine where it was then, the wake's drift since, all brought
into the current frame. A turn is laid as the curve it was flown; a pull, as
the climb.

Before the history covers an age, the trail is laid straight back along the
current flight path.

The plume's width and ice are worked out at the trail's points, ages spread
evenly in `ln(1 + t / t₀)`, since the plume changes fastest young. Those ages
never move, so what is read between them for a puff of some age is the same
every frame.

## The puffs

A plume is only a smooth Gaussian on average. At any instant it is
turbulence: blobs of exhaust and the air they have pulled in. A probe on a
jet's axis reads ice that wanders round its mean by about a quarter. That
quarter is Dowling and Dimotakis' unmixedness `I = 0.23`, and it is the same
at every Reynolds number they measured. So each trail is drawn as Gaussian
puffs, one per eddy, scattered round the axis. On average they make the
plume, and how many there are per metre sets that quarter.

Take puffs of width `σₚ`, scattered with a spread `s` about the axis, `λ` of
them per metre. On the axis the ice's variance over its mean squared is

```
I² = 2π s² / (λ (4π)^3/2 σₚ³),   s² + σₚ² = σ²
```

Split the plume's spread evenly between where the eddies are and how big
they are, `σₚ = σ / √2`. That gives `λσ = 3.77`: about four puffs to each
width of plume along the trail. When the budget can't hold that many, there
are fewer, and each is sized back from the same equation so the plume still
wanders by 0.23. Fewer puffs means bigger ones.

Each puff is left in the air at one instant and stays there. It is laid at
its own age back along the path flown, with its offset from the axis fixed in
the air. The instants sit on a grid a power of two seconds apart, as close as
the plume's width asks. The grid is finest while the plume is thin, and
doubles its step each time the width doubles. As a stretch of trail ages into
a coarser grid, the puffs that aren't on it fade out over the second half of
the stretch, and the ones that are take over their ice. Nothing jumps, and a
puff stays the same puff, in the same place in the air, for as long as it is
drawn. The `high` preset holds 8,192 puffs per trail. A minute of trail at
the defaults asks for about 10,000, so there it takes fewer, larger puffs.

Each puff is laid on the CPU, exactly where the exhaust of its age is in the
history, along with the plume's width and ice there and which way the trail
runs. Nothing is read off a curve through other points, so where a straight
stretch meets a turn a puff doesn't shift as the points around it move. All of
it goes in one float texture, a block of rows for what every puff carries and
one more per engine, so a frame's update is one upload.

## The light through it

Each puff is a quad facing the camera, three of its widths across. For every
pixel, the fragment shader finds the ray's closest approach to the puff's
centre and integrates the Gaussian along the ray in closed form, using an
error function. The result is the puff's optical depth `τ`, clipped at the
scene's depth so that an aircraft in front hides it.

Ice scatters every colour alike, so the trail takes the colour of its light:

- **The sun's**, single-scattered with a Henyey–Greenstein phase of
  anisotropy 0.77. It is dimmed by the shadow of the trail's mean plume
  between the puff and the sun.
- **Light scattered many times**, which spreads the sun's light through the
  trail.
- **The sky's**, from every direction.

Each puff then fades into the scene's fog, the same as everything else. Puffs
are blended premultiplied: each hides `1 − e^−τ` of what is behind it.
