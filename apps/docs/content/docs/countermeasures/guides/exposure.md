---
title: The exposure
description: "How bright one cd/m² is drawn, and matching it to a scene."
---

Every flame is worked out in photometric units: candela from the flare, lux
at the eye, cd/m² on the screen. `look.exposure` is the number one cd/m² is
drawn as, before the tone map. `exposure_ev100` from `@aeronautic/core` gives
it for a camera's exposure value at ISO 100:

```ts
import { exposure_ev100 } from "@aeronautic/core";

<Countermeasures look={{ exposure: exposure_ev100(8) }} />;
```

An MJU-7 is about 250,000 cd as it lights. Ten metres off, that is 2500 lux
on the airframe, which EV100 8 draws near white. That is the default: a
camera at night set for a flare's light, with everything else black.

By day, about EV100 15, the flames are still far brighter than the sky,
whose few thousand cd/m² sit at the middle of the screen, but their light on
the airframe is lost in the sun's hundred thousand lux.

The scene round the aircraft has to be lit to the same scale: a hemisphere
light of so many lux, times the exposure. The flares' own point lights are in
candela times the exposure already.
