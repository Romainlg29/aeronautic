---
title: Introduction
description: "What @aeronautic/countermeasures draws, what drives it, and what it needs."
---

`@aeronautic/countermeasures` draws an aircraft's decoy flares and chaff, in
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js, in TSL for three's
`WebGPURenderer`:

- **The flare**: an MJU-7 class cartridge, 253 g of magnesium, Teflon and
  Viton. Its grain burns from every face at once, at the composition's
  measured rate, and is gone in about three seconds.
- **Its flame**: what it radiates a second follows from what it burns a
  second, as the composition's measured efficiency has it. The flame's
  temperature carries that to the eye: a few hundred thousand candela as it
  lights, fading as the grain shrinks. In the airstream it dims at the grain
  and trails what is swept off it, long at release and shrinking as it
  slows: estimates, there being no measured curve to follow. Higher up
  it burns slower and is swept off less.
- **Its smoke**: what the flame burns to, laid along its path, spreading in
  the air's turbulence, lit by the flames, the sun and the sky.
- **Its flight**: thrown down from the dispenser, then slowed by its own drag
  from the aircraft's speed within a second, falling behind and below.
- **Chaff**: an RR-178 class cartridge, 3.7 million aluminised glass
  dipoles. The airstream tears them into a cloud in a fifth of a second,
  which stays where it formed, sinking at half a metre a second, spreading,
  and lit by its fibres' shadow and their aluminium.
- **The programs**: a burst of so many flares or chaff, a salvo of so many bursts, the
  dispensers taking turns.
- **Glare**: each flame is drawn as the eye sees a bright light, spread by the
  eye's own scatter as CIE 146 gives it, and dimmed and reddened by the haze.
  The brightest light the scene, as point lights.

## What drives it

None of it is drawn to a size, a colour or a timer by eye; the airstream's
toll, the ignition delay and the smoke's optics, which no open
measurement gives, are estimates and dials. A flame's
brightness on screen is its intensity, in candela, through the air, over the
distance squared, times the exposure. How long it burns is its grain's
thinnest side over its burn rate. Where it goes is its drag and its weight.

The dials split the way the physics does. Each is a physical quantity in SI
units:

- **`airframe`**: where the dispensers are, and which way they throw.
- **`flare`**: the cartridge, its grain and its composition.
- **`chaff`**: the cartridge's dipoles, and how it blooms.
- **`program`**: what one press of the button lets go, flares or chaff.
- **`flight`**: how the aircraft moves through the air.
- **`air`**: the altitude, the day's visibility and its turbulence.
- **`look`**: the exposure, the eye, and the sun and sky on the smoke.

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported.

It pairs with the other `@aeronautic` packages on the same aircraft, but needs
none of them. Inside a [`<FlightProvider>`](../../../core/guides/one-flight/)
from `@aeronautic/core`, it reads the airspeed, the angles, the altitude and
the air's density from the shared flight.

Next, [install it](../installation/).
