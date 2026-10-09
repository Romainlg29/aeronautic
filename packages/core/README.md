# @aeronautic/core

The shared ground of the `@aeronautic` effects, for
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js:

- **One aircraft's flight** as a mutable store: airspeed, Mach, angle of
  attack, sideslip, load factor, rates, throttle, the pilot's controls,
  altitude and the air it flies through. It is written by hand from a flight
  model, or worked out by tracking an object as it moves. Every effect inside a
  `<FlightProvider>` reads it each frame without a React render.
- **The International Standard Atmosphere** and moist air: temperature,
  pressure, density, the speed of sound, ram pressure and the dew point.
- **Six-view depth capture** of a model, for an effect that needs to know the
  airframe's shape.
- **A point of light as the eye sees it**: the haze's extinction, CIE 146's
  glare, the exposure and a blackbody's colour, shared by the lights and the
  flares.

Every other `@aeronautic` package depends on it, so it is installed with them.

## Install

```bash
pnpm add @aeronautic/core
```

Its peer dependencies are `three` 0.186.x, plus `react` 19 and
`@react-three/fiber` 9 (or 10) for `@aeronautic/core/react`.

## One flight for every effect

Wrap an aircraft in a `<FlightProvider>`. Everything inside it follows the
same flight: the afterburner's throttle and air, the vapour's speed and angle
of attack, and the control surfaces.

```tsx
import { FlightProvider } from "@aeronautic/core/react";
import { Afterburner } from "@aeronautic/afterburner/react";
import { WingVapor } from "@aeronautic/wing-vapor/react";
import { ControlSurfaces } from "@aeronautic/controls/react";

const Jet = ({ gltf }) => (
  <FlightProvider initial={{ airspeedMPerS: 200, altitudeM: 3000 }}>
    <primitive object={gltf.scene} />
    <ControlSurfaces object={gltf.scene} animations={gltf.animations} />
    {/* The model flies along -Z, and the exhaust streams aft along +Z */}
    <Afterburner position={[0, 0, 6]} />
    {/* Measured from the model, rather than a typed planform */}
    <WingVapor capture={gltf.scene} />
  </FlightProvider>
);
```

The throttle runs from 0 at idle to 1 at military power, on to 1.1 at full
reheat. `reheat_share` says how much of the burner that lights, the same for
every effect: the afterburner draws the burner from it, and the contrails burn
its fuel.

Write to it from a flight model, as often as you like. A write costs a few
property assignments. The air is only worked out again when the altitude or the
day changes.

```tsx
const flight = useFlightStore();

useFrame(() => {
  flight?.set({
    airspeedMPerS: model.speed,
    angleOfAttackRad: model.alpha,
    loadFactor: model.g,
    throttle: input.throttle,
    pitch: input.stick_y,
    roll: input.stick_x,
  });
});
```

Or let it watch the aircraft: `track` works out the airspeed, the angles, the
load factor and the rates from how the object moves. The provider tracks it
before any other frame callback, so everything reads this frame's flight.

```tsx
<FlightProvider track={jet_ref} seaLevelY={0} wind={[5, 0, 0]}>
```

A provider that tracks has to sit inside the `<Canvas>`. Without `track`, it
can sit outside the Canvas and wrap a DOM HUD as well as the scene, because
React Three Fiber carries the context into the Canvas:

```tsx
<FlightProvider>
  <Hud />
  <Canvas>
    <Jet />
  </Canvas>
</FlightProvider>
```

### Conventions

- **Stick and pedals** run from −1 to 1. Right, aft (nose up) and right pedal
  are positive.
- **Throttle** is 0 at idle, 1 at military power and up to 1.1 at full reheat.
- **Flaps, airbrake and gear** run from 0 to 1, where 1 means fully down, out
  and down.
- **Sideslip** is positive with the air coming from the right.
- **Rates** are positive for right wing down, nose up and nose right.

### Reading it

| For                                    | Use                                                           | Renders                                           |
| -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| An effect, a camera or a sound         | `useFlightFrame((values, dt) => …)`                           | never                                             |
| Your own class, read in its own update | `useFlightStore()`, then `flight.values` and `flight.version` | never                                             |
| A HUD or any other UI                  | `useFlight((v) => v.mach, { hz: 10 })`                        | when the selection changes, at most `hz` a second |

`values` is a single object for the flight's whole life, written in place. Hold
on to it and read it inside a frame. `version` counts the writes, so a reader
can skip its work when nothing changed. For a selector that returns an object,
pass `useFlight` an `equal` so it doesn't render on every write.

An effect that runs on one engine reads its throttle from `useThrust()`, which
gives the nearest engine's `anchor` and `throttle`. `@aeronautic/controls`'
`<Engine>` provides it to whatever is inside it, which is how an
`<Afterburner>` inside an `<Engine>` sits on its exhaust and follows its
throttle. Outside an engine it is null.

Without React, use `new Flight(input)` together with `set`, `track`, `values`,
`version` and `subscribe`.

## The atmosphere

```ts
import { moist_air, standard_atmosphere } from "@aeronautic/core";

standard_atmosphere(11_000); // { temperatureK: 216.65, pressurePa: 22632, pressure: 0.223 }
moist_air(3_000, 0.8, 10); // the density, the vapour and the dew point too, on a day 10 K warm
```

`speed_of_sound`, `ram_pressure`, `saturation_pressure`, `mixing_ratio` and
`dew_point` are exported as well, with the constants they use.

## Depth capture

`capture_views(model, { forward, up })` gives a model's nearest and furthest
surfaces seen along each of its three axes, in the airframe's frame (x aft,
y up, z out along the left wing). The views are rasterised on the CPU, so no
renderer is needed and the result is the same everywhere. Each function has a
`*_steps` variant that yields every few thousand triangles. Pass it to
`run_async` to spread a large model's capture over several frames.
`@aeronautic/wing-vapor` shapes its pressure field from these views.

## Volumes at half resolution

`volume_pass(scene, camera)` draws the effects' raymarched volumes, the
afterburner's plumes and the wing's vapor, in a pass of their own at half the
frame's resolution, and composites them over the scene depth-aware, so an edge
in front of a flame stays sharp. Use its `output` as your render pipeline's,
and put it in a `VolumePassContext` round the effects:

```tsx
const split = volume_pass(scene, camera);

render_pipeline.outputNode = split.output; // then bloom it, grade it…

<VolumePassContext value={split}>…</VolumePassContext>;
```

## License

MIT
