---
title: Installation
description: "Install the package and its peer dependencies."
---

## From npm

```bash
pnpm add @aeronautic/wing-vapor
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

They are the same as `@aeronautic/afterburner`'s, so the two install side by
side.

## Two entry points

| import                       | what's in it                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| `@aeronautic/wing-vapor`     | The component, the plain three.js class, the capture and the physics. |
| `@aeronautic/wing-vapor/tsl` | The vapor field and material in TSL, for a material of your own.      |

Next, [put vapor on a wing](../quick-start/).
