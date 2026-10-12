---
title: Introduction
description: "What @aeronautic/weather draws, what drives it, and what it needs."
---

`@aeronautic/weather` draws the weather in
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js: volumetric
clouds from fair-weather cumulus to a thunderstorm, their rain and their
lightning, raymarched in TSL for three's `WebGPURenderer`.

- **Never one sky everywhere**: the clouds follow from the air, and the air
  is different from place to place. Its humidity, its warmth, the height of
  its inversion and how fast it rises are fields over the ground, a pressure
  system's hundreds of kilometres and the local tens. A field of cumulus here,
  clear air there, a deck further off, all changing over the hours.
- **From physics**: a cloud's base is the condensation level of the air
  under it, its top where its parcel stops rising, its water what the moist
  adiabat condenses. Whether it is cumulus or a deck, and whether it rains,
  follow from the same air.
- **Storms that live**: thunderstorms fire where the air is unstable enough.
  Each one grows its tower, rains, flashes and dissipates, and its anvil
  spreads downwind.
- **Rain and lightning**: rain streaks round the camera, as many and as
  large as Marshall and Palmer's drops at the rate there. Lightning flashes
  as often as a storm of that height does, lights the cloud from inside and
  is followed by its thunder.
- **Plugins**: a storm placed by hand, a cold or warm front moving through,
  a patch of moister air. Each is a plugin, and your own plugins can change
  the air, add storms or change the clouds.
- **Their light**: droplets sized from their water and the air mass's
  aerosol scatter light as Mie does. The sun is marched through the cloud and
  its light scattered once and many times. The sky and the ground light the
  cloud through what lies over and under it.
- **The other effects inside them**: the plumes, the vapour, the contrails
  and the flares fade into the cloud round the camera and take its light. A
  shared flight's air saturates in cloud, so its wings pull vapour as they
  would.

## What drives it

- **The climate** (`Climate`): the air's fields, each a mean and how far
  the system and the local pattern move it. It also holds the winds, the
  day's warmth, the air mass and the heights of the middle and high cloud.
  Six come ready: `clear`, `fair`, `unsettled`, `stormy`, `overcast` and
  `frontal`.
- **The seed**: the same seed, the same sky, on any machine.
- **The plugins**: what the weather is made of past its climate.
- **The look** (`WeatherLook`): the sun, the sky and the ground that light
  the clouds, in the scene's own light units, and the haze in front of them.
- **The quality**: how finely they are drawn, against how fast.

Every number is worked out or measured, and the comments in the source say
from what. Where one is an estimate, it says so.

## Requirements

- React 19, React Three Fiber 9 (or 10), three 0.186.
- A `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is
  missing. The classic `WebGLRenderer` is **not** supported.

It pairs with the other `@aeronautic` packages, but needs none of them.

Next, [install it](../installation/).
