---
title: Heat haze and the anchor
description: "How the haze bends the frame, and why the flame is anchored in its own frame."
---

## Heat haze, and the buffer swap it cost

This is the one cue that says the gas is _hot_ rather than merely bright.
Exhaust is hundreds of degrees above the air around it, so it is optically
thinner, and everything seen through it swims.

Refraction is a **displacement** of what is behind, which means the fragment has
to read the scene as well as write to it — and a buffer cannot be sampled and
rendered into at the same time. The postprocessing version blitted the scene across first and drew the plumes
on top of the copy. Under WebGPU the material reads `viewportSharedTexture()`
instead, which three fills with the frame drawn so far — the plumes draw after
the opaque scene (`renderOrder` 1), so that is everything behind them. Because
the blend is additive and the scene is already underneath, adding the
_difference_ replaces one with the other exactly:

```glsl
radiance += texture2D(uSceneColor, screen + offset).rgb
  - texture2D(uSceneColor, screen).rgb;
```

### And the trap that actually looked like a bug in the flame

The offset was two samples of the same `value_noise` the flame is built from.
That is the wrong primitive for a **displacement**, and the failure is not
subtle: value noise is very nearly constant inside one of its cells, so a whole
cell of the screen slides rigidly and the seam to the next cell tears. With an
engine can behind it, what that looked like was the hardware cut into offset
rectangles — reported, reasonably, as the plume jittering at the exhaust.

Shrinking the amplitude only shrinks the rectangles. The field has to have no
cells to have seams between, so it is a sum of four sines now: smooth
everywhere, four trig calls against sixteen hashes, and air is closer to a few
overlapping waves than to a lattice anyway. There is also a hard ceiling on the
offset in screen heights, because everything upstream of it is in metres at the
plume — and the same tenth of a metre is one pixel through a wide lens and a
hundred through a long one.

The way to check this class of bug is to turn the orbit off (`?orbit=0`) and
difference two consecutive frames. With the camera still, anything that moves
is the renderer.

Two further traps, both of which cost a debugging pass:

- **The blit had to be a `ShaderPass`, not a `CopyPass`** in the
  postprocessing version: `CopyPass` renders into a buffer of its own, and
  rendering into a target nobody reads is silent. The shared viewport texture
  has no such trap, but the haze is a separate material variant, compiled in
  only when some nozzle in the batch has `refraction_m > 0`, so a batch with no
  haze never pays for the copy.
- **The haze follows the gas, not the fire.** `haze_depth` is accumulated
  separately from the flame, before the burn decay and the soot. Tied to the
  flame's own alpha, the shimmer stopped dead where the fire faded, which put a
  hard edge on something that has none.

The displacement is in metres at the plume and converted to screen heights by
`length(v_origin) * uScreenScale`, so it shrinks correctly with distance. It is
also invisible against clear sky — there is nothing there to displace — which
makes it easy to believe it is not working. Check it against the airframe.

---

## The anchor, and the bug that hid behind everything else

Every plume is described as an offset from one anchor, in float32, because the
scene is geocentric and a world position is over six million metres out. A metre
from the anchor resolves to a nanometre. Six thousand kilometres from it
resolves to about half a metre — and a plume whose origin is quantised to half a
metre does not sit on its nozzle.

The anchor is planted on the first frame, from the first nozzle that knows where
it is. On the first frame the aircraft may not have been placed in the world
yet, and **a nozzle still carrying its local model matrix reads as a few metres
from the scene's origin** — a perfectly plausible position, and an entire planet
from where the aircraft actually is. Nothing about it looks wrong from the
inside. Every plume is then measured from the wrong place for the rest of the
session.

What that looks like is not a wrong number. It is the flame sitting slightly off
its own engine — and because a _fixed_ offset in three dimensions projects to a
_varying_ offset on screen, it looks like the plume vibrating around the nozzle
whenever the camera moves, and perfectly steady whenever it does not.

`anchor_adrift` is the guard, and it is a tested pure function: if the anchor
ends up more than `MAX_ANCHOR_DISTANCE_M` from the nozzles it measures, the
layout is done again. A kilometre is comfortably more than a formation spreads
over and far less than the distance at which float32 stops resolving a nozzle.

Two things made this hard to find, and both are worth knowing:

- **Every dial fixed it.** Changing any per-nozzle parameter bumps the version,
  which re-lays the scene out, which re-plants the anchor from matrices that are
  correct by then. So every experiment "worked", which points away from the
  cause rather than toward it.
- **A no-op change did not fix it, and that looked like evidence.** It was not:
  React swallows a change event when the value is identical, so the no-op test
  never fired an event at all. The control was measuring nothing.

The instrument that settled it is `?orbit=0`. With the camera still, difference
two consecutive frames: anything that moves is the renderer. A misalignment that
only appears when the camera moves is a transform bug, not a shading one.

### And a second copy of the camera

The vertex shader used to build its own view transform from a camera the field
sampled in `useFrame` and handed over as uniforms. That is a second copy of the
camera, written at a different moment in the frame from the one the scene is
drawn with, and the two do not have to agree. It now uses three's own
`modelViewMatrix`, composed at draw time from the camera actually being drawn
with — there is no second copy left to disagree.
