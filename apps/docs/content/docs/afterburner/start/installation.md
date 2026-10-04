---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/afterburner @aeronautic/core three@~0.186
```

For the React components, add React Three Fiber too, if you don't have it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                      |
| -------------------- | ------- | ------------------------------- |
| `@aeronautic/core`   | 0.1     | everything: the flight and air  |
| `three`              | 0.186.x | everything                      |
| `react`              | 19      | `@aeronautic/afterburner/react` |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/afterburner/react` |

## Entry points

| import                            | what's in it                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `@aeronautic/afterburner/react`   | `<Afterburner>`, `<AfterburnerBatch>`, `useAfterburnerBatch` and their types.          |
| `@aeronautic/afterburner`         | The plain three.js classes, presets, defaults and types. No React.                     |
| `@aeronautic/afterburner/physics` | The plume's physics: the propellants, the hull, the blackbody and the profile helpers. |
| `@aeronautic/afterburner/tsl`     | Every TSL piece the material is built from, for a material of yours.                   |

The renderer must be three's `WebGPURenderer`. `webgpu_gl()` from
`@aeronautic/core/react` makes one for `<Canvas gl>`.

Next, [put a plume on screen](../quick-start/).
