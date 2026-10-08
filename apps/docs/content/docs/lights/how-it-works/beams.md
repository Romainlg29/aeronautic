---
title: Beams
description: "The landing and taxi lights, on the ground and in the air."
---

A lamp's beam is taken as a Gaussian: its intensity falls to a tenth of the
peak at half the catalogue's spread, each way, so a 50° × 10° taxi light is
wide and flat.

## On the ground

The beam lights the scene as a three spot light of the lamp's peak, with the
Gaussian laid over it. A point on the ground gets the intensity the lamp
sends its way over its distance squared, in lux, and three's materials
reflect it.

## In the air

Looking through a beam, the eye sees the light the air scatters towards it
from every point along the ray: the lamp's intensity that way over the
distance squared, times the air's scattering at that angle, less what the air
takes on the way in and out. It is summed with a few dozen samples, set
closest where the ray passes nearest the lamp, where the light changes
fastest.

The cone is drawn only as far as that light can show. A ray passing a lamp
collects at most its intensity, times the air's scattering, times π over how
near it passes, and none passes nearer than the lens: past where that falls
below what the screen shows, along the beam or across it, there is nothing
to draw.
