---
title: The field
description: "Where the clouds are: their columns, laid out from the seed, worn into billows."
---

Each layer is laid out on the ground first, as columns: at every point, how
high cloud reaches above the layer's base, how far inside a cloud's
footprint the point is, how thick an anvil hangs there, and how hard it
rains. The noise then carves billows into the columns, and the day's
adiabat fills them with water.

## The cumulus

A cumulus field is a power law of sizes, as many clouds of each diameter as
D<sup>−b</sup>, b about 2 (Benner and Curry 1998). The sizes are drawn an
octave at a time, each octave on its own grid of cells as wide as its
largest cloud, so a cloud never leaves its cell and a point looks at one
cell an octave. Each cell holds a cloud with the probability that gives the
octave its share of the clouds, and the octaves, overlapping at random,
cover the layer's `cover` of the sky.

Each cloud is a dome on a flat base: a thermal's top is near a spherical
cap (Scorer 1957), so a tower's is a half ellipsoid as wide as it and as
tall as its aspect makes it. A larger `crown` squares it into a tower that
rounds off only at its top.

## The sheets and the storms

A stratiform layer is a sheet, holed where a coverage noise falls below the
threshold that leaves its cover of sky. A storm is a cumulonimbus to the
tropopause, its anvil a lens spreading under it, carried downwind, and its
rain shaft under its core.

What is kilometres across and smooth, a sheet's coverage, an anvil, the
rain and the storms placed by hand, is baked into a weather map round the
camera, four channels a texel, and baked again once the camera has crossed
a quarter of it. The cumulus towers are worked out where they are sampled,
at any scale.

## The billows

A cumulus rises as a train of thermals each about half its width (Blyth,
Cooper and Jensen 1988), so a billow is a quarter of the largest tower
across. The columns' tops and bases are worn in by a billow where the shape
noise is low, and by a detail more where the detail noise is, as
cauliflower is; the edge is a detail wide. The billows boil upward at the
layer's updraft and drift with its wind.

The shape noise is Perlin–Worley with three octaves of cellular noise, the
detail three finer octaves of cellular noise. Each is stretched over 0 to 1
from its 5th and 95th percentiles, so a billow wears its full reach in.

## The seed

The noise is integer hashing, Jarzynski and Olano's pcg3d (2020): a hash
that passes for random with no table to share, and that the CPU and the GPU
compute bit for bit alike. The GPU bakes it into two tiling 3D textures,
128 and 64 texels a side, each texel the very function the CPU evaluates at
its centre. So one seed makes the same sky on every machine, and what
`sample` finds at a point is what is drawn there.
