---
title: Batches, quality and performance
description: "How plumes are batched, the distance tiers, and what to turn down first."
---

## One draw per batch

Every nozzle in a batch is one instance of one mesh: **one draw call**,
however many there are. Only nozzles whose matrix changed are re-uploaded, by
update range. A nozzle that sits still costs nothing on the CPU.

The plumes blend over each other, so the instances are kept furthest first,
measured from the camera to the nearest point of each plume's axis. They are
reordered only when the order is wrong by more than 2%, so two plumes side by
side do not swap every frame, and a reorder re-uploads the whole batch once.

Without an `<AfterburnerBatch>`, nozzles share one batch per scene and
preset. Add one when you want to:

- set the profile, quality or hooks;
- take a ref to it;
- put nozzles of different presets in one draw.

```tsx
<AfterburnerBatch preset="afterburner" quality="medium">
  {squadron.map((jet) => (
    <Afterburner key={jet.id} target={jet.engine} />
  ))}
</AfterburnerBatch>
```

## The distance tiers

Each plume picks a tier in the vertex shader, every frame:

| tier   | when                                                          | what it draws            |
| ------ | ------------------------------------------------------------- | ------------------------ |
| near   | closer than `detailDistanceM` (900)                           | full march, with eddies  |
| mid    | up to `cheapDistanceM` (3000)                                 | the march without eddies |
| far    | beyond                                                        | a single sample          |
| culled | under `minScreenFraction` of the screen height, or off screen | nothing                  |

All three are batch props, and fields on `AfterburnerBatch`.

`batch.stats()` returns how many plumes are in each tier last frame:

```ts
batch.stats(); // { nozzles: 40, near: 2, mid: 9, far: 25, culled: 4 }
```

## Quality

`quality` caps how many march iterations a fragment may take:

| preset   | near steps | mid steps | eddy octaves |
| -------- | ---------- | --------- | ------------ |
| `low`    | 32         | 12        | 1            |
| `medium` | 48         | 16        | 2            |
| `high`   | 64         | 24        | 2            |
| `ultra`  | 112        | 40        | 3            |

Or pass your own: `quality={{ nearSteps: 80 }}`. Step counts are uniforms and
change live. Only the octave count is compiled in, so changing it recompiles
the material. An octave is one fetch from a small baked noise volume, so the
third costs a texture read, not another round of hashing.

The march skips empty space by a conservative bound and stops once the flame is
opaque, so the step count is a ceiling, not an average. Steps are also shared
out by screen area: a plume filling the frame gets fewer, down to the mid
tier's count. So a frame costs about the same however close the camera comes.

## What to turn down first

1. **[Half resolution](../half-resolution/).** The biggest single win. Close up
   and astern of a fighter, the worst case goes from 6.8 ms to 2.7 ms.
2. **Quality.** `low` suits phones.
3. **Haze.** `haze={false}` saves a copy of the frame and some work per pixel.
4. **`detailDistanceM`.** Drop eddies sooner.
5. **Device pixel ratio.** A raymarch costs per pixel. `dpr={[1, 1.5]}` on the
   canvas caps it.

## Measuring

WebGPU timestamps give the GPU time per frame:

```ts
const renderer = new WebGPURenderer({ trackTimestamp: true });

// after a frame
await renderer.resolveTimestampsAsync("render");
console.log(renderer.info.render.timestamp, "ms");
```
