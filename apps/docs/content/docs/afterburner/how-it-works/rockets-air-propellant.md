---
title: Rockets, air and propellant
description: "What the rocket presets change, what altitude does, and why colour depends on the mix."
---

## Rockets, and what the presets change

A rocket plume is the same field with different physics leaning on it. A
preset (`src/presets.ts`) is nothing but numbers: the per-nozzle `params`, and
the batch's `profile`.

- **There is no burner.** `burnerThreshold` is 0, and `dryTemperatureK`
  equals `exitTemperatureK`.
- **The exit is faster and the gas lighter.** Exit Mach 3 to 4.5, a molar mass
  of 13 to 23, so the exhaust leaves at two to four kilometres a second against
  a jet's one. The potential core is short, the mixing layer is supersonic (its
  growth falls with the convective Mach number), and the shock spacing is
  longer.
- **The propellant decides the colour and the opacity.** Kerolox is sooty:
  dense and yellow-orange, with an opaque tail that trails smoke. Hydrolox
  exhaust is water vapour: nearly invisible but for the Mach disks and the haze.
  Methalox sits between, a violet band glow and a little soot. A solid booster's
  exhaust is alumina, white and scattering, lit by `skyLight` and
  `sunLight`.

Lengths come from `nozzleRadiusM`, so a preset resized stays the same plume
at a different size. Speeds do not scale, because the gas does not go faster
out of a bigger nozzle.

The world scale of a nozzle's matrix also scales the plume without changing its
look. Lengths are multiplied by it and densities divided by it, so `scale={2}`
on the group draws the same flame twice the size rather than a thicker one.

### Sunlight on the smoke

Sky light comes from everywhere, so it lights smoke evenly. The sun comes from
one way, and `sunLight`, aimed by `sunDirection` (toward the sun,
in world space), adds three things to the particles' scattering:

- **Forward scattering.** A Henyey-Greenstein phase with `g = 0.6`: smoke seen
  against the sun glows, and seen with the sun behind the camera it is dull.
- **Self-shadowing.** The light reaching a point has crossed the plume between
  it and the sun. That depth is not marched. The plume's particles fall off
  across the axis as a Gaussian, so the depth along a straight ray through it
  is closed form, an `erfc` of how far the point is past the axis toward the
  sun. One evaluation a sample, and the side away from the sun goes dark.
- **Light that got there anyway.** Smoke this dense scatters many times. A
  share of the light (30%) is let through a shadow thinned to a quarter, so the
  shadowed side is dim rather than black.

It is zero by default, which is night or a plume lit by the sky alone, and the
`solid_booster` preset turns it on. Give it the direction of the scene's
directional light, and keep it in the units `skyLight` and `exposure` share.

---

## The air, and what altitude does to a plume

`altitudeM`, `temperatureOffsetK` and `airspeedMPerS` replace the old
`ambient_temperature_k`. `standard_atmosphere` is the 1976 ISA to 86 km, with
its eight layers, and isothermal above. `atmosphere(profile)` adds three things.
The day's offset warms the air at the same pressure, so a hot day is a thinner
one. Then the speed of sound, and the ram an inlet recovers: isentropic, less
the MIL-E-5007 loss once supersonic. Each params `pressureRatio` is now **at sea
level, standing still**. The plume works out its own from there:

| Engine | What fixes its exit pressure | So as it climbs                                                                                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rocket | the chamber                  | the ratio climbs as one over the air's pressure, and the plume balloons                                            |
| Jet    | what the inlet swallows      | the ratio stays nearly where it was, as the inlet thins with the air, and it climbs with the ram of flight instead |

Which one an engine is comes out of its own numbers. `breathes` is
`smoothstep(0, 0.2, 1 - dry/exit)`. An engine whose dry and wet exhausts are the
same temperature has no burner, so it is not breathing air.

Six things follow from the ratio and the air.

- **Expansion.** The jet expands to the ambient pressure. The fully expanded
  area grows with the ratio, and the gas thins by
  `u_exit / (expanded_area * u_jet)`. The area is clamped to 0.25–36 of the
  exit, enough for a booster at 30 km. Near the lip, before the first disk, the
  gas has not expanded yet. `expanding` blends the core's temperature from the
  jet's back to the exit's, and its density from thinned back to one, so the
  plume does not start already dilute.
- **Compression.** Behind a Mach disk the normal shock recompresses the gas, by
  its density ratio scaled to the train's strength. `dense` is the
  product of the two, capped at one, and it multiplies the soot, the particles
  and the band emission alike. That is why a high-altitude disk is the brightest
  thing in a plume that is otherwise thin.
