---
title: Volumes at half resolution
description: "Draw every plume and every wing's vapor in one pass at a share of the frame, depth-aware."
---

The afterburner's plumes and the wing's vapor are raymarched: each costs per
pixel it covers, and each is soft enough to lose little at half the
resolution. `volume_pass` draws them all in a pass of their own, at a share of
the frame, and lays them back over the full-resolution scene.

The opaque scene is drawn first. The volumes are then drawn alone into the
smaller target, reading the scene's depth to stop at what is in front of them
and its colour to see through. Every volume of the aeronautic effects blends
premultiplied, so any number of them share the one target. The upsample is
**weighted by depth**: a low-resolution texel only lends its volume to pixels
whose scene is at about the same depth, so a canopy or a nozzle in front of a
flame keeps its edge.

Drawn this way, the [On a model](../../../afterburner/tutorial/on-a-model/) page at
2560×1440, the effects went from 0.59 ms to 0.15 ms of GPU a frame.

## With React

Make the pass from the R3F scene and camera, use its `output` as the render
pipeline's, and put it in a `VolumePassContext` round the effects. Every
`<Afterburner>`, `<AfterburnerBatch>` and `<WingVapor>` inside draws in it:

```tsx
import { useFrame, useThree } from "@react-three/fiber";
import { volume_pass } from "@aeronautic/core";
import { VolumePassContext } from "@aeronautic/core/react";
import { type FC, type ReactNode, useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";

const Volumes: FC<{ children?: ReactNode }> = ({ children }) => {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;

  const split = useMemo(() => volume_pass(scene, camera), [scene, camera]);

  const pipeline = useMemo(() => {
    const pipeline = new RenderPipeline(renderer);

    // split.output is the scene with the volumes on it: bloom it, grade it…
    pipeline.outputNode = split.output.add(bloom(split.output, 0.3, 0.2, 1));

    return pipeline;
  }, [renderer, split]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);
  useFrame(() => pipeline.render(), 1);

  return <VolumePassContext value={split}>{children}</VolumePassContext>;
};

<Canvas gl={webgpu_gl()}>
  <Volumes>
    <Jet />
  </Volumes>
</Canvas>;
```

`<AfterburnerBatch>` and `<WingVapor>` take a `pass` prop too. Left out, it is
the nearest `VolumePassContext`'s; give them another pass, or `null` to draw in
the main scene at full resolution. A lone `<Afterburner>` follows the context.
`useVolumePass()` reads the nearest one, or null.

Changing the pass an effect draws in rebuilds it.

Anything that walks the scene to set up its meshes, a light rig say, should
walk `split.scene` as well: the effects' meshes are there, not in yours.

## Options

| option            | default | what it is                                                                     |
| ----------------- | ------- | ------------------------------------------------------------------------------ |
| `resolutionScale` | `0.5`   | The volumes' resolution against the frame's. `0.5` is a quarter of the pixels. |
| `backdropNode`    | none    | What the opaque scene becomes before the volumes go over it. See below.        |

## What it returns

| field        | what it is                                                                        |
| ------------ | --------------------------------------------------------------------------------- |
| `output`     | The scene with the volumes composited, at full resolution. Your pipeline's input. |
| `scene`      | The volumes' own scene. Cleared to transparent black, and fogged as yours is.     |
| `backdrop`   | The opaque scene's `color`, as `backdropNode` made it, and its `depth`.           |
| `scenePass`  | The opaque scene at full resolution, without the volumes.                         |
| `volumePass` | The volumes alone, premultiplied, at the reduced resolution.                      |

## Without React

Build each effect with the pass's backdrop, and add its mesh to the pass's
scene rather than yours:

```ts
import { volume_pass } from "@aeronautic/core";
import { AfterburnerBatch } from "@aeronautic/afterburner";
import { WingVapor } from "@aeronautic/wing-vapor";

const split = volume_pass(scene, camera);

const plumes = new AfterburnerBatch({
  preset: "afterburner",
  backdrop: split.backdrop,
});
const vapor = new WingVapor({ object: jet, backdrop: split.backdrop });

split.scene.add(plumes.mesh, vapor.mesh);

pipeline.outputNode = split.output;
```

## Fog

A volume's light comes from all along its ray, so three's fog, which fogs a
surface at its own depth, cannot fog it. The plumes and the vapor read the
scene's `Fog` or `FogExp2` themselves and fog each sample at its own depth,
in a volume pass or out of one. The pass's scene takes your scene's fog every
frame.

## Grading the scene under the volumes

`backdropNode` takes the opaque scene's colour and depth and returns what
it should become before the volumes are laid over it: an atmosphere's
aerial perspective, say, which also draws the sky wherever nothing was
drawn.

```ts
const split = volume_pass(scene, camera, {
  backdropNode: ({ color, depth }) => aerialPerspective(color, depth),
});
```

Grading the composited frame instead goes wrong in two ways. A sky drawn
where the depth is clear would be drawn over every plume and every wisp of
vapor in front of it, since they write no depth. And a plume's heat haze
refracts what is behind it, which should be the graded scene, not the raw
one. With `backdropNode` the grade is drawn once a frame to a texture of
its own; the volumes read it as their backdrop and are composited over it.
See [takram's atmosphere](/docs/core/integrations/takram-atmosphere).

## When not to use it

- Volumes that only cover a few pixels gain little.
- If you already render the whole frame at a reduced resolution, there is
  nothing to win.
- The dither's grain becomes two pixels wide. Bloom hides it; a frame with
  none may show it.
