---
title: Without React
description: "The plain three.js classes."
---

`Weather` holds the sky, and `CloudsNode` draws it for a camera:

```ts
import {
  Bolts,
  clouds,
  RainStreaks,
  storm,
  Weather,
} from "@aeronautic/weather";
import { pass } from "three/tsl";
import { Timer } from "three";
import { RenderPipeline } from "three/webgpu";

const weather = new Weather({ seed: 7, climate: "unsettled" });

const remove = weather.use(storm({ at: [20_000, 0] }));

const node = clouds(weather, camera, { quality: "medium", scene });
const drawn = pass(scene, camera);
const pipeline = new RenderPipeline(renderer);

pipeline.outputNode = node.over(
  drawn.getTextureNode("output"),
  drawn.getTextureNode("depth"),
);

// The rain and the flashes round the camera
const rain = new RainStreaks(weather);
const bolts = new Bolts(weather);

scene.add(rain, bolts);

const off = weather.on("thunder", (thunder) => play(thunder));
const timer = new Timer();

renderer.setAnimationLoop((time) => {
  timer.update(time);

  const delta = timer.getDelta();

  weather.advance(delta);
  rain.update(camera, delta, renderer.domElement.height);
  bolts.update(camera, renderer.domElement.height);
  pipeline.render();
});

// When done
node.dispose();
rain.dispose();
bolts.dispose();
```

It needs three's `WebGPURenderer`.

- `weather.set({ seed, climate, look, plugins })` changes any of them;
  `weather.changed()` says the climate or a plugin was changed in place.
- `weather.use(plugin)` adds one, and hands back what takes it away again.
- `weather.advance(seconds)` runs the clock, moves `origin` at `velocity`,
  and bakes the map round the camera.
- `weather.sample(x, y, z)` is the air at a point of the scene, and
  `weather.column(x, z)` the clouds over it.
- `weather.on("flash" | "thunder", fn)` listens to the lightning, and hands
  back what stops listening.
- `node.medium` is the cloud round the camera, set as the medium of the
  `scene` it was given; `weather_medium(weather, x, y, z)` works it out
  anywhere.

Under core's `volume_pass`, composite the clouds in its backdrop, so the
pass's effects are drawn over them, and add the rain and the bolts to its
scene:

```ts
volume_pass(scene, camera, {
  backdropNode: ({ color, depth }) => node.over(color, depth),
});
```
