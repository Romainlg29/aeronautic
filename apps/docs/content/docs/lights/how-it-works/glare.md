---
title: Glare
description: "The eye's own scatter round a point of light."
---

A light a few hundred metres off is far smaller than a pixel. What makes it
look like a light is the eye: it scatters some of what reaches it into a veil
round the image. CIE 146 gives that veil, the glare spread function, from a
tenth of a degree to a hundred, for the observer's age and the colour of
their eyes.

Each light is drawn as its illuminance at the eye times that function: the
veil per lux, in cd/m², at each angle from the light. What the eye does not
scatter stays in the light's own disc, a tenth of a degree, or a pixel if
that is wider. The veil is drawn out to where it falls below what the screen
shows, a thousandth of its white. A brighter light, or a higher exposure, has
a wider glare.

The glare is the eye's, not a lens's: no bloom is needed for it. A light
hidden behind the airframe has none, read from the scene's depth at the
light.
