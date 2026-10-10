---
title: Layers and genera
description: "A genus as a layer, its dials changed, and clouds placed by hand."
---

A sky is layers, each one genus of cloud across it. `<CloudLayer>` adds one
to the nearest `<Weather>` while it is mounted:

```tsx
<Weather>
  <CloudLayer genus="cumulus-humilis" cover={0.2} />
  <CloudLayer genus="altocumulus" />
  <CloudLayer genus="cirrus" windMPerS={[30, 5]} />
</Weather>
```

Its `genus` sets every dial as that cloud is observed; any other prop is a
field of the layer, set over the genus's. Without React, `cloud_layer(genus,
overrides)` makes the same layer, and `weather.add(layer)` adds it.

## The genera

| genus               | form       | base         | depth      | cover |
| ------------------- | ---------- | ------------ | ---------- | ----- |
| `cumulus-humilis`   | cumuliform | condensation | 800 m      | 0.25  |
| `cumulus-mediocris` | cumuliform | condensation | 2.5 km     | 0.35  |
| `cumulus-congestus` | cumuliform | condensation | 6 km       | 0.3   |
| `cumulonimbus`      | cumuliform | condensation | tropopause | 0.1   |
| `stratocumulus`     | stratiform | condensation | 400 m      | 0.8   |
| `stratus`           | stratiform | condensation | 300 m      | 1     |
| `nimbostratus`      | stratiform | condensation | 3 km       | 1     |
| `altocumulus`       | stratiform | 3.5 km       | 400 m      | 0.5   |
| `altostratus`       | stratiform | 4 km         | 1.5 km     | 1     |
| `cirrus`            | stratiform | 8 km         | 1.5 km     | 0.3   |
| `cirrostratus`      | stratiform | 9 km         | 800 m      | 1     |

`CLOUD_GENERA` lists them, low to high. Where each number comes from is on
[the genera](/docs/weather/reference/genera).

## Cumuliform and stratiform

A **cumuliform** layer is made of clouds: each a dome on a flat base at the
condensation level, as wide as a power law of sizes draws it
(`diameterM`, `sizeExponent`) and as tall as its `aspect` and `crown` make
it, up to the layer's `depthM`. A **stratiform** layer is a sheet, `depthM`
thick, holed where its `cover` leaves sky, its cells about `diameterM`
across.

Both are worn into billows by the noise, `billowM` and `detailM` across,
drawn out `stretch` times along the wind, and boiling upward at the
layer's `updraftMPerS`. Both drift with `windMPerS`.

## Clouds placed by hand

`<Storm>` is a cumulonimbus layer holding one cloud, where it is told:

```tsx
<Storm at={[25_000, 5000]} diameterM={10_000} anvilDiameterM={40_000} />
```

Any cumuliform layer can hold clouds placed by hand, in its `cells`, beside
or in place of the ones its cover draws (`cover: 0` for none):

```tsx
<CloudLayer
  genus="cumulus-congestus"
  cover={0}
  cells={[
    { at: [3000, -2000], diameterM: 4000 },
    { at: [-6000, 1000], diameterM: 2500, topM: 6000 },
  ]}
/>
```

A cell's `topM` is above sea level; left out, its aspect sets it, or the
tropopause for a cumulonimbus. Its anvil grows only if its tower reaches the
top of the layer, where the stable air stops it.

## The seed

`<Weather seed>` seeds every layer: the same seed, the same sky, on any
machine, the GPU's noise baked from the very function the CPU evaluates. A
layer's own `seed` changes it alone.
