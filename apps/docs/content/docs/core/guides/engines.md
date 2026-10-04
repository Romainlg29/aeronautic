---
title: Engines
description: "Put an effect on an engine's exhaust, at that engine's throttle."
---

A flight has one throttle. A twin-engined aircraft with one engine at idle has
two, and its afterburners each sit on their own nozzle as it turns. That is
what a **thrust** carries: where an engine's exhaust leaves, and how to read
that engine's throttle from the flight.

```ts
type Thrust = {
  // Where the exhaust leaves, moving with the nozzle. null until it is found
  readonly anchor: Object3D | null;

  // The engine's throttle, 0 to 1.1, from the flight's values
  readonly throttle: (values: Readonly<FlightValues>) => number;
};
```

## From `@aeronautic/controls`

`@aeronautic/controls`' `<Engine>` provides one. An `<Afterburner>` inside it
sits on the engine's exhaust, turns with its nozzle and runs at its throttle,
with no props:

```tsx
<ControlSurfaces object={gltf.scene} animations={gltf.animations}>
  <Engine side="left" throttle={(f) => f.throttle}>
    <Afterburner />
  </Engine>
  <Engine side="right" throttle={(f) => Math.min(f.throttle, 0.3)}>
    <Afterburner />
  </Engine>
</ControlSurfaces>
```

Or let `<ControlSurfaces>` make an engine for each nozzle the model has, and
put the same thing in each:

```tsx
<ControlSurfaces
  object={gltf.scene}
  animations={gltf.animations}
  exhaust={<Afterburner />}
/>
```

See [Engines](../../../controls/guides/engines/) in the controls docs.

## An engine of your own

Anything can provide a thrust. Give `<ThrustContext>` an anchor and a throttle,
and the effects inside it follow them:

```tsx
import { ThrustContext } from "@aeronautic/core/react";

const thrust = useMemo(
  () => ({
    anchor: nodes.Exhaust,
    throttle: (f: Readonly<FlightValues>) => f.throttle * 0.95,
  }),
  [nodes.Exhaust],
);

<ThrustContext value={thrust}>
  <Afterburner />
</ThrustContext>;
```

An effect of your own reads the nearest one with `useThrust()`, null outside
any.

## What wins

An afterburner's throttle is, in order:

1. its own `throttle` prop, a number or a function of the flight;
2. the nearest engine's throttle;
3. the flight's own `throttle`;
4. full reheat, outside any provider.

Its `target` is its own prop if given, else the nearest engine's anchor. Give
`target={null}` to sit where it is in the tree instead.

Next, [without React](../without-react/).
