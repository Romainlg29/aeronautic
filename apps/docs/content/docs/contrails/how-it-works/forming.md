---
title: Forming
description: "The Schmidt–Appleman criterion: when a mixing exhaust passes water saturation."
---

## The mixing line

An engine burns a kilogram of fuel and puts out its water, 1.23 kg of it for
kerosene, and the share of its heat that did not push the aircraft. As the
exhaust mixes with the air round it, both are diluted by the same air, so in
a diagram of vapour pressure against temperature the mixture moves along a
straight line from the exhaust down to the air. Its slope is

```
G = EI · cp · p / (ε · Q · (1 − η))
```

with `EI` the water per kilogram of fuel, `Q` its heat, `η` the share of it
that pushes the aircraft, `p` the air's pressure, `cp` air's heat capacity
and `ε` water's molar mass over air's. At 11 km, for the docs' fighter, it is
1.4 Pa/K.

## Crossing saturation

Saturation pressure curves upwards with temperature. A steep enough line, wet
enough exhaust in cold enough air, crosses it on the way down: the plume
passes water saturation, droplets form on its soot, and in air this cold they
freeze almost at once. That is the Schmidt–Appleman criterion (Schmidt, 1941;
Appleman, 1953), with Schumann's (1996) correction for the heat that pushes
the aircraft and never warms the plume.

The line first nears the curve where the curve is as steep as it is. From
that tangent temperature the **threshold** follows: the warmest the air can be,
with the vapour it has, for the line to still reach saturation. `schmidt_appleman`
finds the tangent by bisection on Murphy and Koop's saturation curve, and
agrees with Schumann's fit to within a hundredth of a degree.

## Efficiency

The more of the fuel's heat pushes the aircraft, the less is left to warm the
plume, the steeper the line, and the warmer the air it trails in. It follows
from the airframe: in level flight the thrust is the drag, and

```
η = V / (TSFC · Q)
```

for an engine burning `TSFC` kilograms of fuel per newton per second at
airspeed `V`. A fighter's low-bypass engine is about 25 % efficient at
cruise, a modern fan about a third: the airliner's threshold is a degree warmer.

## Where along the plume

The criterion says whether; `plume_formation` says where. It follows the same
mixture out along the plume's measured dilution and finds the dilution where
it first saturates: for the fighter at 11 km, 0.14 s behind the nozzle, 36 m
at cruise. The trail starts there, the clear gap behind every engine.

Its droplets then freeze where the mixture cools past -38 °C, if it is still
saturated over water there to keep them. In air warm enough to be near the
threshold, they may evaporate first: a faint wisp that lasts only as long as
the plume stays saturated over water.
