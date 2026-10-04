---
title: Introduction
description: "What @aeronautic/afterburner is, what it needs, and how these docs are laid out."
---

`@aeronautic/afterburner` draws jet and rocket exhaust plumes in
[React Three Fiber](https://r3f.docs.pmnd.rs). Each plume is a signed distance
field, raymarched inside an instanced proxy hull and written in TSL for three's
`WebGPURenderer`. It draws:

- shock diamonds, which read as rings from astern;
- a potential core;
- stretched eddies and a helical mode;
- soot, particles and heat haze.

Every plume in a batch is **one instanced draw**. Distance tiers keep hundreds
of nozzles cheap.

## What drives it

You don't paint the look. You describe the engine and the air, and the plume
comes out of the physics.

- **Params** describe one engine, in SI units: nozzle radius, exit Mach, exit
  pressure ratio, exit temperature, gamma, molar mass, soot and particles.
- **The profile** describes the world the engines run in: altitude, airspeed,
  the day's temperature and the camera's exposure. Every nozzle in a batch
  shares it.
- **Quality** sets how much a frame may spend.

Colour comes from temperature, through Planck's law. That is why the same
engine glows orange at the ground and blue-violet up high: see
[Flight and altitude](../../guides/flight-and-altitude/).

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186. Each release supports one
  three minor, because TSL changes between them.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported: the shader is
  TSL.

## How these docs are laid out

| Section                                       | Read it when                                           |
| --------------------------------------------- | ------------------------------------------------------ |
| [Start here](../installation/)                | You are setting it up.                                 |
| [Tutorial](../../tutorial/first-jet/)         | You want to build a scene from nothing, step by step.  |
| [Guides](../../guides/placement/)             | You know what you want to do and need to know how.     |
| [Examples](../../examples/basic-jet/)         | You want to see it running and copy the code.          |
| [Reference](../../reference/components/)      | You need every prop, method and field.                 |
| [How it works](../../how-it-works/the-plume/) | You want to know why the plume is drawn the way it is. |

Every distance in the API is in **metres**.

For the vapor a wing pulls out of humid air, on the same aircraft, see
[`@aeronautic/wing-vapor`](../../../wing-vapor/start/introduction/). To fly
the plumes, the vapor and the model's moving parts from one flight, see
[`@aeronautic/core`](../../../core/start/introduction/) and
[`@aeronautic/controls`](../../../controls/start/introduction/).
