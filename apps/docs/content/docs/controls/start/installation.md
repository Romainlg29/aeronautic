---
title: Installation
description: "Install the package and its peers."
---

## From npm

```bash
pnpm add @aeronautic/controls @aeronautic/core three@~0.186
```

[`@aeronautic/core`](../../../core/start/installation/) holds the flight it
reads. For the React components, add React Three Fiber too, if you don't have
it yet:

```bash
pnpm add @react-three/fiber react react-dom
```

| peer                 | version | needed for                   |
| -------------------- | ------- | ---------------------------- |
| `@aeronautic/core`   | 0.1     | everything                   |
| `three`              | 0.186.x | everything                   |
| `react`              | 19      | `@aeronautic/controls/react` |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/controls/react` |

## Two entry points

| import                       | what's in it                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `@aeronautic/controls`       | `ControlRig`, the parts, `Engine` and the helpers. Plain three.js, no React.            |
| `@aeronautic/controls/react` | `<ControlSurfaces>`, `<Airframe>`, a component for each part, `<Engine>` and the hooks. |

It needs no renderer of its own: it only moves nodes, so it works with WebGL as
well as WebGPU.

Next, [move a model](../quick-start/).
