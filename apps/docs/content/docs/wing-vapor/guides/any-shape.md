---
title: Any shape
description: "Measure the aircraft from its own geometry, in the page or at build time."
---

Rather than typing the planform in, let the package measure the model:

```tsx
const { scene } = useGLTF("/jet.glb");

<group>
  <primitive object={scene} />
  <WingVapor
    capture={scene}
    // Not the shape the air flies round
    captureFilter={(mesh) => !/Gear|Pylon|Missile/.test(mesh.name)}
    flight={flight}
    air={air}
  />
</group>;
```

## What it measures

`capture` takes six orthographic depth views of the model, from above and
below, ahead and astern, and either side, at 128 pixels along its longest
side. They're rasterised on the CPU, so they need no renderer and come out the
same everywhere: tens of milliseconds for a few hundred thousand triangles,
once. From them it measures:

- **Every station of the wing** across the span: its leading and trailing
  edges, its thickness and its mid-plane's height. A cranked delta keeps its
  crank. A tailplane or canard at the same stations is told apart from the wing
  by the clear air between them, and a fin standing on the wing by how tall it
  is.
- **Where the wing meets the body**: where the leading edge leaps forward to
  the nose, or the section gets far thicker for its chord.
- **The spanwise loading**, from a Weissinger vortex lattice on the measured
  planform.
- **A canard or a tailplane**: the second run along the chord, ahead of the
  wing or behind it. Its own tips shed their own vortices. A canard carries
  about 1.2 times its share of the area in lift, so it trails vapor in a hard
  pull. A tailplane only trims, at about 0.15 times its share, and rarely fogs.
- **The body**, as the round body of the same largest cross-section, for the
  cone.

The field reads the wing as that table, station by station, so the sheet
follows the real planform and the tip vortices leave from the real tips. The
measured planform is also fitted with straight edges into `airframe`, for the
lift and breakdown correlations. `airframe` still wins for whatever you give
it.

The aircraft's mass and how sharp its leading edge is can't be seen in depth
views, so they stay as given.

## What to leave out

Hide the landing gear and the stores, or leave them out with
`captureFilter`: they are not the shape the air flies round. Engine nacelles
and pods jutting from an edge are cut off by themselves: anything narrower than
about a seventh of the semispan that juts from an edge is not the wing the air
lifts on.

Depth views only see the outside, which is what the air sees too: an intake
duct changes nothing a cloud forms in.

## In the page, without a stall

`<WingVapor capture>` measures a few milliseconds a frame, so a big model
doesn't drop frames. Until it is done the vapor flies `airframe` as given.

Without React:

```ts
const measured = await vapor.captureAsync(model, {
  filter,
  budgetMs: 4, // per slice
  signal: abort.signal,
});
```

`capture_airframe_async` does the measuring alone. `vapor.capture` and
`capture_airframe` do it all at once.

## Ahead of time

Or measure at build time, and ship the numbers in place of the capture:

```ts
// A build script, in Node: capture_airframe needs no renderer
const baked = serialize_capture(capture_airframe(model, { filter }));
writeFileSync("jet.vapor.json", JSON.stringify(baked));
```

```tsx
// At run time
import baked from "./jet.vapor.json";

<WingVapor measured={deserialize_capture(baked)} />;
```

A bake is versioned: one from a package whose table has changed is refused,
not misread.

## On real models

Besides the docs' fighter, the capture was checked on two models it was never
tuned on: Cesium's twin turboprop and Babylon.js's aerobatic plane. The twin
measured 25.7 m across, its wing 4.2 m deep at the root and 0.8 m at the tip,
7° of sweep, the body 2.25 m out, and a tailplane 5.6 m across. Its nacelles
were what taught the capture to cut pods off. Both fly as you would expect: a
sheet over the wing in a hard pull in humid air, and no tip trails. A 900 kg
aerobatic plane at 7 g sheds a vortex a tenth as strong as the fighter's, too
weak to fog in 95 % air.

See it on [aircraft made of primitives](../../examples/any-shape/).
