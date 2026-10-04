---
title: Introduction
description: "What @aeronautic/core holds, and why every effect reads its flight from it."
---

`@aeronautic/core` is the shared ground of the `@aeronautic` effects, for
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js. It holds three
things:

- **One aircraft's flight**, as a mutable store: the airspeed, Mach, the angle
  of attack and sideslip, the load factor, the rates, the throttle, the
  pilot's controls, the altitude and the air the aircraft flies through. You
  write it by hand from a flight model, or let it work itself out by tracking
  an object as it moves.
- **The International Standard Atmosphere** and moist air: the temperature,
  pressure and density at any altitude, the speed of sound, the ram pressure an
  inlet recovers and the dew point of the day.
- **Six-view depth capture** of a model, for an effect that needs to know the
  airframe's shape.

[`@aeronautic/afterburner`](../../../afterburner/start/introduction/),
[`@aeronautic/wing-vapor`](../../../wing-vapor/start/introduction/) and
[`@aeronautic/controls`](../../../controls/start/introduction/) all depend on it,
so it is installed with any of them.

## One flight for every effect

An aircraft's effects all want the same few numbers. The afterburner wants
the throttle, the altitude and the airspeed. The vapor wants the airspeed, the
angle of attack and the humidity. The control surfaces want the stick, the
pedals and the gear lever. Without a shared flight, each of them is handed its
own copy every frame.

With one, you wrap the aircraft in a `<FlightProvider>`, write the flight once,
and every effect inside reads it:

```tsx
<FlightProvider initial={{ airspeed_m_s: 200, altitude_m: 3000 }}>
  <primitive object={gltf.scene} />
  <ControlSurfaces object={gltf.scene} animations={gltf.animations} />
  <Afterburner position={[0, 0, 6]} />
  <WingVapor capture={gltf.scene} />
</FlightProvider>
```

## Built to be read every frame

The flight is not React state. It is one plain object, written in place for
the flight's whole life, with a counter that goes up on every write. An effect
reads it where it draws, which costs a property access. Nothing re-renders
when it changes unless you ask for that with `useFlight`, which a HUD does.
See [The store](../../how-it-works/the-store/).

## Requirements

- three 0.186.x.
- For `@aeronautic/core/react`: React 19 and React Three Fiber 9 (or 10).

The atmosphere and the capture need no renderer, so they run in Node as well
as in the browser.

## How these docs are laid out

| Section                                       | Read it when                                                |
| --------------------------------------------- | ----------------------------------------------------------- |
| [Start here](../installation/)                | You are setting it up.                                      |
| [Guides](../../guides/one-flight/)            | You know what you want to do and need to know how.          |
| [Examples](../../examples/one-flight/)        | You want to see it running and copy the code.               |
| [Reference](../../reference/flight/)          | You need every field, prop and function.                    |
| [How it works](../../how-it-works/the-store/) | You want to know how it stays cheap, and what it works out. |

Every distance is in **metres**, every angle in **radians**, every speed in
**metres per second**.
