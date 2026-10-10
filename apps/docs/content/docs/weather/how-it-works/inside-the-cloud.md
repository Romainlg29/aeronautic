---
title: Inside the cloud
description: "The cloud round the camera, as the medium every effect is drawn in."
---

The clouds are drawn behind the effects: a plume or a vapour in front of
the camera is composited over them whole, however much cloud lies between.
Inside a cloud that is the whole of the way, and the effects must fade into
it as a surface does into fog.

Within the few hundred metres an effect is seen across in a cloud, the
cloud is about as thick and as bright throughout. So it is taken as the
camera finds it, once a frame on the CPU, from the same field and the same
light as the clouds' shader:

- **Its extinction** σ at the camera: light from d away comes through as
  e<sup>−σd</sup>.
- **Its colour**, the light it scatters per its extinction, its source
  function: the sun through the cloud towards it, scattered once and many
  times, and the sky and the ground through the cloud over and under. Seen
  from inside, the light comes from every way, so the single scattering's
  phase is its mean, 1 / 4π.
- **The sun's transmittance**, e<sup>−τ</sup> towards the sun, and **the
  diffuse light**, all but the beam.

That is the scene's medium, which core's `set_scene_medium` holds beside
`scene.fog`. Every effect reads it as it reads the fog, and fades into the
cloud with its distance. The vapour, the contrails, the smoke and the chaff
are lit by it too: by the sun's beam as much of it as gets through, and in
place of the sky by the diffuse light.

The aircraft in the cloud flies in saturated air, so its vapour forms as it
would there: see [the other effects](/docs/weather/integrations/the-effects).
