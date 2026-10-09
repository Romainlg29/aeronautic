---
title: Without React
description: "The plain three.js class."
---

`Countermeasures` from `@aeronautic/countermeasures` is what the component
wraps. Add its `group` to the aircraft:

```ts
import { Countermeasures } from "@aeronautic/countermeasures";

const countermeasures = new Countermeasures({
  airframe: { dispensers: [{ at: [-1, -0.57, 5] }, { at: [1, -0.57, 5] }] },
  flight: { airspeedMPerS: 250 },
});

aircraft.add(countermeasures.group);

countermeasures.fire();

// Whenever they change
countermeasures.updateFlight({ airspeedMPerS: 180 });
countermeasures.updateLook({ exposure: 1 / 300 });

// When done
countermeasures.dispose();
```

The clock, and the flares' flight with it, runs once a frame, when their
glare is drawn. It needs three's `WebGPURenderer`. `timeScale` slows or
speeds it.

Every `update*` method changes some fields and keeps the rest, and does
nothing if they are what they were. `updateAirframe` and `setQuality`
rebuild the dispensers and the lights; the others only write numbers.

`burning` and `pending` count the flares out and still to come, and
`burnTimeS` is how long one burns.
