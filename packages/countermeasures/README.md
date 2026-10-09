# @aeronautic/countermeasures

[![npm](https://img.shields.io/npm/v/@aeronautic/countermeasures)](https://www.npmjs.com/package/@aeronautic/countermeasures)
[![CI](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml/badge.svg)](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Physically based **decoy flares and chaff** for [React Three Fiber](https://r3f.docs.pmnd.rs)
and three.js, written in TSL for three's `WebGPURenderer`.

- **The grain**: an MJU-7 class flare by default, 253 g of magnesium, Teflon
  and Viton, burning from every face at the composition's measured rate. It
  is gone when its thinnest side is, in about three seconds.
- **The flame**: what it radiates follows from what it burns, with the
  composition's measured efficiency. The flame's temperature, 2100 K, carries
  that to the eye: about 250,000 cd as it lights, fading as the grain
  shrinks.
- **The airstream**: the flame dims as it is swept off the grain, halved
  at 150 m/s, and what is swept off glows on as a trail behind it, long at
  release and shrinking as the flare slows. No measured curve is published
  openly: these numbers are estimates, and dials. Higher up it burns
  slower, as MTV's rate goes with the pressure, and is swept off less.
- **The smoke**: 1.13 kg of MgO, MgF₂ and carbon a kilogram burnt, laid
  along each flare's path, spreading in the air's turbulence, and lit by
  the flames, the sun and the sky.
- **The flight**: thrown down at the cartridge's 30 m/s, then slowed by its
  own drag, a tumbling block's, from the aircraft's speed within a second,
  falling behind and below.
- **Chaff**: an RR-178 class cartridge, 88,775 m of aluminised glass
  fibre, 117 g. The airstream tears it into a cloud in a fifth of a second;
  it stays where it formed, falling at a fifth of a metre a second as
  one-mil chaff is measured to, and spreading as the smoke does. Its
  fibres' shadow and aluminium light it, and each fibre, a mirror
  cylinder, glints: where the cloud thins it glitters.
- **Programs**: bursts and salvos, the dispensers taking turns, of flares
  or chaff.
- **Glare** from the flame's real luminance and the exposure: the eye's own
  scatter (CIE 146), dimmed and reddened by the day's haze. The brightest
  flares light the scene.

None of it is drawn to a size or a timer by eye; the few estimates are
said to be.

**[Docs](https://romainlg29.github.io/aeronautic/docs/countermeasures/start/introduction/)** ·
**[Live example on the docs' fighter](https://romainlg29.github.io/aeronautic/docs/countermeasures/examples/at-night/)**

## Install

```bash
pnpm add @aeronautic/countermeasures @aeronautic/core three@~0.186
```

The same peer dependencies as the other packages: `@aeronautic/core`, `three`
0.186.x, plus `react` 19 and `@react-three/fiber` 9 (or 10) for
`@aeronautic/countermeasures/react`. It needs a `WebGPURenderer`, which falls
back to WebGL 2 by itself. In R3F, `gl={webgpu_gl()}` from
`@aeronautic/core/react` makes one.

## Quick start

`<Countermeasures>` is a group where the aircraft's reference point sits. Put
it inside the model, say where the dispensers are, and fire it:

```tsx
import { Countermeasures } from "@aeronautic/countermeasures/react";

// Positions in the model's frame, metres. Each throws down unless told
const AIRFRAME = {
  dispensers: [{ at: [-1, -0.57, 5] }, { at: [1, -0.57, 5] }],
} as const;

export const Jet = ({ fired }: { fired: number }) => (
  <group>
    <JetModel />
    <Countermeasures
      airframe={AIRFRAME}
      flight={{ airspeedMPerS: 250 }}
      fire={fired}
    />
  </group>
);
```

`fire` lets the program go each time it changes. The ref holds the
countermeasures themselves: `fire()`, `release(dispenser, payload)`, `stop()`,
`clear()`. Inside a `<FlightProvider>` from `@aeronautic/core` the airspeed,
the angles, the altitude and the air's density are the shared flight's.

The flames are in candela and the scene's light in cd/m²: `look.exposure` is
the number one cd/m² is drawn as, EV100 8 by default.

## The dials

Each is a physical quantity in SI units:

- **`airframe`**: the dispensers, positions or the model's nodes, and which
  way each throws.
- **`flare`**: the grain's size, mass, density and burn rate, the energy it
  radiates per kilogram, the flame's temperature and emissivity, its drag
  and its ejection speed.
- **`chaff`**: the dipoles' total length, diameter, cut and density, their
  reflectance, the throw and the bloom.
- **`program`**: `burst`, `burstIntervalS`, `salvo`, `salvoIntervalS`,
  `alternate`, `payload`: `"flare"` or `"chaff"`.
- **`flight`**: `airspeedMPerS`, `angleOfAttackRad`, `sideslipRad`.
- **`air`**: `altitudeM`, `visibilityM` and `turbulenceM2PerS3`.
- **`look`**: the exposure, the observer's age and eyes, and the sun
  and sky that light the smoke.

## How it works

- **The grain.** A block a × b × c burning from every face at rate r is
  (a − 2rt) × (b − 2rt) × (c − 2rt) at t. MTV1 burns at 3.86 mm/s (Debnath
  et al., CEJEM 2025), so the MJU-7's 22.6 mm side is gone in 2.9 s.
- **The flame.** Its intensity in the 1.8–2.6 µm band is what it burns a
  second times MTV1's measured 179 J/(g sr). As a graybody at 2100 K, its
  luminance over its radiance in that band turns that into candela, and the
  band's intensity over its radiance is the flame's area.
- **The flight.** A tumbling block shows a quarter of its surface to the flow
  (Cauchy), with a cube's drag coefficient, 1.05 (Hoerner). At 250 m/s near
  sea level that is about 770 m/s²; once slowed it falls at 28 m/s. Flares
  are laid in the air, so a turning aircraft leaves them behind.
- **The smoke.** λ = ṁ Y / v a metre of path, spreading as σ² = σ₀² +
  ½ ε t³ (Richardson), its depth κ λ / (√(2π) σ). Lit once, by Henyey and
  Greenstein's phase. Its optics are estimates.
- **Chaff.** Its fibres stop light with their shadow, π d L / 4, 1.77 m²,
  and reflect 0.91 of it, every way alike. It blooms to the size US patent
  4,653,403 gives, 1.75 × 11 m at 244 m/s, then falls with
  Lamb's drag on a cylinder in Oseen's flow. The fibres whose axis is
  square to the half way between the sun and the eye glint, a Poisson
  count of them a pixel. Its throw and its fibres' tumbling are estimates.
- **Glare.** CIE 146's glare spread function times the illuminance at the
  eye, through the haze: the same as `@aeronautic/lights`, from
  `@aeronautic/core`.

### What it leaves out

- Altitude's effect on the flame's temperature: 2100 K everywhere.
- The flame's shape at the grain: a disc of its area.
- The smoke's own shadow, and light it scatters more than once.
- Chaff's fibres turning broadside as they fall, and what it returns to a
  radar.

## License

[MIT](LICENSE) © Romain Le Gall
