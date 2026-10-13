# @aeronautic/weather

[![npm](https://img.shields.io/npm/v/@aeronautic/weather)](https://www.npmjs.com/package/@aeronautic/weather)
[![CI](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml/badge.svg)](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Physically based **weather** for [React Three Fiber](https://r3f.docs.pmnd.rs)
and three.js: volumetric clouds, rain and lightning, raymarched in TSL for
three's `WebGPURenderer`.

- **Different everywhere**: a climate is the air over the ground, its
  humidity, its warmth, its inversion, its middle and high air and its
  lift, each a field of a pressure system's pattern and a local one. Every
  cloud follows from the air under it, so a clear patch gives way to
  cumulus, those to a deck, and there is a storm far off.
- **Six climates**: `clear`, `fair`, `unsettled`, `stormy`, `overcast` and
  `frontal`, or one of your own with `make_climate`.
- **Plugins**: `<Storm>`, `<Front>` and `<Patch>`, and any of your own, each
  a change to a stage the weather is made in: the air, the storms, the
  clouds over a point, the clock.
- **Storms with a life**: they fire where the air is unstable enough, grow,
  rain, spread their anvils and die (Byers and Braham 1949).
- **Rain and lightning**: the streaks of Marshall and Palmer's drops round
  the camera; flashes as often as Price and Rind (1992) find a storm of its
  height makes them, lighting the cloud from within, their channels under
  it, and their thunder reaching the camera at the speed of sound.
- **From a seed**: the same seed, the same sky, on any machine. The GPU's
  noise is baked from the very functions the CPU evaluates, so what an
  aircraft samples at a point is what is drawn there.
- **Formed as the air makes them**: the base at the lifted condensation
  level, the water from the moist adiabat, the droplets from the air mass's
  aerosol, showers once a cumulus is deep enough for its droplets to rain.
- **Lit as they are**: Mie scattering for the droplets' size, the sun
  through the cloud, Eddington's two-stream for the light scattered many times,
  the sky above and the ground below through the cloud over and under.
- **Flown through**: inside a `<FlightProvider>`, the flight's air is
  saturated in cloud, so the wing vapour and the contrails form as they
  would; and the plumes, the vapour, the contrails, the lights and the
  countermeasures fade into the cloud round the camera.

None of it is drawn to a size by eye; the few estimates are said to be.

**[Docs](https://romainlg29.github.io/aeronautic/docs/weather/start/introduction/)** ·
**[Live example of the climates](https://romainlg29.github.io/aeronautic/docs/weather/examples/the-climates/)** ·
**[A storm](https://romainlg29.github.io/aeronautic/docs/weather/examples/a-storm/)**

## Install

```bash
pnpm add @aeronautic/weather @aeronautic/core three@~0.186
```

The same peer dependencies as the other packages: `@aeronautic/core`, `three`
0.186.x, plus `react` 19 and `@react-three/fiber` 9 (or 10) for
`@aeronautic/weather/react`. It needs a `WebGPURenderer`, which falls back to
WebGL 2 by itself. In R3F, `gl={webgpu_gl()}` from `@aeronautic/core/react`
makes one.

## Quick start

`<Weather>` holds the sky, its plugins are its children, and `useClouds()`
gives the node that draws it for the camera. Composite it over the scene's
colour and depth:

```tsx
import {
  Lightning,
  Rain,
  Storm,
  useClouds,
  Weather,
} from "@aeronautic/weather/react";

const Sky = () => {
  const clouds = useClouds();

  // In a RenderPipeline, or as core's volume_pass's backdropNode
  // output = clouds.over(scene_color, scene_depth)
  return null;
};

<Weather seed={7} climate="unsettled">
  <Storm at={[25_000, 5000]} diameterM={10_000} />
  <Rain />
  <Lightning onThunder={(thunder) => play(thunder)} />
  <Sky />
</Weather>;
```

The scene is in metres. `weather.sample(x, y, z)` is the air at a point:
its extinction, its visibility, whether it is in cloud, how hard it rains.

A plugin is a change to any stage:

```ts
const dry_slot: WeatherPlugin = {
  name: "dry-slot",
  air: (air, x, z) => {
    air.midHumidity -= 0.3 * Math.exp(-((z / 10_000) ** 2));
  },
};

weather.use(dry_slot);
```

## The dials

Each is a physical quantity in SI units:

- **`climate`**: the air's six fields, each a mean and its swings, the
  temperature offset, the air mass, the winds, the heights of the middle and
  high cloud, the tropopause and how far apart storms fire.
- **The plugins**: a storm's place, size, top, rain, anvil and life; a
  front's kind, place, heading and speed; a patch's change to the air.
- **`look`**: the sun's illuminance and direction, the sky's and the
  ground's radiance, the exposure, the air's visibility, and the
  scene's units in a lux for the lightning.
- **`quality`**: the resolution, the steps, the range, the detail and the
  weather map.

## How it works

- **The air.** Each field a mean plus a meso-α and a meso-β pattern
  (Orlanski 1975), shared so moist air is rising air.
- **The clouds.** A parcel from the ground to its condensation level and on
  the moist adiabat, stopped by the inversion, its equilibrium level or the
  dry air it mixes in (Derbyshire et al. 2004); its cover by Sundqvist
  (1989); decks under the inversion (Slingo 1987; Wood 2012); altostratus
  where the middle air is lifted; cirrus where the high air is humid over
  ice.
- **The water.** The moist adiabat's condensate, kept as Warner (1955) and
  Albrecht et al. (1990) found it; droplets from the aerosol (Miles et al.
  2000; Martin et al. 1994); ice by Fu (1996); rain once a cumulus is deep
  enough (Freud and Rosenfeld 2012), by Marshall and Palmer.
- **The storms.** Cells with a life (Byers and Braham 1949), their updraft
  from their CAPE, their flashes by Price and Rind (1992), Prentice and
  Mackerras (1977) and Guo and Krider (1982).
- **The shapes.** Each layer cut from seeded cellular noise at its cover's
  quantile, cumulus cells spaced as Rayleigh's rolls, the tile read twice,
  turned, so it never repeats, lobes on lobes as rough as Lovejoy (1982)
  measured cloud edges.
- **The light.** Mie's phase through Jendersie and d'Eon's (2023) fit; the
  sun through six doubling steps; the light scattered many times, the sky
  and the ground by Eddington's two-stream; each step integrated as Hillaire
  (2016) has it; the air in front by Koschmieder, thinning with height.
- **The march.** At reduced resolution, one walk whose steps grow with the
  distance, jittered each frame and blended over the reprojected history.

### What it leaves out

- Hail.
- Cirrus's fibres, and the fractal billows of a storm's towers at its scale.
- The clouds' shadows on the ground.
- The sea, to come.

## License

[MIT](LICENSE) © Romain Le Gall
