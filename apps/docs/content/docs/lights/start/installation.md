---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/lights @aeronautic/core three@~0.186
```

For the React component, add React Three Fiber too, if you don't have it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                     |
| -------------------- | ------- | ------------------------------ |
| `@aeronautic/core`   | 0.1     | everything: the flight and air |
| `three`              | 0.186.x | everything                     |
| `react`              | 19      | `@aeronautic/lights/react`     |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/lights/react`     |

## Entry points

| import                       | what's in it                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `@aeronautic/lights/react`   | `<Lights>` and its types.                                                         |
| `@aeronautic/lights`         | The plain three.js class, the lamps, the quality presets, defaults and types.     |
| `@aeronautic/lights/physics` | The rule's photometry, the colours, the flash, the haze, the glare and the beams. |

The renderer must be three's `WebGPURenderer`. `webgpu_gl()` from
`@aeronautic/core/react` makes one for `<Canvas gl>`.

Next, [put lights on an aircraft](../quick-start/).
