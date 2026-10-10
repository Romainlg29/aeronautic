---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/weather @aeronautic/core three@~0.186
```

For the components, add React Three Fiber too, if you don't have it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                              |
| -------------------- | ------- | --------------------------------------- |
| `@aeronautic/core`   | 0.1     | everything: the air, the scene's medium |
| `three`              | 0.186.x | everything                              |
| `react`              | 19      | `@aeronautic/weather/react`             |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/weather/react`             |

## Entry points

| import                        | what's in it                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `@aeronautic/weather/react`   | `<Weather>`, `<CloudLayer>`, `<Storm>`, `useClouds` and `useWeather`.              |
| `@aeronautic/weather`         | The `Weather`, the `CloudsNode`, the genera, the quality presets, defaults, types. |
| `@aeronautic/weather/physics` | The adiabat, the droplets, Mie, the field and the map behind the clouds.           |

The renderer must be three's `WebGPURenderer`. `webgpu_gl()` from
`@aeronautic/core/react` makes one for `<Canvas gl>`.

Next, [a sky of cumulus](../quick-start/).
