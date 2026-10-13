---
title: The field
description: "Where the clouds are: the map's columns, cut from the noise at their cover, rough down to tens of metres."
---

The [map](/docs/weather/how-it-works/the-air) says, at every point, how much
of the sky each kind of cloud covers there and how high it reaches. The
noise then says which points of it are the cloud: each layer is cut from the
same shape noise at the threshold its cover sets, the noise's own quantile,
so a cover of 0.3 is 30 % of the sky, whatever the noise's distribution.
Where the cover changes over the map, the clouds thin out into clear sky
over kilometres, never a uniform sheet of cloud everywhere.

## The cumulus

A cumulus's threshold rises with the height through it, to the noise's peak
at the cumulus's top: each cloud is as tall as its noise stands above the
cut, most shallow and a few deep, as a field's are. The top is the
equilibrium level of the strongest parcel, and only the strongest core in
the noise reaches it, so the tops are not cut off at one height. Its base is flat, at
the condensation level. The threshold rises as h<sup>k</sup>: a small k, 0.5,
lets few clouds grow deep, as in a fair-weather field; a storm's updraft
raises it towards 3, keeping its tower solid nearly to its top.

A cumulus field's cells are spaced as Rayleigh's convection rolls are, about
twice the mixed layer's depth (2π / 3.117 of it), and the noise's tile holds
four of them. So low cumulus on a humid day are small and close, and high
ones on a dry day large and far apart.

## The sheets

Stratocumulus, altostratus, cirrus and the anvils are sheets, cut from the
noise at their cover and squashed four times flatter than wide, their
density falling to their base and top as 1 − (2h − 1)<sup>4</sup>. The
cirrus are drawn out along the wind four times their width, as its streaks
are. These scales are estimates, from how such cloud looks.

A sheet is as deep as its air is moist. A deck saturates first under its
inversion, an anvil under the tropopause: their tops are flat, and their
bases rise and fall with the moisture under them (Wood 2012). An
altostratus or a cirrus, held by no lid, saturates first in its middle. So
the cut rises from the cover's threshold where the sheet saturates first to
the noise's peak away from it, and the sheet is deep where the noise stands
high, thin where it barely clears the cut. The linear rise is an estimate.

## The billows

The noise is cellular, inverted: its level sets are spheres about its
feature points, so it heaps rounded lobes. The shape is three octaves of it
over a Perlin–Worley base, the detail three finer. Cloud edges are fractal
from a kilometre to a thousand, their perimeter's dimension 1.35 (Lovejoy
1982), so a lobe half the size stands out 2<sup>−0.65</sup> = 0.64 as far:
the octaves are weighted so. The shape noise is stretched over 0 to 1 from
its 5th and 95th percentiles, so a billow wears its full reach in, and left
unclamped above, so its strongest cores stand out.

A tile a few cells across, laid over the sky, repeats: a lattice of the same
clouds to the horizon. But the cellular noise of two sets of points is the
noise of their union, the nearer point of the two. So the tile is read
twice, the second time turned by the golden angle about the vertical and
moved by an irrational step, and the nearer point kept. The two lattices
never line up again, so neither does the sky. The union has twice the
points, so each read is 2<sup>1/3</sup> as large and the cells keep their
size. It costs one more texture read per sample. The union no longer
repeats with the tile, so the shader can't wrap where the camera is by a
whole tile to keep its single floats precise: each read is given its own
place in its tile, worked out in doubles on the CPU, or the clouds would
jump each time the camera crossed a tile.

The detail carries the same ladder on: three more octaves, each twice as
fine, weighted as the shape's, the first a further 0.64³ down, so a cloud's
edge is rough from the noise's tile down to some tens of metres. It is
added to the shape noise before the cut, so it moves the edge, not only the
density at it, and it is sampled only within the quality's `detailM` of the
camera, where the most it adds could make cloud; past it the detail is too
fine to see. The billows boil upward at the cumulus's updraft and
drift with the wind.

## The seed

The noise is integer hashing, Jarzynski and Olano's pcg3d (2020): a hash
that passes for random with no table to share, and that the CPU and the GPU
compute bit for bit alike. The GPU bakes it into two tiling 3D textures,
128 and 64 texels a side, each texel the very function the CPU evaluates at
its centre. So one seed makes the same sky on every machine, and what
`sample` finds at a point is what is drawn there.
