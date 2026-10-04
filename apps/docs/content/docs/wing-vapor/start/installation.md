---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/wing-vapor @aeronautic/core three@~0.186
```

For the React component, add React Three Fiber too, if you don't have it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                     |
| -------------------- | ------- | ------------------------------ |
| `@aeronautic/core`   | 0.1     | everything: the flight and air |
| `three`              | 0.186.x | everything                     |
| `react`              | 19      | `@aeronautic/wing-vapor/react` |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/wing-vapor/react` |

They are the same as `@aeronautic/afterburner`'s, so the two install side by
side.

## Entry points

| import                           | what's in it                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `@aeronautic/wing-vapor/react`   | `<WingVapor>` and its types.                                                    |
| `@aeronautic/wing-vapor`         | The plain three.js class, the capture, the quality presets, defaults and types. |
| `@aeronautic/wing-vapor/physics` | The wing's shape, the condensation and the aerodynamics, for a flight model.    |
| `@aeronautic/wing-vapor/tsl`     | The vapor field and material in TSL, for a material of your own.                |

The renderer must be three's `WebGPURenderer`. `webgpu_gl()` from
`@aeronautic/core/react` makes one for `<Canvas gl>`.

Next, [put vapor on a wing](../quick-start/).
