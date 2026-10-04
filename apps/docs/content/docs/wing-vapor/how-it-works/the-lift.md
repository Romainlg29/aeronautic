---
title: The lift
description: "DATCOM's lift slope, Polhamus's vortex lift, and vortex breakdown."
---

Every part of the field is driven by lift: the circulation the tip vortices
carry, the strength of the leading-edge vortices, the suction over the wing.
So the lift is worked out first, from the airframe and the flight.

## Attached flow

DATCOM's lift slope gives the lift of the attached flow for the wing's aspect
ratio, sweep and Mach number.

## The leading-edge vortex

A sharp, swept leading edge doesn't hold its flow at any useful angle of
attack. The flow separates off it and rolls up into a vortex lying over the
wing, whose low pressure adds lift. Polhamus's suction analogy turns the
leading-edge suction an attached flow would have had into that vortex lift.
`leadingEdgeSharpness` says how much of it a given edge sheds: all of it for
a chined fighter or a delta, about half for a round-nosed wing.

## Breakdown and the stall

Vortex breakdown marches up the wing as the angle of attack grows, sooner for
a less swept edge. Behind it the vortex's core swells and stops lifting, so
the vortex lift goes with it: that is the stall, and why
`angle_of_attack_for_load` stops at the wing's maximum.

## Circulation

The tip vortices hold the wing's circulation once the sheet behind it has
rolled up, by Kutta–Joukowski over the rolled-up pair, `Γ = L / ρ V b′`, with
the pair π/4 of the span apart. The leading-edge vortices hold what slender-wing
theory says the vortex lift needs.

## Rolls and sideslips

A roll at rate `p` raises the angle of attack of the wing going down by
`p y / V`, about `p s / V` over the angle the whole wing flies at. A sideslip
turns the leeward wing's sweep against the flow and the windward wing's into
it, `2β tan Λ` between them for a swept edge. Each side's vortices and each
half of the sheet take that side's share.

These are a loading per side, not a recomputed lattice: good for the trends,
not the last ten per cent.
