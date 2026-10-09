---
title: The airframe
description: "Where the lights go, which way the lamps point, and the gear."
---

`airframe` has three lists. Each light's `at` is a position in the group's
frame, in metres, or a node of the model, read every frame.

## Position lights

```ts
navigation: [
  { side: "left", at: nodes.Nav_L }, // red
  { side: "right", at: nodes.Nav_R }, // green
  { side: "aft", at: nodes.Nav_Tail }, // white
];
```

The side decides the arc and the colour, as the rule has them: the left light
covers dead ahead to 110° left, the right one the same to the right, the aft
one the 140° astern. A light's intensity is worked out in the aircraft's
axes, from `forward` and `up`, not its node's, so the node can be turned any
way.

## Anti-collision lights

```ts
anticollision: [
  { at: nodes.Strobe_Top, color: "white" },
  { at: nodes.Beacon_Belly, color: "red", phaseS: 0.5 },
];
```

`phaseS` staggers a light's flashes: the seconds into the cycle its flash
begins. The rate, the effective intensity and the flash's shape are the
[`anticollision` dials](../../reference/dials/), shared by every light.

## Landing and taxi lights

```ts
beams: [
  { at: nodes.Landing, lamp: "landing", onGear: true },
  { at: [0, -1.3, -6.2], lamp: "taxi", direction: [0, -0.05, -1] },
];
```

| lamp      | peak       | spread (h × v) | what it is                     |
| --------- | ---------- | -------------- | ------------------------------ |
| `landing` | 600 000 cd | 11° × 12°      | A 600 W PAR-64 sealed beam.    |
| `taxi`    | 75 000 cd  | 50° × 10°      | A 250 W PAR-46: wide and flat. |

Or give the numbers: `{ peakCd, spreadDeg: [h, v], temperatureK }`. The
spread is taken as the full angle to a tenth of the peak, the way lamp
catalogues give it.

A lamp on a node points along the node's -Z, unless `direction` gives
another, in the node's frame. A lamp at a position points forward, unless
`direction` gives another, in the group's frame. Its pattern is laid level
with the wings.

`switch` puts a lamp on the `landing` or the `taxi` switch: by default the one
its lamp is named for. `onGear` holds it off until the gear is fully down.

## The model's lenses

The glare is each light from its candelas, the light's own disc its lens, so
a model whose lenses glow counts the light twice. Their glow is the model's
number, not the light's: the docs' fighter gives its nav lenses 8 in the
scene's units, some 600 000 cd/m² under takram's atmosphere, where a 40 cd
light through its 6 cm lens is about 14 000 cd/m². A lens a few pixels
across, that much brighter than the glare, is drawn or missed by where it
falls between the pixels, and a bloom turns that into a halo blinking as the
camera turns. Take the glow off the lenses of the lights `<Lights>` draws:
set their materials' `emissiveIntensity` to 0.
