---
title: Half resolution
description: "Draw the plumes in their own pass at a share of the frame, depth-aware."
---

A raymarch costs per pixel, and a plume is soft enough to lose little at half
the resolution. `afterburner_pass` draws the plumes in a pass of their own at
a share of the frame, then lays them back over the full-resolution scene.

The upsample is **weighted by depth**: a low-resolution texel only lends its
plume to pixels whose scene is at about the same depth. A nozzle's edge, or a
wing in front of the flame, stays sharp.

Close up and astern of a fighter, it takes the worst case from **6.8 ms to 2.7 ms**.

## With React

Make the pass from the R3F scene and camera. Use its `output` in place of your
scene pass, and hand the pass to the batch:

```tsx
import { useFrame, useThree } from "@react-three/fiber";
import {
  Afterburner,
  AfterburnerBatch,
  afterburner_pass,
} from "r3f-afterburner";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";

const Scene = () => {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;

  const split = useMemo(
    () => afterburner_pass(scene, camera, { resolution_scale: 0.5 }),
    [scene, camera],
  );

  const pipeline = useMemo(() => {
    const pipeline = new RenderPipeline(renderer);

    // split.output is the scene with the plumes on it: bloom it, grade it…
    pipeline.outputNode = split.output.add(bloom(split.output, 0.45, 0.2, 1));

    return pipeline;
  }, [renderer, split]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);
  useFrame(() => pipeline.render(), 1);

  return (
    <AfterburnerBatch preset="afterburner" pass={split}>
      <Afterburner />
    </AfterburnerBatch>
  );
};
```

The plumes must be in an `<AfterburnerBatch pass={split}>`. A nozzle outside
one draws in the main scene as usual, at full resolution.

## Options

| option             | default | what it is                                                                    |
| ------------------ | ------- | ----------------------------------------------------------------------------- |
| `resolution_scale` | `0.5`   | The plumes' resolution against the frame's. `0.5` is a quarter of the pixels. |

## What it returns

| field        | what it is                                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| `output`     | The scene with the plumes composited, at full resolution. Your pipeline's input. |
| `scene`      | The plumes' own scene. A batch given the pass puts its mesh here.                |
| `backdrop`   | The opaque scene's colour and depth, for the plume material to read.             |
| `scene_pass` | The opaque scene at full resolution, without plumes.                             |
| `plume_pass` | The plumes alone, premultiplied, at the reduced resolution.                      |

Changing `pass` on a batch rebuilds it.

## Without React

Give the core batch the backdrop, and add its mesh to the pass's scene rather
than yours:

```ts
const split = afterburner_pass(scene, camera, { resolution_scale: 0.5 });

const batch = new AfterburnerBatchCore({
  preset: "afterburner",
  backdrop: split.backdrop,
});

split.scene.add(batch.mesh);

pipeline.outputNode = split.output;
```

## When not to use it

- A plume that only covers a few pixels gains little. The far tier is already
  one sample.
- If you already render the whole frame at a reduced resolution, there is
  nothing to win.
