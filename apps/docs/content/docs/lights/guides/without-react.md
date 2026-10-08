---
title: Without React
description: "The plain three.js class."
---

`Lights` from `@aeronautic/lights` is what the component wraps. Add its
`group` to the aircraft and its `volumes` to the scene:

```ts
import { Lights } from "@aeronautic/lights";

const lights = new Lights({
  airframe: {
    navigation: [{ side: "left", at: [-6.8, -0.27, 4.46] }],
    beams: [{ at: [0, -1.3, -6.2], lamp: "taxi" }],
  },
  air: { visibilityM: 4000 },
});

aircraft.add(lights.group);
scene.add(lights.volumes);

// Every frame, or whenever they change
lights.setGear(gear);
lights.updateSwitches({ landing: true });

// When done
lights.dispose();
```

The clock, and everything that follows it, runs once a frame from the first
of its meshes drawn. It needs three's `WebGPURenderer`.

Every `update*` method changes some fields and keeps the rest, and does
nothing if they are what they were. `updateAirframe`, `updateIlluminate` and
`setQuality` rebuild the lights; the others only write numbers.

## A volume pass

With core's `volume_pass`, give its `backdrop`, and put the volumes in its
scene:

```ts
const lights = new Lights({ ...options, backdrop: pass.backdrop });

pass.scene.add(lights.volumes);
```
