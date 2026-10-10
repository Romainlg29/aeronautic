---
title: The light
description: "The sun, the sky and the ground the clouds are lit by, in the scene's units."
---

`look` is the light the clouds are lit by, linear RGB in the scene's own
light units:

| field          | default             | what it is                                                       |
| -------------- | ------------------- | ---------------------------------------------------------------- |
| `sunDirection` | `[0.4, 0.75, 0.3]`  | Towards the sun, world space.                                    |
| `sun`          | `[3, 2.9, 2.7]`     | The sun's illuminance on a surface facing it.                    |
| `sky`          | `[0.35, 0.5, 0.8]`  | The sky's radiance, the same from every direction above.         |
| `ground`       | `[0.12, 0.12, 0.1]` | The ground's radiance, seen from above.                          |
| `exposure`     | `1`                 | What one unit of the scene's light is drawn as.                  |
| `visibilityM`  | `60000`             | The air's meteorological range between the camera and the cloud. |
| `haze`         | `[0.6, 0.7, 0.85]`  | What that air fades a distant cloud to.                          |

The defaults are a clear day in the docs' plain stage, whose sky is drawn at
about its colour. Change the look whenever the scene's light changes; it
only writes uniforms:

```ts
weather.set({ look: { sunDirection, sun, sky } });
```

## Matching the scene's light

The clouds are lit as the rest of the scene only if the light is the
scene's: the same sun its lights use, the sky's mean radiance over the dome,
and the ground's. A Lambertian ground of albedo a, under a sun of
illuminance E at elevation θ and a sky of radiance L<sub>sky</sub>, has
radiance

L<sub>ground</sub> = a (E sin θ + π L<sub>sky</sub>) / π.

The landing page's sea uses a = 0.06 (Payne 1972).

## The air

`visibilityM` and `haze` are the air between the camera and the clouds: a
cloud d away keeps e<sup>−3.912 d / V</sup> of its light, Koschmieder's
range V, and the rest is the haze. Under an atmosphere that applies its own
aerial perspective to the clouds, set `visibilityM` to 0 for none.

Under takram's sky, the look is its illuminance: see
[takram's atmosphere](/docs/weather/integrations/takram-atmosphere).
