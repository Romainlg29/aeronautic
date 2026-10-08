---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/contrails @aeronautic/core three@~0.186
```

For the React component, add React Three Fiber too, if you don't have it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                     |
| -------------------- | ------- | ------------------------------ |
| `@aeronautic/core`   | 0.1     | everything: the flight and air |
| `three`              | 0.186.x | everything                     |
| `react`              | 19      | `@aeronautic/contrails/react`  |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/contrails/react`  |

## Entry points

| import                          | what's in it                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `@aeronautic/contrails/react`   | `<Contrails>` and its types.                                                  |
| `@aeronautic/contrails`         | The plain three.js class, the fuels, the quality presets, defaults and types. |
| `@aeronautic/contrails/physics` | The criterion, the plume, the ice and the wake, for a flight model or a HUD.  |

The renderer must be three's `WebGPURenderer`. `webgpu_gl()` from
`@aeronautic/core/react` makes one for `<Canvas gl>`.

Next, [put contrails on an aircraft](../quick-start/).
