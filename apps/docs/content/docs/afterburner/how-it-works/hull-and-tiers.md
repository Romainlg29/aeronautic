---
title: The hull and the tiers
description: "The frustum proxy hull, and the near, mid, far and culled tiers."
---

## The hull is a frustum

The hull is a mask and nothing else: every pixel it covers runs a trace, and
every pixel it covers and the plume does not runs one that finds nothing.

The field at a station is the body radius opened out by the shell, the chew and
the wander, all of which are shares of that body radius. The body is
`nozzle * grow(t) * close(t)` with `grow` never past `flare`, so the whole field
is inside `outerRadius * close(t)` — and `close` is `(1 - t)^power`, which for
any power at or above one sits under the straight line `1 - t`.

A straight line is a frustum. It needs no rings in the middle, holds whatever a
caller does to the flare, and throws away most of the back half of what a prism
would have rasterized. `hull_taper` is the rule, and it is tested against the
radius profile at twenty stations rather than asserted. Under a taper power of
one the curve bulges above that line and no frustum holds it, so the hull goes
back to being the box the flame is trivially inside and pays the fragments.

---

## The distance tiers

Tracing is the most expensive thing per fragment in the scene. It is also, past
a kilometre, entirely wasted: a 16m flame at 3km is under three pixels, and the
eddies, the Mach disks and the soft edge each cost exactly as much there as they
do from the cockpit while surviving none of the rasterization.

`plume_lod` is the rule, and it is a tested pure function rather than a comment,
because the vertex shader makes the same decision from the same numbers and the
two must not drift:

| Tier     | When                                    | What it costs                                                                                       |
| -------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NEAR`   | inside `detailDistanceM`                | 48 iterations at `high`, sphere traced, an octave of noise per sampled step, the disks in the shape |
| `MID`    | inside `cheapDistanceM`                 | 16 iterations, laminar, still has the disks                                                         |
| `FAR`    | beyond it                               | **one** analytic sample through the thickest part, weighted by the span                             |
| `CULLED` | under `minScreenFraction` of the screen | the instance is collapsed outside the clip volume and never rasterized                              |

Defaults are 900m and 3000m, with a 0.1% screen-height floor.

That floor is tied to the plume's length and has to move with it. At 0.25% —
where it was set for a much longer flame — a short plume is culled well
inside the cheap distance, so every plume the `FAR` tier exists to
draw is dropped before it ever reaches that tier and the tier stops running at
all. There is a test that says so.

`CULLED` is answered **before** the distance tiers, so an engine that is barely
running is dropped however near it is — the length a throttle actually reaches
is what the cull measures, not the length at full burner.

`batch.stats()` reports the four counts live. A plume out of the camera's view is
frustum culled, and counted with the rest of the culled.
