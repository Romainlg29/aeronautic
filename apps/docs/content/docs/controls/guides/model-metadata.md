---
title: What a model says
description: "Read a part's limits and extras, find the anchors a model marks, and put things on them."
---

Everything the rig found is there to read: each part's limits, its rest pose,
which way is positive and any extras the model gave it, and each point the
model marks for an effect.

## A part

`usePart(name)` inside an `<Airframe>` gives one part, once the rig is there:

```tsx
const rudder = usePart("CTRL_Rudder_L");

rudder?.min; // -30
rudder?.max; // 30
rudder?.unit; // "deg"
rudder?.positive; // "trailing_edge_right"
rudder?.extras; // anything else the model said
```

The fields of a `ControlSurface`:

| field        | meaning                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| `name`       | the node's name                                                                     |
| `kind`       | what it is: `elevon`, `gear_door`, `throttle_lever`…                                |
| `node`       | the node that moves: the model's own, or a pivot put in above a panel found by name |
| `motion`     | `rotation` or `translation`, about or along the node's local X                      |
| `unit`       | `deg`, `rad`, `m` or `normalized`                                                   |
| `min`, `max` | its limits, in its unit                                                             |
| `rest`       | where it was posed when found                                                       |
| `side`       | `left`, `right` or `centre`                                                         |
| `group`      | the rig's group, as `elevons`, or the kind for a part found by name                 |
| `positive`   | what a positive value does, as `trailing_edge_down` or `open`                       |
| `found_by`   | `rig`, `name` or `virtual`                                                          |
| `extras`     | everything else the model's extras gave it, as `ab_detent` or `limit_shape`         |

`useAirframe()` gives the rig itself, and `rig.surfaces` every part.

## Anchors

A model marks points for effects with nodes that carry an `fx_kind` extra, or
are named `FX_`. `useAnchor(name)` gives one:

```tsx
const muzzle = useAnchor("FX_Gun_Muzzle_R");

muzzle?.kind; // "gun_muzzle"
muzzle?.extras.rate_rpm_hint; // 2500
```

An anchor's `kind` is its `fx_kind`, or else its name after `FX_` in lower
case, its side dropped: `FX_Gun_Muzzle_R` would be a `gun_muzzle` without one.
The docs' fighter marks:

| anchor            | kind             | extras                |
| ----------------- | ---------------- | --------------------- |
| `FX_Exhaust_L/R`  | `exhaust`        |                       |
| `FX_Gun_Muzzle_R` | `gun_muzzle`     | `rate_rpm_hint: 2500` |
| `FX_Wingtip_L/R`  | `wingtip_vortex` |                       |

An engine finds its exhaust by an anchor of kind `exhaust`, or one named for
an exhaust, on its side.

## Putting things on them

`<Attach>` puts its children in a part's or an anchor's frame, so they move
with it:

```tsx
<Attach anchor="FX_Gun_Muzzle_R">
  <MuzzleFlash />
</Attach>

<Attach part="CTRL_Canopy_C">
  <Pilot />
</Attach>
```

## Clips

`rig.clips` holds every clip given as `animations`, by name, each scrubbed
rather than played. The docs' fighter has `ANIM_Gear_Retract`,
`ANIM_Nozzle_L_Open`, `ANIM_Nozzle_R_Open`, `ANIM_Canopy_Open`,
`ANIM_Bay_Open` and `ANIM_Gun_Deploy`. The gear and the engines find theirs by
name; drive the rest with `<Clip>` or by hand.

Next, [by hand](../by-hand/).
