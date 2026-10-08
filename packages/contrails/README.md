# @aeronautic/contrails

[![npm](https://img.shields.io/npm/v/@aeronautic/contrails)](https://www.npmjs.com/package/@aeronautic/contrails)
[![CI](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml/badge.svg)](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<!-- An absolute URL: npm shows this README without the repo around it -->

![A delta fighter cruising at the tropopause, a contrail forming behind each engine and merging into one, rendered with @aeronautic/contrails](https://raw.githubusercontent.com/Romainlg29/aeronautic/main/.github/assets/contrails.gif)

Physically based **contrails** for [React Three Fiber](https://r3f.docs.pmnd.rs)
and three.js, written in TSL for three's `WebGPURenderer`.

Each engine trails its own:

- **Forming** a fraction of a second behind the nozzle, where its exhaust has
  mixed with enough cold air to pass water saturation: the Schmidt–Appleman
  criterion, with the engines' efficiency.
- **Frozen** as it cools past -38 °C, and from then on held at saturation over
  ice by its crystals.
- **Carried down** with the wake: drawn round the vortex on its side, and sunk
  with the vortex pair until the stratification stops it.
- **Spreading** at the rate measured behind airliners at cruise, wider and
  thinner as it ages.
- **Lasting** seconds in dry air, or for as long as it is drawn in air
  supersaturated over ice, where it grows.

None of it is drawn to a shape or a timer. Whether a trail forms is the
day's temperature against the threshold for its pressure and the engines;
how long it lasts is the day's humidity over ice; how wide and how dense it is
at each age follows from the fuel each metre was laid with. Turn, and the
trails curve behind the aircraft along the path it flew.

**[Docs](https://romainlg29.github.io/aeronautic/docs/contrails/start/introduction/)** ·
**[Live example on the docs' fighter](https://romainlg29.github.io/aeronautic/docs/contrails/examples/on-the-fighter/)**

The docs have guides, the live example, the full reference and how the
trails form. This README is the short version.

## Install

```bash
pnpm add @aeronautic/contrails @aeronautic/core three@~0.186
```

The same peer dependencies as the other packages: `@aeronautic/core`, `three`
0.186.x, plus `react` 19 and `@react-three/fiber` 9 (or 10) for
`@aeronautic/contrails/react`. It needs a `WebGPURenderer`, which falls back to
WebGL 2 by itself. It doesn't run on the classic `WebGLRenderer`. In R3F,
`gl={webgpu_gl()}` from `@aeronautic/core/react` makes one.

## Quick start

`<Contrails>` is a group where the aircraft's reference point sits. Put it
inside the model, and give it the engines, the flight and the day:

```tsx
import { useGLTF } from "@react-three/drei";
import { Contrails } from "@aeronautic/contrails/react";
import { useMemo } from "react";

export const Jet = () => {
  const { scene, nodes } = useGLTF("/jet.glb");

  // Nodes of the model, read every frame, or positions in metres
  const airframe = useMemo(
    () => ({
      massKg: 20_000,
      spanM: 14,
      engines: [nodes.Exhaust_L, nodes.Exhaust_R],
    }),
    [nodes],
  );

  return (
    <group>
      <primitive object={scene} />
      <Contrails
        airframe={airframe}
        flight={{ airspeedMPerS: 250 }}
        // The tropopause, 112 % over ice: the trails persist
        air={{ altitudeM: 11_000, relativeHumidity: 0.66 }}
      />
    </group>
  );
};
```

A trail is kilometres long: give the camera a far plane to match, or draw
less with `lengthS` (a minute by default). Drive the flight every frame through
the ref, or put the aircraft in a `<FlightProvider>` from `@aeronautic/core`.

`air.relativeHumidity` is over water, as core takes it. What decides whether a
trail lasts is the humidity over ice: `humidity_over_water` and `ice_humidity`
from `@aeronautic/contrails/physics` turn one into the other.

## The dials

Each is a physical quantity in SI units:

- **`airframe`**: `massKg`, `spanM`, `liftToDrag`, `fuelPerThrust` and
  `engines`. Thrust is the drag, so the mass and the lift-to-drag set the fuel
  burnt; the consumption sets the engines' efficiency; the span sets the wake.
- **`fuel`**: `"kerosene"`, `"hydrogen"`, or `{ waterIndex, heatJPerKg, iceIndex }`.
- **`flight`**: `airspeedMPerS`, `angleOfAttackRad`, `sideslipRad`,
  `loadFactor`.
- **`air`**: `altitudeM`, `temperatureOffsetK`, `relativeHumidity`.
- **`look`**: the sun and the sky, and the crystals' anisotropy.

`ref.current.state` says what the physics made of them: the threshold, the
humidity over ice, where the plume forms, the wake, and whether the trail
forms and persists.

## How it works

- **Forming.** The exhaust cools and dries along a straight mixing line. A
  contrail forms if it crosses water saturation: the Schmidt–Appleman
  criterion (Schumann, 1996), solved on Murphy and Koop's saturation curves.
  The trail starts at the dilution where the plume first saturates.
- **The plume.** The mass of air a kilogram of fuel's exhaust has mixed with
  grows as 7000 t^0.8 (Schumann et al., 1998). From it come the plume's
  temperature, its width, and its ice, held at saturation over ice and shared
  among one crystal per soot particle. Their extinction is van de Hulst's.
- **The wake.** The lift's vortex pair, π/4 of the span apart, draws each
  trail round its core and sinks at Γ / (2π b₀), stopped by the buoyancy it
  gains in stable air.
- **Drawing it.** The path flown is kept by time, and each trail laid through
  it as Gaussian puffs left in the air, the plume's eddies, as many as make
  it wander round its mean by Dowling and Dimotakis' 0.23. Each pixel
  integrates a puff's optical depth along its ray in closed form, lit by the sun's single
  scattering, the light scattered many times and the sky, then fogged with the
  scene.

### What it leaves out

- The part of the exhaust left behind at flight level as the wake sinks, and
  the wake's break-up after a few minutes.
- Wind shear, which spreads an old persistent trail into a sheet.
- Contrails from the wing's own lift, the aerodynamic contrails: those are
  [`@aeronautic/wing-vapor`](https://www.npmjs.com/package/@aeronautic/wing-vapor)'s.
- The trails don't shadow the aircraft or each other.

## License

[MIT](LICENSE) © Romain Le Gall
