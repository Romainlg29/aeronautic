---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/countermeasures @aeronautic/core three@~0.186
```

For the React component, add React Three Fiber too, if you don't have it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                            |
| -------------------- | ------- | ------------------------------------- |
| `@aeronautic/core`   | 0.1     | everything: the flight, air and glare |
| `three`              | 0.186.x | everything                            |
| `react`              | 19      | `@aeronautic/countermeasures/react`   |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/countermeasures/react`   |

## Entry points

| import                                | what's in it                                                                |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `@aeronautic/countermeasures/react`   | `<Countermeasures>` and its types.                                          |
| `@aeronautic/countermeasures`         | The plain three.js class, the flares, the quality presets, defaults, types. |
| `@aeronautic/countermeasures/physics` | The grain, the flame, the flight and the programs.                          |

The renderer must be three's `WebGPURenderer`. `webgpu_gl()` from
`@aeronautic/core/react` makes one for `<Canvas gl>`.

Next, [let some flares go](../quick-start/).
