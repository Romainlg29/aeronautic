---
title: Core classes
description: "AfterburnerBatchCore and AfterburnerNozzle, the plain three.js API."
---

The plain three.js classes the components wrap. See
[Without React](../../guides/without-react/) for a walkthrough.

## `AfterburnerBatchCore`

```ts
new AfterburnerBatchCore(options?: AfterburnerBatchOptions)
```

### Options

| option       | type                                         | what it is                                                                |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| `preset`     | `AfterburnerPresetName \| AfterburnerPreset` | Which look nozzles start from, and the profile it brings.                 |
| `profile`    | `Partial<AfterburnerProfile>`                | Over the preset's.                                                        |
| `quality`    | `AfterburnerQualityInput`                    | What a frame may spend.                                                   |
| `haze`       | `boolean`                                    | Whether to bend what is behind the plumes.                                |
| `hooks`      | `AfterburnerHooks`                           | TSL to change the plume.                                                  |
| `capacity`   | `number`                                     | How many nozzles to make room for up front. It grows past this.           |
| `response_s` | `number`                                     | Seconds a plume takes to follow its throttle. Default 0.25; 0 is at once. |
| `backdrop`   | `AfterburnerBackdrop`                        | From `afterburner_pass`. Fixed for the batch's life.                      |

### Members

| member                    | what it does                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| `mesh`                    | The one instanced mesh. Add it to your scene.                     |
| `add(options?)`           | Add a nozzle. Returns an `AfterburnerNozzle`.                     |
| `remove(nozzle)`          | Take a nozzle out.                                                |
| `nozzles`                 | Every nozzle, read-only.                                          |
| `profile`                 | The resolved profile, read-only.                                  |
| `set_profile(partial?)`   | Replace the profile, over the batch's preset.                     |
| `update_profile(partial)` | Merge into the current profile. Uniforms only: cheap every frame. |
| `quality`                 | The resolved quality, read-only.                                  |
| `set_quality(input?)`     | Change it. Only an octave change recompiles.                      |
| `set_haze(boolean)`       | Turn the haze on or off. Recompiles.                              |
| `set_hooks(hooks?)`       | Change the hooks. Recompiles.                                     |
| `time_scale`              | Seconds of flame per second.                                      |
| `response_s`              | Seconds a plume takes to follow its throttle. Default 0.25.       |
| `detail_distance_m`       | Past this, eddies are dropped. Default 900.                       |
| `cheap_distance_m`        | Past this, one sample. Default 3000.                              |
| `min_screen_fraction`     | Smaller plumes are culled. Default 0.001.                         |
| `uniforms`                | The material's uniforms, for sharing with a material of your own. |
| `preset`                  | The preset it was made with.                                      |
| `stats()`                 | `{ nozzles, near, mid, far, culled }`, as of the last frame.      |
| `dispose()`               | Free the geometry and materials.                                  |

The batch updates in its mesh's `onBeforeRender`, once a frame however many
cameras draw it.

## `AfterburnerNozzle`

Made by `batch.add(options)`.

### Options

| option     | type                                         | what it is                                                  |
| ---------- | -------------------------------------------- | ----------------------------------------------------------- |
| `object`   | `Object3D`                                   | Follow this object's world matrix: any mesh, group or bone. |
| `matrix`   | `Matrix4`                                    | Or a world matrix, for a nozzle with no object.             |
| `offset`   | `AfterburnerOffset`                          | Where on the object (or the matrix) it sits.                |
| `params`   | `AfterburnerParamsInput`                     | The engine.                                                 |
| `preset`   | `AfterburnerPresetName \| AfterburnerPreset` | Which look to start from. Defaults to the batch's.          |
| `throttle` | `number`                                     | 0 to 1 dry, to 1.1 with reheat.                             |

### Members

| member                         | what it does                                                        |
| ------------------------------ | ------------------------------------------------------------------- |
| `throttle`                     | Read or write. The plume eases toward it over `response_s`.         |
| `drawn_throttle`               | The throttle it is drawn at right now, read-only.                   |
| `params`                       | The resolved params, read-only.                                     |
| `set_params(params?, preset?)` | Replace the params.                                                 |
| `update_params(partial)`       | Merge into them.                                                    |
| `object`                       | What it follows, or `null`.                                         |
| `matrix`                       | The world matrix used when there's no object.                       |
| `position`, `quaternion`       | The offset in the followed frame. Write them, or use `set_offset`.  |
| `attach(object, offset?)`      | Follow another object. `attach(null)` holds the current world pose. |
| `set_offset(offset)`           | Change the offset. Fields left out are kept.                        |
| `set_direction([x, y, z])`     | Point the exhaust.                                                  |
| `world_matrix(target?)`        | Where it is drawn, offset included.                                 |
| `remove()`                     | Take it out of its batch.                                           |

## `AfterburnerOffset`

```ts
type AfterburnerOffset = {
  position?: { x; y; z } | [x, y, z];
  rotation?: Euler | Quaternion | [x, y, z] | [x, y, z, w];
  direction?: { x; y; z } | [x, y, z]; // wins over rotation
};
```
