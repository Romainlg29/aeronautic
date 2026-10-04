---
title: By hand
description: "Move a part, a group or a clip yourself: the canopy, the bay doors, the ladder."
---

Not everything that moves is in a flight. The canopy, the weapon bays, the
boarding ladder are moved by hand, through the rig.

Get the rig from `<Airframe ref>` or `<ControlSurfaces ref>`, or with
`useAirframe()` inside one:

```tsx
const rig = useRef<ControlRig>(null);

<ControlSurfaces ref={rig} object={gltf.scene} animations={gltf.animations} />;
```

## A clip

`setClip(name, share, rate?)` scrubs a clip to a share of it, 0 to 1. It plays
there at its own speed, or at `rate` shares a second, Infinity to jump:

```ts
rig.current?.setClip("ANIM_Canopy_Open", 1);
rig.current?.setClip("ANIM_Bay_Open", 1, 0.5); // over two seconds
```

## A group

`setGroup(group, share)` moves every part of a rig group, or of a kind, to a
share of its travel:

```ts
rig.current?.setGroup("ladder", 1);
rig.current?.setGroup("airbrake", 0.5);
```

## A part

`set(name, value)` moves one part to a value in its unit, clamped to its
limits:

```ts
rig.current?.set("CTRL_Radar_Array_C", -5);
```

## Giving it back

Each of them wins over any drive of the part until it is given `null`, which
hands it back:

```ts
rig.current?.setGroup("airbrake", null);
```

A part moved by hand still moves at its rate, as an actuator would.

## Where they are

`rig.value(name)` is where a part is now, in its unit. `rig.onMoved(listener)`
calls back once a frame at most, after anything moved, and returns what stops
it.

## No flight at all

An `<Airframe source={null}>` reads no flight. Its parts move only by hand,
and its drives do nothing: a showroom model whose canopy opens on a click.

Next, [rigging a model](../rigging-a-model/).
