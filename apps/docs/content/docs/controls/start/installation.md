---
title: Installation
description: "Install the package and its peers."
---

## From npm

```bash
pnpm add @aeronautic/controls
```

It brings [`@aeronautic/core`](../../../core/start/installation/) with it, for
the flight. Install the peer dependencies too, if you don't have them yet:

```bash
pnpm add three@~0.186 @react-three/fiber react react-dom
```

| peer                 | version | needed for                   |
| -------------------- | ------- | ---------------------------- |
| `three`              | 0.186.x | everything                   |
| `react`              | 19      | `@aeronautic/controls/react` |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/controls/react` |

To write to the flight from your own code, add `@aeronautic/core` to your
dependencies as well:

```bash
pnpm add @aeronautic/core
```

## Two entry points

| import                       | what's in it                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `@aeronautic/controls`       | `ControlRig`, the parts, `Engine` and the helpers. Plain three.js, no React.            |
| `@aeronautic/controls/react` | `<ControlSurfaces>`, `<Airframe>`, a component for each part, `<Engine>` and the hooks. |

It needs no renderer of its own: it only moves nodes, so it works with WebGL as
well as WebGPU.

Next, [move a model](../quick-start/).
