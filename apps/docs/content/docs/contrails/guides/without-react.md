---
title: Without React
description: "Contrails, the plain three.js class underneath."
---

`<Contrails>` is a thin layer over the `Contrails` class from the package
root. Without React, make one, add its mesh to the scene and point it at the
object it follows:

```ts
import { Contrails } from "@aeronautic/contrails";

const trails = new Contrails({
  object: jet, // the model, or any node of it
  frame: { forward: [0, 0, -1], up: [0, 1, 0] },
  airframe: {
    engines: [
      [-0.75, 0.05, 7],
      [0.75, 0.05, 7],
    ],
  },
  air: { altitudeM: 11_000, relativeHumidity: 0.66 },
  look: { sunDirection: [5, 10, 5] },
});

scene.add(trails.mesh);

// Every frame
trails.updateFlight({ airspeedMPerS: 250, loadFactor: 2 });
```

The mesh is placed in world space by hand, wherever it is parented, and
updates itself in its `onBeforeRender`: once a frame it records where the
aircraft is and how it is flying, and lays the trails through the air it has
flown. Everything else is worked out when a dial changes.

The trails are laid from the time the frames give. After a jump, a teleport
or a paused tab, start them again:

```ts
trails.reset();
```

And free it when you are done:

```ts
trails.dispose();
```

## Its state

`trails.state` says what the physics made of the day:

| field            | what it is                                                        |
| ---------------- | ----------------------------------------------------------------- |
| `air`            | The day's air: temperature, pressure, density, vapour.            |
| `iceHumidity`    | Its humidity over ice. Over 1, a trail persists.                  |
| `criterion`      | The Schmidt–Appleman criterion: `forms`, `thresholdK`, the slope. |
| `formation`      | The dilutions at which the plume saturates and freezes.           |
| `efficiency`     | How much of the fuel's heat pushes the aircraft.                  |
| `fuelPerMetreKg` | Each engine's fuel per metre flown.                               |
| `wake`           | The vortex pair: spacing, circulation, descent.                   |
| `visible`        | Whether a trail forms at all.                                     |
| `persistent`     | Whether it lasts.                                                 |

Every method is in the [reference](../../reference/component/#the-class).
