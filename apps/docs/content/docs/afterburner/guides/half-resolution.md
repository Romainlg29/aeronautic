---
title: Half resolution
description: "Draw the plumes in their own pass at a share of the frame, depth-aware."
---

A raymarch costs per pixel, and a plume is soft enough to lose little at half
the resolution. `@aeronautic/core`'s `volume_pass` draws the plumes, and any
wing's vapor with them, in a pass of their own at a share of the frame, then
lays them back over the full-resolution scene.

The upsample is **weighted by depth**: a low-resolution texel only lends its
plume to pixels whose scene is at about the same depth. A nozzle's edge, or a
wing in front of the flame, stays sharp.

Close up and astern of a fighter, it takes the worst case from **6.8 ms to 2.7 ms**.

## With React

Make the pass from the R3F scene and camera. Use its `output` in place of your
scene pass, and put it in a `VolumePassContext` round the plumes:

```tsx
import { useFrame, useThree } from "@react-three/fiber";
import { volume_pass } from "@aeronautic/core";
import { VolumePassContext } from "@aeronautic/core/react";
import { Afterburner } from "@aeronautic/afterburner/react";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";

const Scene = () => {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;

  const split = useMemo(() => volume_pass(scene, camera), [scene, camera]);

  const pipeline = useMemo(() => {
    const pipeline = new RenderPipeline(renderer);

    // split.output is the scene with the plumes on it: bloom it, grade it…
    pipeline.outputNode = split.output.add(bloom(split.output, 0.45, 0.2, 1));

    return pipeline;
  }, [renderer, split]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);
  useFrame(() => pipeline.render(), 1);

  return (
    <VolumePassContext value={split}>
      <Afterburner />
    </VolumePassContext>
  );
};
```

Every `<Afterburner>` and `<AfterburnerBatch>` inside the context draws in the
pass. A batch also takes it as `pass={split}`, or `pass={null}` to draw in the
main scene at full resolution. Changing a batch's pass rebuilds it.

The pass, its options and what it returns are on
[Volumes at half resolution](../../../core/guides/volumes/).

## `afterburner_pass`

`afterburner_pass(scene, camera, options?)` from `@aeronautic/afterburner` is
the same pass, with its volumes' target also named `plumePass`. It takes the
same options and goes wherever a `volume_pass` does.

## Without React

Give the core batch the backdrop, and add its mesh to the pass's scene rather
than yours:

```ts
const split = volume_pass(scene, camera);

const batch = new AfterburnerBatch({
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
