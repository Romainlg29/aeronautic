---
title: Reading it
description: "Read the flight every frame for nothing, or in the UI a few times a second."
---

There are three ways to read a flight, from cheapest to dearest.

## In a frame, without rendering

`useFlightFrame` calls back every frame with the flight's values, as
`useFrame` does. Use it for anything that moves with the flight: a camera's
shake, a sound's pitch, a gauge needle drawn in the scene.

```tsx
useFlightFrame((flight) => {
  engine_sound.playbackRate = 0.6 + flight.throttle * 0.4;
  needle.current.rotation.z = -flight.mach * Math.PI;
});
```

The second argument is the callback's priority, as `useFrame`'s. A tracked
flight is written at −1, so anything at 0 or later reads this frame's.

## By hand

`useFlightStore` gives the `Flight` itself. Its `values` is one object for its
whole life, written in place, so it can be held and read whenever:

```tsx
const flight = useFlightStore();
const values = flight?.values;

useFrame(() => {
  if (values && values.mach > 1) {
    boom();
  }
});
```

Don't write to `values`. Write with `flight.set`, so the speeds and the air
that follow are worked out and the effects hear of it.

`flight.version` counts the writes. Remember the last one you read at, and you
can skip your own work when nothing changed, as the effects do.

## In the UI

`useFlight` selects from the flight and renders when the selection changes:

```tsx
const Hud = () => {
  const mach = useFlight((v) => v.mach.toFixed(2), { hz: 10 });
  const altitude = useFlight((v) => Math.round(v.altitudeM / 10) * 10);

  return (
    <div>
      M {mach} · {altitude} m
    </div>
  );
};
```

- **`hz`** caps the renders a second. A value that moves every frame would
  otherwise render every frame: give it one. The last change in a gap is never
  dropped.
- **Round** what you select. A selection that does not change does not render,
  so rounding the altitude to 10 m renders when it crosses one.
- **`equal`** compares two selections, `Object.is` by default. A selector that
  builds an object every time renders on every write unless you give one.

Outside any provider, `useFlight` reads a default flight at rest, so a HUD
renders before its scene has loaded.

## What it knows

Beyond what is written, a flight works out:

| field               | meaning                                                         |
| ------------------- | --------------------------------------------------------------- |
| `mach`              | the flight Mach number                                          |
| `dynamicPressurePa` | ½ρV², in pascals                                                |
| `temperatureK`      | the air's temperature, the day's offset included                |
| `pressurePa`        | the air's pressure                                              |
| `pressureRatio`     | the pressure as a share of sea level's                          |
| `densityKgPerM3`    | the moist air's density                                         |
| `densityRatio`      | the density as a share of sea level's on a standard day (1.225) |
| `soundMPerS`        | the speed of sound                                              |
| `dewPointK`         | where the air's vapour would condense                           |
| `ram`               | the stagnation over static pressure an inlet recovers           |

`flight.air` is the whole moist air, with the vapour pressure and the mixing
ratio too. See [The atmosphere](../../reference/atmosphere/).

Next, [engines](../engines/).
