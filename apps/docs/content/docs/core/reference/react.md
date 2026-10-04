---
title: React
description: "FlightProvider, useFlight, useFlightFrame, useFlightStore, ThrustContext and useThrust."
---

```ts
import {
  FlightProvider,
  ThrustContext,
  useFlight,
  useFlightFrame,
  useFlightStore,
  useThrust,
} from "@aeronautic/core/react";
```

## `<FlightProvider>`

One aircraft's flight, for everything inside it.

| prop          | type                                      | meaning                                                                  |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `flight`      | `Flight`                                  | a flight made elsewhere, to share. Left out, the provider makes one      |
| `initial`     | `Partial<FlightInput>`                    | what the provider's own flight starts with. Read once                    |
| `track`       | `Object3D \| RefObject<Object3D \| null>` | an object to track every frame. Needs the provider inside the `<Canvas>` |
| `forward`     | `[x, y, z]`                               | which way the tracked object flies. `[0, 0, -1]` by default              |
| `up`          | `[x, y, z]`                               | which way is its up. `[0, 1, 0]` by default                              |
| `sea_level_y` | `number`                                  | world height of sea level, for the tracked altitude                      |
| `wind`        | `[x, y, z]`                               | the wind in world space, m/s                                             |
| `world_up`    | `[x, y, z]`                               | which way is up in the world. `[0, 1, 0]` by default                     |

The tracker runs in a `useFrame` at priority −1, before the default 0. The
options are read in the frame, so writing them inline is fine.

## `useFlightStore()`

The nearest provider's `Flight`, or null outside one.

## `useFlightFrame(callback, priority = 0)`

Calls `callback(values, delta_s)` every frame inside a provider, without
rendering. `priority` is `useFrame`'s.

## `useFlight(selector, options?)`

Selects from the flight's values for the UI, and renders when the selection
changes.

| option  | default     | meaning                                                                     |
| ------- | ----------- | --------------------------------------------------------------------------- |
| `hz`    | none        | at most this many renders a second. The last change in a gap is not dropped |
| `equal` | `Object.is` | whether two selections are the same, so no render                           |

Outside a provider it reads a default flight of its own.

## `ThrustContext` and `useThrust()`

What an engine gives the effects inside it.

```ts
type Thrust = {
  readonly anchor: Object3D | null;
  readonly throttle: (values: Readonly<FlightValues>) => number;
};
```

`@aeronautic/controls`' `<Engine>` provides one. `useThrust()` reads the
nearest, or null. See [Engines](../../guides/engines/).
