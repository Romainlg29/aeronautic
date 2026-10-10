---
title: Without React
description: "The plain three.js classes."
---

`Weather` holds the sky, and `CloudsNode` draws it for a camera:

```ts
import { cloud_layer, clouds, Weather } from "@aeronautic/weather";
import { pass } from "three/tsl";
import { Timer } from "three";
import { RenderPipeline } from "three/webgpu";

const weather = new Weather({
  seed: 7,
  day: { temperatureOffsetK: 5 },
  layers: [cloud_layer("cumulus-mediocris")],
});

const remove = weather.add(cloud_layer("cirrus", { cover: 0.2 }));

const node = clouds(weather, camera, { quality: "medium", scene });
const drawn = pass(scene, camera);
const pipeline = new RenderPipeline(renderer);

pipeline.outputNode = node.over(
  drawn.getTextureNode("output"),
  drawn.getTextureNode("depth"),
);

const timer = new Timer();

renderer.setAnimationLoop((time) => {
  timer.update(time);
  weather.advance(timer.getDelta());
  pipeline.render();
});

// When done
node.dispose();
```

It needs three's `WebGPURenderer`.

- `weather.set({ seed, layers, day, look })` changes any of them;
  `weather.changed()` says the layers or the day were changed in place.
- `weather.add(layer)` adds one, and hands back what takes it away again.
- `weather.advance(seconds)` runs the clock, and moves `origin` at
  `velocity`.
- `weather.sample(x, y, z)` is the air at a point of the scene.
- `node.medium` is the cloud round the camera, set as the medium of the
  `scene` it was given; `weather_medium(weather, x, y, z)` works it out
  anywhere.

Under core's `volume_pass`, composite the clouds in its backdrop, so the
pass's effects are drawn over them:

```ts
volume_pass(scene, camera, {
  backdropNode: ({ color, depth }) => node.over(color, depth),
});
```
