# @aeronautic/weather

[![npm](https://img.shields.io/npm/v/@aeronautic/weather)](https://www.npmjs.com/package/@aeronautic/weather)
[![CI](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml/badge.svg)](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Physically based **volumetric clouds and storms** for [React Three Fiber](https://r3f.docs.pmnd.rs)
and three.js, raymarched in TSL for three's `WebGPURenderer`.

- **Every genus**: cumulus humilis, mediocris and congestus, cumulonimbus,
  stratocumulus, stratus, nimbostratus, altocumulus, altostratus, cirrus
  and cirrostratus, each a layer with its dials set as the WMO's Cloud Atlas
  and the measurements have it. Layers stack, and any dial changes.
- **From a seed**: the same seed, the same sky, on any machine. The GPU's
  noise is baked from the very functions the CPU evaluates, so what an
  aircraft samples at a point is what is drawn there.
- **Storms**: a cumulonimbus where it is told, its tower to the tropopause,
  its anvil spread downwind, its rain shaft under it.
- **Formed as the air makes them**: the base at the day's lifted
  condensation level, the water from the moist adiabat and the adiabatic
  fraction, the droplets from the air mass's aerosol, their extinction from
  their effective radius. Ice above the freezing level, Marshall–Palmer
  rain below.
- **Lit as they are**: Mie scattering for the droplets' size, the sun through
  the cloud towards it, light scattered many times by Eddington's two-stream,
  the sky above and the ground below through the cloud over and under.
- **Flown through**: inside a `<FlightProvider>`, the flight's air is
  saturated in cloud, so the wing vapour and the contrails form as they
  would; and the plumes, the vapour, the contrails, the lights and the
  countermeasures fade into the cloud round the camera.

None of it is drawn to a size by eye; the few estimates are said to be.

**[Docs](https://romainlg29.github.io/aeronautic/docs/weather/start/introduction/)** ·
**[Live example of the genera](https://romainlg29.github.io/aeronautic/docs/weather/examples/the-genera/)** ·
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

`<Weather>` holds the sky, its layers are its children, and `useClouds()`
gives the node that draws them for the camera. Composite it over the scene's
colour and depth:

```tsx
import {
  CloudLayer,
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

<Weather seed={7} day={{ temperatureOffsetK: 12, surfaceHumidity: 0.75 }}>
  <CloudLayer genus="cumulus-mediocris" />
  <Storm at={[25_000, 5000]} diameterM={10_000} />
  <Sky />
</Weather>;
```

The scene is in metres. `weather.sample(x, y, z)` is the air at a point:
its extinction, its visibility, whether it is in cloud.

## The dials

Each is a physical quantity in SI units:

- **`day`**: the temperature offset from the standard day, the humidity at
  the ground, the ground's altitude.
- **Each layer**: its form, base, depth, cover, cloud sizes and their power
  law, aspect, crown, anvil, rain rate, adiabatic fraction, air mass, ice
  size, updraft, billow size, wind, and clouds placed by hand.
- **`look`**: the sun's illuminance and direction, the sky's and the
  ground's radiance, the exposure, and the air's visibility and haze.
- **`quality`**: the resolution, the steps, the range and the weather map.

## How it works

- **The base.** A parcel lifted dry-adiabatically until it saturates: close
  to Espy's 125 m a kelvin of dew-point spread.
- **The water.** The moist adiabat's condensate above the base, times the
  adiabatic fraction (Albrecht et al. 1990; Warner 1955).
- **The droplets.** 74 cm⁻³ in marine air, 288 over land (Miles et al.
  2000); their effective radius from the water (Martin et al. 1994); their
  extinction 3 LWC / (2 ρ r<sub>e</sub>).
- **Ice and rain.** Ice by Fu (1996), all of it below −38 °C; rain by
  Marshall and Palmer, 0.365 R<sup>0.63</sup> per km.
- **The shapes.** Cumulus sizes as a D<sup>−2</sup> power law (Benner and
  Curry 1998), domes after Scorer (1957), billows a quarter of a tower
  across (Blyth et al. 1988), worn by seeded cellular noise, lobes on
  lobes as rough as Lovejoy (1982) measured cloud edges.
- **The light.** Mie's phase through Jendersie and d'Eon's (2023) fit; the
  sun through six doubling steps; many scatterings by Eddington's
  two-stream; each step integrated as Hillaire (2016) has it; the air in
  front by Koschmieder.
- **The march.** At reduced resolution, striding over clear air and walking
  finely in cloud, each frame jittered and blended over the reprojected
  history.

### What it leaves out

- Lightning and hail.
- Cirrus's fibres, and the fractal billows of a storm's towers at its scale.
- The clouds' shadows on the ground.

## License

[MIT](LICENSE) © Romain Le Gall
