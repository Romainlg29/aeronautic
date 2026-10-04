---
title: Without React
description: "AfterburnerBatch and AfterburnerNozzle, the plain three.js classes underneath."
---

The components are a thin layer over two plain three.js classes. Use them
directly in a vanilla three.js app, or in R3F when you want full control.

## A batch and its nozzles

```ts
import { AfterburnerBatch } from "@aeronautic/afterburner";
import { WebGPURenderer } from "three/webgpu";

const renderer = new WebGPURenderer({ antialias: false });
await renderer.init();

const batch = new AfterburnerBatch({ preset: "rocket_kerolox" });
scene.add(batch.mesh);

const nozzle = batch.add({
  object: engine_bell, // any Object3D: it follows its world matrix
  params: { nozzleRadiusM: 1.2 },
});

nozzle.throttle = 1.05; // the burner part-way in
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

tail.setOffset({ position: [0, 0.1, -4.2] });
tail.setDirection([0, -0.1, -1]);

// Follow something else; attach(null) stops following and holds still
tail.attach(other_engine);
tail.attach(null);

// Or no object at all: write the world matrix
const free = batch.add({ matrix: new Matrix4().makeTranslation(0, 10, 0) });
free.matrix.makeTranslation(0, 12, 0);
```

`worldMatrix(target?)` returns where the nozzle is drawn, offset included.

## Changing the look and the air

```ts
tail.updateParams({ exitMach: 1.6 }); // merge
tail.setParams({ sootPerM: 2 }, "rocket_kerolox"); // replace, over a preset

batch.updateProfile({ altitudeM: 9000 }); // merge
batch.setProfile({ altitudeM: 0 }); // replace, over the batch's preset
batch.setQuality("medium");
batch.setHaze(false);
batch.setHooks(my_hooks);

batch.timeScale = 0.5;
batch.detailDistanceM = 600;
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
  resolve_afterburner_params,
  resolve_afterburner_profile,
} from "@aeronautic/afterburner";
import { atmosphere, jet_state } from "@aeronautic/afterburner/physics";

const params = resolve_afterburner_params({}, "afterburner");
const profile = resolve_afterburner_profile({ altitudeM: 9000 });

atmosphere(profile); // { temperatureK, pressure, density, soundMPerS, ram }
const jet = jet_state(params, 1, profile);
jet.coreLengthM; // and velocityMPerS, shockSpacingM, sootFormed…
```
