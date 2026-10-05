---
title: Components
description: "<Afterburner>, <AfterburnerBatch>, the handle and useAfterburnerBatch."
---

## `<Afterburner>`

A group with a nozzle at its origin. The plume streams along the group's local
**+Z**, aft of a model that flies along -Z, and follows the group every frame. It takes every `<group>` prop
(`position`, `rotation`, `scale`, children…), plus:

| prop        | type                                         | default              | what it does                                                                                                                                                                            |
| ----------- | -------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preset`    | `AfterburnerPresetName \| AfterburnerPreset` | the defaults         | Which look to start from. Outside an `<AfterburnerBatch>` it also picks the batch, and so the profile.                                                                                  |
| `params`    | `AfterburnerParamsInput`                     | —                    | How this plume looks, over the preset. See [Params](../params/).                                                                                                                        |
| `throttle`  | `number \| (flight) => number`               | see below            | 0 to 1 is dry thrust, idle to military power; 1 to 1.1 is reheat. A function reads it from the flight, only when the flight changes.                                                    |
| `source`    | `Flight \| null`                             | nearest provider     | The flight its batch flies with, outside an `<AfterburnerBatch>`. `null` flies only the props.                                                                                          |
| `batch`     | `AfterburnerBatchHandle`                     | nearest              | Draw with this batch rather than the nearest one.                                                                                                                                       |
| `target`    | `Object3D \| null`                           | the engine's exhaust | Sit on this mesh, group or bone from anywhere in the scene. `position`/`rotation` are then in its frame. Inside an `<Engine>`, its exhaust anchor; `null` sits where it is in the tree. |
| `direction` | `[x, y, z]`                                  | —                    | Which way the exhaust streams, in the frame it sits in. Wins over `rotation`.                                                                                                           |
| `ref`       | `AfterburnerHandle`                          | —                    | The imperative handle, below.                                                                                                                                                           |

`params` is compared field by field, so an inline object is fine. A change
rewrites only this nozzle's instance.

Left out, `throttle` is the nearest `<Engine>`'s, from
[`@aeronautic/controls`](../../../controls/guides/engines/), else the flight's
inside a [`<FlightProvider>`](../../../core/reference/react/), else 1.1, full
reheat.

## `AfterburnerHandle`

What `ref` gives you. It's stable for the component's life, and safe to use
before the nozzle is in a batch.

```ts
type AfterburnerHandle = {
  throttle: number;
  setParams: (params: AfterburnerParamsInput) => void;
  updateParams: (params: AfterburnerParamsInput) => void;
  setOffset: (offset: AfterburnerOffset) => void;
  setDirection: (direction: [number, number, number]) => void;
  readonly params: Readonly<AfterburnerParams> | null;
  readonly object: Group | null;
  readonly nozzle: AfterburnerNozzle | null;
  readonly batch: AfterburnerBatchHandle | null;
};
```

| member         | what it does                                                       |
| -------------- | ------------------------------------------------------------------ |
| `throttle`     | Read or write. Cheap to write every frame.                         |
| `setParams`    | Replace the params over the preset.                                |
| `updateParams` | Merge into the current params. Rewrites this nozzle's instance.    |
| `setOffset`    | Move or turn the group: `{ position?, rotation?, direction? }`.    |
| `setDirection` | Point the exhaust, in the frame it sits in.                        |
| `params`       | The resolved params, or `null` before it is in a batch.            |
| `object`       | The group.                                                         |
| `nozzle`       | The core [`AfterburnerNozzle`](../core/#afterburnernozzle).        |
| `batch`        | The [`AfterburnerBatch`](../core/#afterburnerbatch) it draws with. |

A prop overrides what the handle wrote whenever that prop changes.

## `<AfterburnerBatch>`

The batch its children draw with. Without one, nozzles share a batch per scene,
preset and flight.

| prop                | type                                                                    | default                     | what it does                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preset`            | `AfterburnerPresetName \| AfterburnerPreset`                            | —                           | The profile to start from, and the look of nozzles that name none.                                                                                |
| `profile`           | `Partial<AfterburnerProfile>`                                           | —                           | The air and camera every nozzle shares, as uniforms. Applies live. See [Profile](../profile/).                                                    |
| `quality`           | `"low" \| "medium" \| "high" \| "ultra" \| Partial<AfterburnerQuality>` | `"high"`                    | Step counts are uniforms; only an octave change recompiles. See [Quality](../quality/).                                                           |
| `haze`              | `boolean`                                                               | `true`                      | Heat haze. Compiled in only when some nozzle has `refractionM > 0`.                                                                               |
| `hooks`             | `AfterburnerHooks`                                                      | —                           | TSL to change the field or the pixel. A change recompiles. See [Shader hooks](../../guides/shader-hooks/).                                        |
| `timeScale`         | `number`                                                                | `1`                         | Seconds of flame per second.                                                                                                                      |
| `responseS`         | `number`                                                                | `0.25`                      | Seconds a plume takes to follow its throttle, so a burner lights over a moment. `0` follows at once.                                              |
| `detailDistanceM`   | `number`                                                                | `900`                       | Past this, eddies are dropped.                                                                                                                    |
| `cheapDistanceM`    | `number`                                                                | `3000`                      | Past this, a plume is a single sample.                                                                                                            |
| `minScreenFraction` | `number`                                                                | `0.001`                     | Plumes smaller than this share of the screen height are not drawn.                                                                                |
| `pass`              | `AfterburnerPass \| VolumePass \| null`                                 | nearest `VolumePassContext` | Draw the plumes in a pass of their own. `null` draws in the scene. A change rebuilds. See [Half resolution](../../guides/half-resolution/).       |
| `source`            | `Flight \| null`                                                        | nearest provider            | A shared flight: its altitude, airspeed and day win over `profile`, and nozzles that follow the throttle run at its. `null` flies only the props. |
| `ref`               | `AfterburnerBatchHandle`                                                | —                           | The batch itself.                                                                                                                                 |

## `useAfterburnerBatch()`

Returns the nearest `<AfterburnerBatch>`'s `AfterburnerBatchHandle` from inside
one, or `null` outside.

```tsx
const Overlay = () => {
  const batch = useAfterburnerBatch();
  useFrame(() => console.log(batch?.stats()));
  return null;
};
```
