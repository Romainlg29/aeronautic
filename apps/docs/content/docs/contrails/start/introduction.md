---
title: Introduction
description: "What @aeronautic/contrails draws, what drives it, and what it needs."
---

`@aeronautic/contrails` draws the condensation trails an aircraft leaves at
altitude, in [React Three Fiber](https://r3f.docs.pmnd.rs) and three.js, in
TSL for three's `WebGPURenderer`. Each engine trails its own:

- **Forming** a fraction of a second behind the nozzle, where its exhaust has
  cooled enough by mixing with the cold air round it to pass water
  saturation. The gap behind the engine is the time that takes.
- **Frozen** into ice as it cools past -38 °C, and from then on held at
  saturation over ice by the crystals in it.
- **Carried down** with the wake: drawn in to the vortex on its side and sunk
  with the vortex pair, a hundred-odd metres for an airliner.
- **Spreading** as it mixes: wider and thinner as it ages, at the rate
  measured behind airliners at cruise.
- **Lasting** seconds in dry air, or for as long as it is drawn in air
  supersaturated over ice, where it takes up the excess vapour and grows.

## What drives it

None of it is drawn to a shape or a timer. Whether a trail forms is the
Schmidt–Appleman criterion for the day and the engines; how long it lasts is
the day's humidity over ice; how wide and how dense it is at each age follows
from how much fuel it burns and how much air the exhaust has mixed with.

The dials split the way the physics does. Each is a physical quantity in SI
units:

- **`airframe`**: what the aircraft is. Its mass, its span, its lift-to-drag
  ratio, how thirsty its engines are, and where they are.
- **`fuel`**: what it burns. Kerosene, hydrogen, or your own numbers.
- **`flight`**: what it is doing. Airspeed, angles and load factor.
- **`air`**: the day. Altitude, temperature and humidity.
- **`look`**: how it is lit. The sun and the sky.

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported.

It pairs with [`@aeronautic/afterburner`](../../../afterburner/start/introduction/)
and [`@aeronautic/wing-vapor`](../../../wing-vapor/start/introduction/) on
the same aircraft, but needs neither. Inside a
[`<FlightProvider>`](../../../core/guides/one-flight/) from `@aeronautic/core`,
it reads the airspeed, the angles, the load factor and the day from the shared
flight.

Next, [install it](../installation/).
