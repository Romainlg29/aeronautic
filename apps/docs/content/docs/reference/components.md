---
title: Components
description: "<Afterburner>, <AfterburnerBatch>, the handle and useAfterburnerBatch."
---

## `<Afterburner>`

A group with a nozzle at its origin. The plume streams along the group's local
**+X** and follows the group every frame. It takes every `<group>` prop
(`position`, `rotation`, `scale`, children…), plus:

| prop        | type                                         | default      | what it does                                                                                             |
| ----------- | -------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `preset`    | `AfterburnerPresetName \| AfterburnerPreset` | the defaults | Which look to start from. Outside an `<AfterburnerBatch>` it also picks the batch, and so the profile.   |
| `params`    | `AfterburnerParamsInput`                     | —            | How this plume looks, over the preset. See [Params](../params/).                                         |
| `throttle`  | `number`                                     | `1.1`        | 0 to 1 is dry thrust, idle to military power; 1 to 1.1 is reheat. A rocket's burner is always lit.       |
| `batch`     | `AfterburnerBatchCore`                       | nearest      | Draw with this batch rather than the nearest one.                                                        |
| `target`    | `Object3D \| null`                           | —            | Sit on this mesh, group or bone from anywhere in the scene. `position`/`rotation` are then in its frame. |
| `direction` | `[x, y, z]`                                  | —            | Which way the exhaust streams, in the frame it sits in. Wins over `rotation`.                            |
| `ref`       | `AfterburnerHandle`                          | —            | The imperative handle, below.                                                                            |

`params` is compared field by field, so an inline object is fine. A change
rewrites only this nozzle's instance.

## `AfterburnerHandle`

What `ref` gives you. It's stable for the component's life, and safe to use
before the nozzle is in a batch.

```ts
type AfterburnerHandle = {
  throttle: number;
  set_params: (params: AfterburnerParamsInput) => void;
  update_params: (params: AfterburnerParamsInput) => void;
  set_offset: (offset: AfterburnerOffset) => void;
  set_direction: (direction: [number, number, number]) => void;
  readonly params: Readonly<AfterburnerParams> | null;
  readonly object: Group | null;
  readonly nozzle: AfterburnerNozzle | null;
  readonly batch: AfterburnerBatchCore | null;
};
```

| member          | what it does                                                               |
| --------------- | -------------------------------------------------------------------------- |
| `throttle`      | Read or write. Cheap to write every frame.                                 |
| `set_params`    | Replace the params over the preset.                                        |
| `update_params` | Merge into the current params. Rewrites this nozzle's instance.            |
| `set_offset`    | Move or turn the group: `{ position?, rotation?, direction? }`.            |
| `set_direction` | Point the exhaust, in the frame it sits in.                                |
| `params`        | The resolved params, or `null` before it is in a batch.                    |
| `object`        | The group.                                                                 |
| `nozzle`        | The core [`AfterburnerNozzle`](../core/#afterburnernozzle).                |
| `batch`         | The [`AfterburnerBatchCore`](../core/#afterburnerbatchcore) it draws with. |

A prop overrides what the handle wrote whenever that prop changes.

## `<AfterburnerBatch>`

The batch its children draw with. Without one, nozzles share a batch per scene
and preset.

| prop                  | type                                                                    | default  | what it does                                                                                                |
| --------------------- | ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `preset`              | `AfterburnerPresetName \| AfterburnerPreset`                            | —        | The profile to start from, and the look of nozzles that name none.                                          |
| `profile`             | `Partial<AfterburnerProfile>`                                           | —        | The air and camera every nozzle shares, as uniforms. Applies live. See [Profile](../profile/).              |
| `quality`             | `"low" \| "medium" \| "high" \| "ultra" \| Partial<AfterburnerQuality>` | `"high"` | Step counts are uniforms; only an octave change recompiles. See [Quality](../quality/).                     |
| `haze`                | `boolean`                                                               | `true`   | Heat haze. Compiled in only when some nozzle has `refraction_m > 0`.                                        |
| `hooks`               | `AfterburnerHooks`                                                      | —        | TSL to change the field or the pixel. A change recompiles. See [Shader hooks](../../guides/shader-hooks/).  |
| `time_scale`          | `number`                                                                | `1`      | Seconds of flame per second.                                                                                |
| `response_s`          | `number`                                                                | `0.25`   | Seconds a plume takes to follow its throttle, so a burner lights over a moment. `0` follows at once.        |
| `detail_distance_m`   | `number`                                                                | `900`    | Past this, eddies are dropped.                                                                              |
| `cheap_distance_m`    | `number`                                                                | `3000`   | Past this, a plume is a single sample.                                                                      |
| `min_screen_fraction` | `number`                                                                | `0.001`  | Plumes smaller than this share of the screen height are not drawn.                                          |
| `pass`                | `AfterburnerPass`                                                       | —        | Draw the plumes in their own pass. A change rebuilds. See [Half resolution](../../guides/half-resolution/). |
| `ref`                 | `AfterburnerBatchCore`                                                  | —        | The batch itself.                                                                                           |

## `useAfterburnerBatch()`

Returns the nearest `<AfterburnerBatch>`'s `AfterburnerBatchCore` from inside
one, or `null` outside.

```tsx
const Overlay = () => {
  const batch = useAfterburnerBatch();
  useFrame(() => console.log(batch?.stats()));
  return null;
};
```
