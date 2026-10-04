---
title: Finding parts
description: "Reading a rig's extras, finding panels by name, fitting a hinge and putting a pivot in."
---

The rig looks twice: first for what the model says, then for what its names
suggest.

## The rig

Every node with a `ctrl_type` extra is a part. It turns about, or slides
along, its own local X, from the pose it was found in. Its `rest` is posed
first, and every value after is measured from its pose at zero, so a
part never drifts however long it moves.

What is under a rigged part, or holds one, is left to it.

## The names

What is left is searched for panels named as a control surface: ailerons,
elevators, elevons, stabilators, canards, rudders, flaps, leading-edge flaps,
air brakes, spoilers and drag rudders. A `HINGE_` or `CTRL_` node is skipped,
and so is fixed structure named after what moves in it: a `well`, a `bay`, a
`fairing`, a `track`, an `actuator`.

### Fitting a hinge

A control surface hangs off a straight edge. For each panel, in the
aircraft's frame:

1. Its **span** is the direction its vertices spread out most along.
2. Its **chord** is aft, square to the span.
3. The span is cut into twelve bins. In each, the most forward vertex is kept,
   or the most aft for a leading-edge flap: that is the edge it hangs off.
4. A line is fitted through those edge points. It is the hinge.

The hinge is turned so that a positive angle moves the panel's far edge the
way its kind says: down for a trailing edge, right for a rudder, open for a
brake.

### Putting a pivot in

A pivot node, `HINGE_auto_<name>`, is put in above the panel, on the hinge
with its X along it. The panel keeps its world pose. Turning the pivot turns
the panel about its hinge.

This changes the scene graph. Code that finds the panel by its parent should
look for the pivot, or turn it off with `names={false}`.

## Sides

From the name first: `_L`, `Left`, `Port`; `_R`, `Right`, `Starboard`;
`_C`, `Centre`. Otherwise from where it sits: within 5 cm of the centre line
is `centre`, else the side it is on.

## The aircraft's frame

All of this happens in the aircraft's own frame, from `forward` and `up`:
−Z forward and +Y up by default, as the docs' fighter is.
