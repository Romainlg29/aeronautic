---
title: Scene
description: "volume_pass, and what every effect reads of the scene: its depth, its colour and its fog."
---

```ts
import {
  create_scene_fog,
  fog_factor,
  scene_color,
  scene_depth,
  scene_fog_factor,
  scene_view_z,
  volume_pass,
  write_scene_fog,
} from "@aeronautic/core";
```

## `volume_pass(scene, camera, options?)`

Draws the effects' volumes in a pass of their own, at a share of the frame,
and composites them depth-aware. See
[Volumes at half resolution](../../guides/volumes/).

| option            | default | what it is                                   |
| ----------------- | ------- | -------------------------------------------- |
| `resolutionScale` | `0.5`   | The volumes' resolution against the frame's. |

It returns a `VolumePass`: `{ output, scene, backdrop, scenePass, volumePass }`.
`backdrop` is a `SceneBackdrop`, `{ color, depth }`: the texture nodes an
effect built in the pass reads the opaque scene from.

## The frame's depth and colour

An effect drawn in the scene itself reads what is behind it from copies of the
frame. Three copies a viewport texture once a render for each node made of it,
so every effect reads the same two nodes, and a frame is copied once however
many effects are in it.

| export                 | what it is                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene_depth()`        | The opaque scene's depth, one `viewportDepthTexture` every effect shares.                                                                                  |
| `scene_color()`        | Its colour, one `viewportTexture` every effect samples with `.sample(uv)`. Not three's `viewportSharedTexture`, which copies the frame once for each read. |
| `scene_view_z(depth?)` | View space depth of the opaque scene at the pixel, negative. Reads `scene_depth()` unless given a pass's sampled depth.                                    |

## Fog

Three fogs a surface at its own depth. A volume's light comes from all along
its ray, so it fogs each sample itself, from uniforms holding the scene's fog.

| export                                 | what it is                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `create_scene_fog()`                   | Fresh `SceneFogUniforms`: `{ kind, color, near, far, density }`, with no fog.          |
| `write_scene_fog(uniforms, scene)`     | Write a scene's `Fog` or `FogExp2` into them. Call it before each render.              |
| `scene_fog_factor(uniforms, depth)`    | TSL: how much of the light from a view depth the fog replaces, 0 to 1, as three's own. |
| `fog_factor(fog, depth)`               | The same on the CPU.                                                                   |
| `SCENE_FOG_NONE`, `_RANGE`, `_DENSITY` | The values of `kind`.                                                                  |
