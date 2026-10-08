---
title: Introduction
description: "What @aeronautic/lights draws, what drives it, and what it needs."
---

`@aeronautic/lights` draws an aircraft's exterior lights, in
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js, in TSL for three's
`WebGPURenderer`:

- **Position lights**: red on the left wingtip, green on the right, white
  astern. Each gives the intensity CS/FAR 25.1385 to 25.1397 ask of it over
  its arc, falls off above and below as the rule's minima do, and spills into
  its neighbour's arc no further than the rule allows.
- **Anti-collision lights**: a red beacon and white strobes, 40 to 100 flashes
  a minute, at the effective intensity 25.1401 asks, worked out from the
  flash's shape the way the rule does, with Blondel and Rey's law.
- **Landing and taxi lights**: lamps with a catalogue's beam, lighting the
  ground and showing in the air as it scatters their light.
- **Glare**: each light is drawn as the eye sees a point of light, spread by
  the eye's own scatter as CIE 146 gives it for the observer's age and eyes,
  and dimmed and reddened by the haze between it and the eye.

## What drives it

None of it is drawn to a size or a colour by eye. A light's brightness on
screen is its intensity towards the camera, in candela, through the air, over
the distance squared, times the exposure. Its colour is its chromaticity,
inside the rule's region for it. How far its glare reaches is how far the
eye's scatter carries that much light.

The dials split the way the lights do. Each is a physical quantity in SI
units:

- **`airframe`**: where the lights are. Positions, or the model's nodes.
- **`switches`**: which are on.
- **`navigation`** and **`anticollision`**: what the rule asks of them, and
  their colours.
- **`air`**: the altitude and the day's visibility.
- **`look`**: the exposure, and the eye.
- **`illuminate`**: which lights light the scene as well as being seen.

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported.

It pairs with the other `@aeronautic` packages on the same aircraft, but needs
none of them. Inside a [`<FlightProvider>`](../../../core/guides/one-flight/)
from `@aeronautic/core`, it reads the altitude, the air's density and the gear
from the shared flight.

Next, [install it](../installation/).
