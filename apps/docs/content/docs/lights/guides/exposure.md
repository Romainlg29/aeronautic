---
title: The exposure
description: "How bright one cd/m² is drawn, and matching it to a scene."
---

Every light is worked out in photometric units: candela from the light, lux
at the eye, cd/m² on the screen. `look.exposure` is the number one cd/m² is
drawn as, before the tone map.

`exposure_ev100` gives it for a camera's exposure value at ISO 100, metered
as a camera's saturation-based speed has it:

```ts
import { exposure_ev100 } from "@aeronautic/lights/physics";

<Lights look={{ exposure: exposure_ev100(3) }} />;
```

| EV100 | scene                         |
| ----- | ----------------------------- |
| -2    | a moonlit landscape           |
| 3     | a floodlit apron, the default |
| 8     | a lit interior                |
| 15    | a sunny day                   |

The scene round the aircraft has to be lit to the same scale for the lights
to sit in it: a sky of 6000 cd/m² drawn at 1 is an exposure of 1/6000. The
lights' own light on the scene, three's lights, is in the same units: a spot
light of so many candela, times the exposure.

By day the position lights are a few candela against a sky of thousands of
cd/m². Drawn at the day's exposure they are the specks they are in life.
