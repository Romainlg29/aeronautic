---
title: Shock diamonds
description: "Why the diamonds need the camera nearly abeam, and why astern they are rings."
---

## Why the diamonds need the camera as much as the shader

A Mach disk is a feature that varies **along** the plume and not across it, so
what resolves it is how much axis one ray crosses.

Seen from dead astern the ray runs down the plume's own axis and crosses more
than a whole cell, so every disk integrates to the average of all of them and
none of them is visible at any strength. Nearly abeam, a ray crosses about a
fifth of one and they are obvious. That is why a camera that sits off the plume's axis shows them best, and why they
appear and disappear as it orbits round.

Two things in the shader exist for the same reason:

- The cell is **squared again** for the emission channel and only there. A disk
  as wide as its own spacing integrates to the same number wherever a ray is
  aimed. Squared, the bright part is a quarter of the spacing, and a ray through
  one gets several times what a ray between two does.
- The disk's radial falloff is measured across the **unpinched** body. Measured
  across the waist it just made, a disk is as wide as whatever it necked the
  flow down to — a bright dot on the axis rather than a disk across the flow,
  and a row of dots is the string of beads this is trying to avoid.

### And why, astern, they are rings

The fine march ([frame budget](../frame-budget/)) fixed the stride, but not this. From dead astern every
ray still runs through every cell's hot lozenge, and the lozenges all project
onto the same disc, so the train reads as one soft blob. A photograph from
behind shows nested rings instead. They come from the **barrel shock**: the
oblique shock that leaves each Mach disk's rim, bows out to its widest
mid-cell and closes back in on the next disk. The gas passing through it is
heated into a thin sheet. Where the sheet runs parallel to the axis, at its
widest, a ray down the axis grazes it for its whole bow and picks up far more
than a ray beside it. That is a ring. The core narrows downstream, so each
cell's ring sits inside the last one.

The sheet sits at `BARREL_RIM + 4·BARREL_BOW·b(1−b)` of the inviscid core,
where `b` is the share of the cell behind the disk. It is `BARREL_WIDTH` thick
and `BARREL_HEAT` as hot as the gas behind a disk. A step coarser than the
sheet sees it widened to its own reach across the core, and dimmed to match,
so a coarse ray averages it rather than flickering through it. Side on it only
outlines each diamond.

`shock_pinch` also has to be clear of `edge_softness`. The shell blurs the
surface, so anything cut into that surface shallower than the shell is blurred
away with it. At a third of the radius, the shell swallowed the cells whole.
