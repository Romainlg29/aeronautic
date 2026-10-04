---
title: Tracking
description: "Work the airspeed, the angles, the load factor and the rates out from how an object moves."
---

With no flight model to write it, a flight can watch the aircraft instead.
Give the provider the object that moves:

```tsx
const jet = useRef<Group>(null);

<FlightProvider track={jet} seaLevelY={0}>
  <group ref={jet}>
    <primitive object={gltf.scene} />
  </group>
</FlightProvider>;
```

Each frame, before any other frame callback, it reads the object's world
transform and works out:

- the **airspeed**, from how far it moved;
- the **angle of attack** and the **sideslip**, from which way it moved in its
  own frame;
- the **load factor**, from how its path curves and which way gravity pulls;
- the **roll, pitch and yaw rates**, from how it turned;
- the **altitude**, from its height above `seaLevelY`, if that is given.

The rest, such as the throttle, the controls and the day, keeps whatever is
written to it.

<Callout>
  A provider with `track` must be inside the `<Canvas>`: it runs in a frame
  callback.
</Callout>

## Which way it faces

The tracker needs to know which way the object flies and which way is its up.
By default it flies along −Z with +Y up, as three.js' convention has it. A
model built another way says so:

```tsx
<FlightProvider track={jet} forward={[1, 0, 0]} up={[0, 1, 0]}>
```

## Options

| prop        | default      | meaning                                                                            |
| ----------- | ------------ | ---------------------------------------------------------------------------------- |
| `track`     | none         | an `Object3D`, or a ref to one                                                     |
| `forward`   | `[0, 0, -1]` | which way the object flies, in its own frame                                       |
| `up`        | `[0, 1, 0]`  | which way is its up, in its own frame                                              |
| `seaLevelY` | none         | the world height of sea level, in metres. Left out, the altitude is not tracked    |
| `wind`      | none         | the wind in world space, m/s: the airspeed is through the air, not over the ground |
| `worldUp`   | `[0, 1, 0]`  | which way is up in the world, for gravity                                          |

Options written inline are fine: they are read in the frame, and compared by
value.

## Smoothing

A position differenced frame to frame is noisy, and its acceleration twice so.
The tracker eases them: the velocity follows in about 0.05 s, the acceleration
in 0.15 s and the rates in 0.08 s. A real aircraft changes far more slowly than
that, so the numbers follow it closely without a frame's jitter.

The first frame only starts watching, as does a frame more than 0.25 s after
the last one, so a tab coming back from the background does not see a jump of
several hundred metres. `flight.resetTracking()` starts it over by hand, after
a teleport for instance.

## Held still

Tracking measures motion through the world. A model held still in a showcase,
with the camera orbiting it, tracks as at rest: write the airspeed and the
angles by hand instead, or move the model through the world.

Next, [read it](../reading-it/).
