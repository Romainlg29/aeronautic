---
title: Without React
description: "WingVapor, the plain three.js class underneath."
---

`<WingVapor>` is a thin layer over the `WingVapor` class from the package root. Without React, make one,
add its mesh to the scene and point it at the object it follows:

```ts
import { WingVapor } from "@aeronautic/wing-vapor";

const vapor = new WingVapor({
  object: jet, // the model, or any node of it
  frame: { forward: [0, 0, -1], up: [0, 1, 0] },
  airframe: { spanM: 14, massKg: 20_000 },
  air: { altitudeM: 300, relativeHumidity: 0.9 },
  look: { sunDirection: [5, 10, 5] },
});

scene.add(vapor.mesh);

// Every frame
vapor.updateFlight({ airspeedMPerS: 240, angleOfAttackRad: 0.2 });
```

The mesh is placed in world space by hand, wherever it is parented, and
updates itself in its `onBeforeRender`: where the aircraft and the camera are
is all it works out per frame. Everything else is worked out when a dial
changes.

Measure the model from its geometry rather than typing the planform in:

```ts
await vapor.captureAsync(jet, { filter: (mesh) => !/Gear/.test(mesh.name) });
```

And free it when you are done:

```ts
vapor.dispose();
```

Every method is in the [reference](../../reference/core/).
