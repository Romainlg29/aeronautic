---
title: Without React
description: "WingVaporCore, the plain three.js class underneath."
---

`<WingVapor>` is a thin layer over `WingVaporCore`. Without React, make one,
add its mesh to the scene and point it at the object it follows:

```ts
import { WingVaporCore } from "@aeronautic/wing-vapor";

const vapor = new WingVaporCore({
  object: jet, // the model, or any node of it
  frame: { forward: [0, 0, -1], up: [0, 1, 0] },
  airframe: { span_m: 14, mass_kg: 20_000 },
  air: { altitude_m: 300, relative_humidity: 0.9 },
  look: { sun_direction: [5, 10, 5] },
});

scene.add(vapor.mesh);

// Every frame
vapor.update_flight({ airspeed_m_s: 240, angle_of_attack_rad: 0.2 });
```

The mesh is placed in world space by hand, wherever it is parented, and
updates itself in its `onBeforeRender`: where the aircraft and the camera are
is all it works out per frame. Everything else is worked out when a dial
changes.

Measure the model from its geometry rather than typing the planform in:

```ts
await vapor.capture_async(jet, { filter: (mesh) => !/Gear/.test(mesh.name) });
```

And free it when you are done:

```ts
vapor.dispose();
```

Every method is in the [reference](../../reference/core/).
