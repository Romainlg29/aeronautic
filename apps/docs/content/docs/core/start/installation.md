---
title: Installation
description: "Install the package, and what comes with it."
---

## From npm

`@aeronautic/afterburner`, `@aeronautic/wing-vapor` and
`@aeronautic/controls` each take it as a peer dependency, so install it next to
them. That way every package and your own code share one copy, with one
`<FlightProvider>`:

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
  Keep one copy. The contexts are registered globally, so two copies still
  share a `<FlightProvider>`, but each would carry its own atmosphere and
  helpers. Being a peer, it is installed once, at the version you pick.
</Callout>

## Two entry points

| import                   | what's in it                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `@aeronautic/core`       | `Flight`, the atmosphere and the depth capture. Plain three.js, no React.            |
| `@aeronautic/core/react` | `<FlightProvider>`, `useFlight`, `useFlightFrame`, `useFlightStore` and `useThrust`. |

Next, [share a flight](../quick-start/).