- **The swing is multiplicative.** The shock train heats the gas behind each
  disk and cools it in the fan between them. It used to add a fixed number of
  kelvin, which at 30 km swung a ballooning plume's fans below absolute zero
  and made it vanish. It is now `T_a + (T - T_a) * (1 + swing)^cell`, which
  never crosses the ambient.
- **Quench.** The fuel left in the exhaust burns only where there is air to
  burn it in: `quench = ρ(1 + c) / (ρ + c)` with `c = 0.03`. It multiplies
  `afterburningK`, so the bright sheath of a kerosene rocket fades as it
  climbs. It also scales soot burnout: high up there is no oxygen to burn the
  soot, so all of it survives.
- **Soot formation, and why a reheat flame turns blue up high.** A
  hydrocarbon flame's soot grows as about the pressure it burns at to a power of
  one to two. An afterburner burns at roughly the ambient pressure times its
  inlet's ram, so a jet's `sootPerM` is scaled by
  `(pressure * ram)^PLUME_SOOT_PRESSURE_EXPONENT` (1.5, capped at 3), blended in
  by `breathes`. A rocket's chamber sets its own pressure, so its soot stays.
  The yellow-orange of a reheat flame on the runway is nearly all soot
  glowing. Its blue band emission does not depend on the soot. At 9 km, standing,
  the soot is down to about a sixth, and at 250 m/s the ram brings it
  back to about a quarter. The flame turns violet-blue, and its diamonds stay. At
  sea level, standing, the factor is exactly one, so no preset's look there
  has changed. The [altitude sweep](../../examples/altitude/) example flies
  it up and back down.
- **Haze.** The refraction is multiplied by the air's density (Gladstone–Dale),
  so heat shimmer fades with altitude too.

**Airspeed** is coflow. Air already moving with the jet shears it less. The
velocity ratio `λ = U_air / U_jet`, capped at 0.85, scales the mixing layer's
spread by `(1 - λ)/(1 + λ)` and divides the core length by the same. The
convective Mach number uses the difference of the two speeds. A fighter in
cruise therefore draws a longer, tighter plume than the same engine on the
stand.

**Reach** had to change for altitude as well. High up, the first disk stands
tens of metres down a ballooning plume, past where the thermal length would
have cut the plume off. The shortest a plume is now drawn reaches the first
disk plus a cell and a half behind it: `max(8r, (firstDisk + 1.5) * spacing)`.

---

## Propellant, and why the colour depends on the mix

A rocket runs fuel-rich on purpose: lighter exhaust is faster exhaust, and a
cooler chamber is one that survives. The mix is the mass ratio of oxidiser to
fuel (O/F), and it decides most of what the plume looks like. `propellant.ts`
turns `{ fuel, mixtureRatio }` into the params that carry it, through the
equivalence ratio `φ = stoichiometric / OF`. Above one is rich.

| Law                                        | Kerosene | Methane | Hydrogen |
| ------------------------------------------ | -------- | ------- | -------- |
| stoichiometric O/F                         | 3.4      | 4       | 7.94     |
| `sootPerM = k · max(φ - 1, 0)^1.5`, `k`    | 7.5      | 3.3     | 0        |
| `afterburningK = heat · (1 - 1/φ)`, `heat` | 3100     | 5000    | 2850     |

- `sootSurvival = clamp(0.15 + 1.36 (φ - 1.11), 0, 0.95)`. The richer the
  mix, the less oxygen the mixing layer has left to burn the soot with.
- The chamber is hottest a little rich of even, at `φ = 1.05`, and cooler on
  either side: `share = max(1 - 0.45 (φ - 1.05)², 0.4)`.

`propellant_params(propellant, reference)` scales a known engine's own values,
temperatures included, by how far its mix has moved. A preset therefore comes
back exactly at its own mix: kerolox at 2.36, methalox at 3.6, hydrolox at 6.
Without a reference, the soot and afterburning come straight from the laws and
the temperatures are left alone. `resolve_afterburner_params` takes
`propellant` as one more input. It is applied before any explicit param, so an
explicit param still wins.

What this draws: a kerolox engine run at O/F 1.6 is dark and smoky, and all of
its leftover fuel burns in the sheath. At 3.3 it is clean, with a violet band
glow and the diamonds showing through. Altitude then compounds it. The thinner the
air, the less of the leftover fuel and soot it can burn, so a rich engine high
up trails more smoke and less fire.
