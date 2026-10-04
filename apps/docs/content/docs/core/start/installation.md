---
title: Installation
description: "Install the package, and what comes with it."
---

## From npm

You rarely install it by itself. `@aeronautic/afterburner`,
`@aeronautic/wing-vapor` and `@aeronautic/controls` each depend on it, so it
comes with them. Add it to your own dependencies when you import from it
yourself, for the `<FlightProvider>` or the atmosphere:

```bash
pnpm add @aeronautic/core
```

Install the peer dependencies too, if you don't have them yet:

```bash
pnpm add three@~0.186 @react-three/fiber react react-dom
```

| peer                 | version | needed for               |
| -------------------- | ------- | ------------------------ |
| `three`              | 0.186.x | everything               |
| `react`              | 19      | `@aeronautic/core/react` |
| `@react-three/fiber` | 9 or 10 | `@aeronautic/core/react` |

They are the same as every other `@aeronautic` package's, so they all install
side by side.

<Callout type="warn">
  Keep one copy. Every package must find the same `@aeronautic/core`, or each
  sees its own `<FlightProvider>` context and the effects stop following the
  flight. A package manager dedupes it when the versions agree, which they do
  when the packages come from the same release.
</Callout>

## Two entry points

| import                   | what's in it                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `@aeronautic/core`       | `Flight`, the atmosphere and the depth capture. Plain three.js, no React.            |
| `@aeronautic/core/react` | `<FlightProvider>`, `useFlight`, `useFlightFrame`, `useFlightStore` and `useThrust`. |

Next, [share a flight](../quick-start/).
