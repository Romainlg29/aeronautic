---
title: Without React
description: "A ControlRig, its drives and its engines in plain three.js."
---

Everything the components do is a `ControlRig` underneath.

```ts
import { Flight } from "@aeronautic/core";
import { ControlRig, fighter_controls } from "@aeronautic/controls";

const flight = new Flight({ gear: 1 });
const rig = new ControlRig(gltf.scene, {
  animations: gltf.animations,
  source: flight,
});

const controls = fighter_controls(rig);

renderer.setAnimationLoop(() => {
  const delta_s = clock.getDelta();

  flight.set({ pitch: input.stick_y, roll: input.stick_x });
  rig.update(delta_s);
  renderer.render(scene, camera);
});
```

`fighter_controls` is `<FighterControls>`: every part, and an engine for each
side with a nozzle, in `controls.engines`. `controls.dispose()` takes them all
away.

## Parts one by one

Each part is a function of the rig and its options, returning a drive:

```ts
import {
  cockpit,
  elevons,
  gear,
  rudders,
  add_engine,
} from "@aeronautic/controls";

elevons(rig, { pitchShare: 0.7 });
rudders(rig);
gear(rig);
cockpit(rig);

const left = add_engine(rig, { side: "left" });
```

A drive has the `parts` it claimed, `refresh()` to read its options again
after changing them, and `dispose()`.

## A drive of your own

```ts
const probe = rig.drive({
  parts: ["CTRL_Probe"],
  from: (flight, part) => flight.gear * part.max,
  rate: 20,
});

const bay = rig.driveClip({
  clip: "ANIM_Bay_Open",
  from: (flight) => (flight.airbrake > 0.5 ? 1 : 0),
});
```

## The afterburner on an engine

Without React there is no context to carry an engine's thrust, so hand it over:
`engine.anchor` is where the exhaust leaves, and `engine.throttle` reads the
engine's throttle from the flight.

```ts
import { AfterburnerBatch } from "@aeronautic/afterburner";

const batch = new AfterburnerBatch({
  preset: "afterburner",
  source: flight,
});
scene.add(batch.mesh);

batch.add({
  object: left.anchor ?? undefined,
  offset: { direction: [0, 0, -1] },
  throttleFrom: left.throttle,
});
```

The nozzle follows the anchor, so it turns with the gimbal. With `source`
set, the batch also reads the flight's altitude, airspeed and temperature
offset.

## Each frame

`rig.update(delta_s)` reads the flight only when its version moved, then moves
every part toward its target. Call it once a frame, after the flight is
written. `rig.dispose()` stops its clips; the parts stay where they are.
