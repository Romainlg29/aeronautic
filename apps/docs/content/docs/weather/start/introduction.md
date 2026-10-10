---
title: Introduction
description: "What @aeronautic/weather draws, what drives it, and what it needs."
---

`@aeronautic/weather` draws volumetric clouds, from fair-weather cumulus to a
thunderstorm, in [React Three Fiber](https://r3f.docs.pmnd.rs) and three.js,
raymarched in TSL for three's `WebGPURenderer`:

- **Every genus**: cumulus humilis, mediocris and congestus, cumulonimbus,
  stratocumulus, stratus, nimbostratus, altocumulus, altostratus, cirrus and
  cirrostratus, each a layer with its dials set as the WMO's cloud atlas and
  the field campaigns observe it.
- **From a seed**: the same seed, the same sky. The cumulus are a power law
  of sizes, as Landsat counts them, each a dome on a flat base worn into
  billows by noise baked on the GPU from the seed.
- **Storms**: a cumulonimbus placed by hand, its tower to the tropopause,
  its anvil spread downwind and its rain under it.
- **Their water**: the base is the day's lifted condensation level, and the
  water what a parcel condenses rising on the moist adiabat from it, less what
  the cloud mixes away. A humid morning's cumulus sit lower than a dry
  afternoon's.
- **Their light**: droplets sized from that water and the air mass's
  aerosol stop light as geometric optics says and scatter it as Mie does; ice
  above the freezing level and rain below the base stop it too. The sun is
  marched through the cloud, its light scattered once and many times over,
  and the sky and the ground light the cloud through what lies over and under.
- **The other effects inside them**: the plumes, the vapour, the contrails
  and the flares fade into the cloud round the camera and take its light,
  and a shared flight's air saturates in cloud, so its wings pull vapour as
  they would.

## What drives it

The dials split the way the physics does, each a physical quantity in SI
units:

- **A layer** (`CloudLayer`): one genus across the sky, where it is, how
  much of the sky it covers, how its clouds are sized and shaped, how much of
  its water it keeps, how fast it billows and how it drifts.
- **The day** (`WeatherDay`): the air at the ground, its warmth and its
  humidity, from which every base and every cloud's water follow.
- **The look** (`WeatherLook`): the sun, the sky and the ground that light
  the clouds, in the scene's own light units, and the haze in front of them.
- **The quality**: how finely they are drawn, against how fast.

The detail's size and a sheet's cells are estimates, said to be where they
are. Everything else is worked out or measured.

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported.

It pairs with the other `@aeronautic` packages, but needs none of them.

Next, [install it](../installation/).
