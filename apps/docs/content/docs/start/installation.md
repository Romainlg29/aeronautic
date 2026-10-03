---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add r3f-afterburner
```

Install the peer dependencies too, if you don't have them yet:

```bash
pnpm add three@~0.186 @react-three/fiber react react-dom
```

| peer                 | version |
| -------------------- | ------- |
| `react`              | 19      |
| `three`              | 0.186.x |
| `@react-three/fiber` | 9 or 10 |

## Two entry points

| import                | what's in it                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `r3f-afterburner`     | The components, the plain three.js classes, presets and helpers.     |
| `r3f-afterburner/tsl` | Every TSL piece the material is built from, for a material of yours. |

Next, [put a plume on screen](../quick-start/).
