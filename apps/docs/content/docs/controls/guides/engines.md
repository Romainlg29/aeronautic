---
title: Engines
description: "Nozzles that open with the throttle, thrust vectoring, and the afterburner on the exhaust."
---

An `<Engine>` drives one engine's nozzle: its petals open and close with the
throttle, and its gimbal turns with the stick and the pedals. What it can do is
read off the model.

```tsx
<Airframe object={gltf.scene} animations={gltf.animations}>
  <Engine side="left">
    <Afterburner preset="afterburner" direction={[0, 0, -1]} />
  </Engine>
  <Engine side="right">
    <Afterburner preset="afterburner" direction={[0, 0, -1]} />
  </Engine>
</Airframe>
```

`side` picks the engine. Left out, an engine takes every nozzle part there is,
for a single-engined aircraft.

## The afterburner on it

An `<Afterburner>` inside an `<Engine>` sits on the engine's exhaust anchor,
turns with its nozzle and runs at its throttle. Its `position` and `direction`
are then in the anchor's frame. See
[Engines](../../../core/guides/engines/) in the core docs.

## The throttle

Each engine's throttle is the flight's by default. Give it its own:

```tsx
// The left engine flamed out
<Engine side="left" throttle={() => 0} />
```

The petals follow a schedule: open at idle (0.45 of their travel), closed down
at military power (0), wide open in full reheat (1). Change it with `nozzle`:

```tsx
<Engine nozzle={{ nozzleIdle: 0.6, nozzleReheat: 0.9 }} />
```

A model that opens its nozzle with a clip, as `ANIM_Nozzle_L_Open`, has the
clip scrubbed by the same schedule.

## Thrust vectoring

A model with a gimbal, nozzle parts of kind `nozzle_pitch` and `nozzle_yaw`,
vectors by default. Nose up wants the exhaust up, so the stick aft turns it up;
the right pedal turns it right.

- **Limits** are the gimbal parts' own. Cap them lower with numbers, in
  degrees: `vectoring={{ pitch: 2, yaw: 5 }}`.
- **A round limit**: when a gimbal part's extras say `limit_shape: "ellipse"`,
  pitch and yaw share one round limit, as an axisymmetric nozzle's do. Full
  stick back and full pedal together reach the circle, not its corner.
- **Off**: `vectoring={false}` holds the nozzle straight.
- **Its own command**: `pitch` and `yaw` give what it vectors for, −1 to 1,
  the stick's and the pedals' by default.
- **Its rate**: `rate`, in degrees a second. The rig's for `nozzle_pitch` and
  `nozzle_yaw` is 40.

### A model with no gimbal

Give it `vectoring` and an exhaust anchor, and pivots are put in at the
exhaust: a yaw pivot, a pitch pivot inside it, and a mount inside that, which
the engine's anchor becomes. Whatever sits on the anchor, the afterburner
included, turns with them. The limits are 10° each way unless given, in one
round limit.

```tsx
<Engine vectoring={{ pitch: 15, yaw: 15 }}>
  <Afterburner />
</Engine>
```

## Where it points

`onVector` is called in the frame the nozzle turns, with where the exhaust
points, in degrees up and right of straight aft:

```tsx
<Engine onVector={(pitch_deg, yaw_deg) => gauge.set(pitch_deg, yaw_deg)} />
```

`useEngine()` inside an engine gives the `Engine` itself: its parts, its
anchor, its `vectoring` limits and shape, its `extras`, and `pitchDeg` and
`yawDeg` as they are now.

## With `<ControlSurfaces>`

It makes an `<Engine>` for each side with a nozzle or an exhaust anchor. Its
`engine` prop is given to each, and `exhaust` is put inside each:

```tsx
<ControlSurfaces
  object={gltf.scene}
  animations={gltf.animations}
  engine={{ vectoring: { pitch: 3 } }}
  exhaust={<Afterburner preset="afterburner" direction={[0, 0, -1]} />}
/>
```

See it on the [thrust vectoring](../../examples/thrust-vectoring/) example.

Next, [how a model says what moves](../model-metadata/).
