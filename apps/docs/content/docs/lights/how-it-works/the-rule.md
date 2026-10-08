---
title: The rule
description: "Position lights to CS/FAR 25.1385 to 25.1397."
---

The position lights are drawn at what the rule asks of them, which is a
minimum: a real light gives at least as much, and `scale` says how many times
as much.

## Over the arc

In the horizontal plane, the red and the green give 40 cd from dead ahead to
10° out, 30 cd to 20° and 5 cd on to 110°. The white gives 20 cd over the 140°
astern (25.1391). Above and below, each gives a share of that: 90 % at 5°,
half at 20°, a tenth at 40° and 5 % straight up or down (25.1393).

## Past it

A light may not spill far into its neighbour's arc. The rule caps the red in
the green's arc at 10 cd, and in the white's at 5 cd, in a band out to 20°
past the edge, and at 1 cd beyond (25.1395). The light here falls from its
edge value to those caps geometrically, as a lamp's cut-off does. `spill`
scales the caps: 0 cuts a light off at its edge.

## The colours

The rule bounds each colour in the CIE 1931 diagram (25.1397). The red and
the green are LEDs' at 625 and 525 nm, from the CIE colour matching
functions. The white is a filament's, taken as illuminant A. Each is carried
to linear sRGB at a luminance of one; one out of gamut is brought in by
adding white, which keeps its luminance.
