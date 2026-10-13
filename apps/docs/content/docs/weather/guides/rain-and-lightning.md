---
title: Rain and lightning
description: "The rain round the camera, the flashes and their thunder."
---

The rain and the lightning are in the clouds already: a rain shaft is
marched as the clouds are, and a flash lights the cloud it is in. Two
components draw what is seen up close:

```tsx
<Weather climate="stormy">
  <Rain />
  <Lightning
    onFlash={(flash) => console.log(flash.kind)}
    onThunder={(thunder) => play(thunder)}
  />
</Weather>
```

Both are drawn in the `<VolumePassContext>`'s pass if there is one, so they
go over the clouds and fade into the cloud round the camera. Otherwise they
are drawn in the scene.

## `<Rain>`

The streaks of the drops round the camera, wherever it rains there. They are
the largest of Marshall and Palmer's drops for the rain rate, each falling at
its own speed (Atlas et al. 1973) and carried by the wind. Each streak is as
long as the drop's path past the camera over the frame. Its alpha is the
drop's share of the pixel and of the streak (Garg and Nayar 2007), so the
box of drops hides as much as the rain's extinction says. The drops too
small to draw are the rain's haze, in the clouds' march.

They are lit by the sky through the cloud over them and by the ground. Under
a storm the rain is grey; under a thin shower it is bright.

## `<Lightning>`

The flashes' channels under the cloud. A storm flashes as often as Price and
Rind (1992) find a storm of its height does. A share of the flashes strikes
the ground, more towards the equator (Prentice and Mackerras 1977). A ground
flash is about four strokes 60 ms apart, and its first stroke peaks at
2.3 GW of light for some 158 µs (Guo and Krider 1982), seen as that energy
spread over 25 ms. A scene not lit in takram's units or the sun's sets the
look's `lux`: the sun's is none at night.

Inside the cloud, the flash is the cloud's light: the clouds' shader lights
the cloud round each of the four brightest flashes. Under the base the
channel is drawn, a pixel wide, as bright as its light over that width,
dimmed by the rain between it and the camera: e<sup>−τ</sup> of it gets
through, τ the rain's and the cloud's depth on the way to the middle of the
channel. Seen from 4 km, through 7 of it, a stroke keeps 0.06 % of its light,
and at night that is still more than the camera can show.

| prop        | what it is                                                                           |
| ----------- | ------------------------------------------------------------------------------------ |
| `onFlash`   | Called as each flash strikes, with the flash.                                        |
| `onThunder` | Called as its thunder reaches the camera: its distance, how long it rolls, how loud. |

The thunder reaches the camera at the speed of sound in the air there, from
the channel's nearest point first. It rolls for as long as the sound takes
to come from its farthest point. Its `loudness` is 1 at a kilometre and
falls as the distance.

Without React, `weather.on("flash", fn)` and `weather.on("thunder", fn)`
listen, and `RainStreaks` and `Bolts` are the meshes.

## The sources

The lightning's rates and its light are from:

- Price and Rind (1992), the flash rate from a storm's height:
  [earthref.org/ERR/45924](https://earthref.org/ERR/45924).
- Prentice and Mackerras (1977), the ground flashes' share by latitude:
  [earthref.org/ERR/46331](https://earthref.org/ERR/46331).
- The strokes of a flash and their spacing:
  [par.nsf.gov/servlets/purl/10439533](https://par.nsf.gov/servlets/purl/10439533).
- Guo and Krider (1982), the strokes' optical power:
  [repository.arizona.edu/handle/10150/325230](https://repository.arizona.edu/handle/10150/325230).
- The channel's light:
  [ntrs.nasa.gov/citations/19830068117](https://ntrs.nasa.gov/citations/19830068117).
