---
title: Without React
description: "AfterburnerBatchCore and AfterburnerNozzle, the plain three.js classes underneath."
---

The components are a thin layer over two plain three.js classes. Use them
directly in a vanilla three.js app, or in R3F when you want full control.

## A batch and its nozzles

```ts
import { AfterburnerBatchCore } from "r3f-afterburner";
import { WebGPURenderer } from "three/webgpu";

const renderer = new WebGPURenderer({ antialias: false });
await renderer.init();

const batch = new AfterburnerBatchCore({ preset: "rocket_kerolox" });
scene.add(batch.mesh);

const nozzle = batch.add({
  object: engine_bell, // any Object3D: it follows its world matrix
  params: { nozzle_radius_m: 1.2 },
});

nozzle.throttle = 0.9;
```

The batch updates itself in its mesh's `onBeforeRender`, once a frame however
many cameras draw it. You don't call anything per frame.

## Placing a nozzle

A nozzle follows its `object`'s world matrix at an optional offset in that
object's frame, or a `matrix` you write yourself:

```ts
// On a mesh, wherever it is, at an offset in its frame
const tail = batch.add({
  object: engine_node,
  offset: { position: [0, 0, -4.2], direction: [0, 0, -1] },
});

tail.set_offset({ position: [0, 0.1, -4.2] });
tail.set_direction([0, -0.1, -1]);

// Follow something else; attach(null) stops following and holds still
tail.attach(other_engine);
tail.attach(null);

// Or no object at all: write the world matrix
const free = batch.add({ matrix: new Matrix4().makeTranslation(0, 10, 0) });
free.matrix.makeTranslation(0, 12, 0);
```

`world_matrix(target?)` returns where the nozzle is drawn, offset included.

## Changing the look and the air

```ts
tail.update_params({ exit_mach: 1.6 }); // merge
tail.set_params({ soot_per_m: 2 }, "rocket_kerolox"); // replace, over a preset

batch.update_profile({ altitude_m: 9000 }); // merge
batch.set_profile({ altitude_m: 0 }); // replace, over the batch's preset
batch.set_quality("medium");
batch.set_haze(false);
batch.set_hooks(my_hooks);

batch.time_scale = 0.5;
batch.detail_distance_m = 600;
```

## Removing and cleaning up

```ts
tail.remove(); // or batch.remove(tail)
batch.dispose(); // geometry and materials; take batch.mesh out of the scene too
```

## Reading it back

```ts
batch.stats(); // { nozzles, near, mid, far, culled }
batch.nozzles; // every nozzle
batch.profile; // the resolved profile
batch.quality; // the resolved quality
tail.params; // the resolved params
```

The full list is in the [core reference](../../reference/core/).

## Working the physics out yourself

The plume's jet is computed on the CPU too, for gameplay or UI:

```ts
import {
  atmosphere,
  jet_state,
  resolve_afterburner_params,
  resolve_afterburner_profile,
} from "r3f-afterburner";

const params = resolve_afterburner_params({}, "afterburner");
const profile = resolve_afterburner_profile({ altitude_m: 9000 });

atmosphere(profile); // { temperature_k, pressure, density, sound_m_s, ram }
const jet = jet_state(params, 1, profile);
jet.core_length_m; // and velocity_m_s, shock_spacing_m, reach_m, soot_formed…
```
