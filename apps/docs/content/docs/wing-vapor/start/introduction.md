---
title: Introduction
description: "What @aeronautic/wing-vapor draws, what drives it, and what it needs."
---

`@aeronautic/wing-vapor` draws the vapor a wing pulls out of humid air, in
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js. It is raymarched
in TSL for three's `WebGPURenderer`, and draws four phenomena from one
pressure field:

- **Tip vortex trails** in a hard pull, streaming back along the flight path,
  rolling inboard and spreading until they no longer fog.
- **Leading-edge vortices** over a swept wing at high angle of attack,
  bursting where vortex breakdown has reached.
- **Vapor over the wing**: the suction over the upper surface in a pull and,
  once the flow over it goes supersonic, a rooftop ended by a **shock** that
  cuts the cloud off in a hard edge.
- **The vapor cone**, the "Prandtl–Glauert cloud" near Mach one: the transonic
  pocket round the fuselage, ended by the shock behind it.

## What drives it

None of it is drawn to a shape. The package works out the pressure round the
aircraft from its planform, its airspeed and its angle of attack, expands the
day's moist air through that pressure field, and draws cloud wherever the air
passes its dew point. Dry air stays clear however hard the pull, and in humid
air a gentle turn trails its tips.

The dials split four ways, the way the physics does. Each is a physical
quantity in SI units:

- **`airframe`**: what the aircraft is. Its wing's planform, its body and its
  mass. `capture` can measure all of the shape from the model itself.
- **`flight`**: what it is doing. Airspeed and angle of attack, and if you
  have them sideslip and roll rate. Cheap to write every frame.
- **`air`**: the day. Altitude, temperature and the humidity, which is what
  everything comes down to.
- **`look`**: how it is lit and photographed. The sun, the sky, the droplets
  and the shutter.

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186. Each release supports one
  three minor, because TSL changes between them.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported.

It pairs with [`@aeronautic/afterburner`](../../../afterburner/start/introduction/)
on the same aircraft, but needs nothing from it.

## How these docs are laid out

| Section                                     | Read it when                                        |
| ------------------------------------------- | --------------------------------------------------- |
| [Start here](../installation/)              | You are setting it up.                              |
| [Guides](../../guides/flying-it/)           | You know what you want to do and need to know how.  |
| [Examples](../../examples/on-the-fighter/)  | You want to see it running and copy the code.       |
| [Reference](../../reference/component/)     | You need every prop, method and field.              |
| [How it works](../../how-it-works/the-air/) | You want to know why the cloud forms where it does. |

Every distance in the API is in **metres**, every angle in **radians**.
