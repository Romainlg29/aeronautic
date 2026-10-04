---
title: Introduction
description: "What @aeronautic/controls moves, and how it finds what to move."
---

`@aeronautic/controls` moves an aircraft model's parts from its flight, for
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js: the control
surfaces with the stick and the pedals, the flaps, the air brakes and the
landing gear with their levers, the nozzles with the throttle, and the stick,
the pedals and the throttle lever in the cockpit.

```tsx
<FlightProvider>
  <primitive object={gltf.scene} />
  <ControlSurfaces object={gltf.scene} animations={gltf.animations} />
</FlightProvider>
```

Write `pitch: 1` to the flight and the elevons go trailing edge up, the
stick comes back, and the nozzles turn the exhaust up to push the tail down.

## What it moves

- **Control surfaces**: ailerons, elevators, elevons, stabilators, canards and
  rudders, with the stick and the pedals.
- **High lift and drag**: trailing-edge flaps, leading-edge flaps that droop
  with the angle of attack, air brakes, spoilers and split drag rudders.
- **Engines**: nozzle petals opening with the throttle, and **thrust
  vectoring** on the model's own gimbal or on one put in by code, with a round
  limit as a real nozzle's.
- **Landing gear**: legs, doors and the lever, or the model's own retraction
  clip, scrubbed.
- **The cockpit**: the stick, the pedals, and the throttle lever past its
  reheat detent.

## Like real actuators

Every part chases where it should be at the rate a real actuator would: an
aileron at 80° a second, a flap at 10°. Slam the stick over and the elevons
take a third of a second to follow. See [Actuators](../../how-it-works/actuators/).

## Any model

A model rigged for it says everything: each part's hinge, its limits, its rest
pose and which way is positive, in its glTF extras. A model with no rig is
searched by its node names, `Elevon_L` or `rudder.001`, and each panel found is
given a hinge fitted to its geometry. See
[Finding the parts](../../how-it-works/finding-parts/).

## With the rest

It reads the same flight as
[`@aeronautic/afterburner`](../../../afterburner/start/introduction/) and
[`@aeronautic/wing-vapor`](../../../wing-vapor/start/introduction/), from
[`@aeronautic/core`](../../../core/start/introduction/). An afterburner put
inside one of its engines sits on that engine's exhaust and turns with its
nozzle.

## How these docs are laid out

| Section                                       | Read it when                                       |
| --------------------------------------------- | -------------------------------------------------- |
| [Start here](../installation/)                | You are setting it up.                             |
| [Guides](../../guides/choosing-parts/)        | You know what you want to do and need to know how. |
| [Examples](../../examples/the-controls/)      | You want to see it running and copy the code.      |
| [Reference](../../reference/components/)      | You need every prop, option and function.          |
| [How it works](../../how-it-works/actuators/) | You want to know how the parts move and are found. |
