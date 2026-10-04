---
title: Without React
description: "Make, write, track and read a Flight in plain three.js."
---

`Flight` is a plain class, with nothing of React in it. Hand it to each effect
as its `source`:

```ts
import { Flight } from "@aeronautic/core";
import { AfterburnerBatch } from "@aeronautic/afterburner";
import { WingVapor } from "@aeronautic/wing-vapor";
import { ControlRig, fighter_controls } from "@aeronautic/controls";

const flight = new Flight({ airspeedMPerS: 220, altitudeM: 4000 });

const batch = new AfterburnerBatch({ source: flight });
const vapor = new WingVapor({ airframe, source: flight });
const rig = new ControlRig(gltf.scene, {
  animations: gltf.animations,
  source: flight,
});

fighter_controls(rig);
```

## Each frame

Write it, or track the aircraft, then move what reads it:

```ts
renderer.setAnimationLoop(() => {
  const delta_s = clock.getDelta();

  // From a flight model, or from how the model moved, or both
  flight.set({ throttle: input.throttle, pitch: input.stick_y });
  flight.track(jet, delta_s, { seaLevelY: 0 });

  rig.update(delta_s);
  renderer.render(scene, camera);
});
```

The batch and the vapor read the flight where they draw, only when its
`version` moved. The rig reads it in `update`.

## Hearing writes

`subscribe` calls back after every write that changed something, and returns
what stops it:

```ts
const stop = flight.subscribe(() => {
  hud.textContent = `M ${flight.values.mach.toFixed(2)}`;
});
```

That is every frame for a flight written every frame. Throttle it yourself, or
read `flight.values` in your own loop instead.

## The atmosphere alone

The air needs no flight at all:

```ts
import { moist_air, standard_atmosphere } from "@aeronautic/core";

standard_atmosphere(11_000).temperatureK; // 216.65
moist_air(3000, 0.8, 10).dewPointK;
```

See [The atmosphere](../../reference/atmosphere/).
