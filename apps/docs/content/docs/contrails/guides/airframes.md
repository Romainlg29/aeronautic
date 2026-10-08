---
title: Airframes
description: "A fighter, an airliner, or yours: the numbers that set its trails, and the burner."
---

`airframe` is what the aircraft is, and everything about its trails that is
not the day follows from it:

- **`massKg`** and **`liftToDrag`** set the thrust: in level flight the
  engines push against the drag, the weight over the lift-to-drag ratio.
  Loaded to `n` g, the drag polar of a jet cruising for range,
  parasite drag three times the drag due to lift, makes it `(3 + n²) / 4` of
  that: a quarter less unloaded, the same pushed as pulled.
- **`fuelPerThrust`** turns that thrust into fuel burnt, and sets the
  engines' efficiency, how much of the fuel's heat pushes the aircraft.
- **`dryThrustN`** caps it: each engine's sea-level static thrust dry, at
  military power, in newtons, lapsing with the air's pressure at altitude, to
  0.36 of it at 11 km and Mach 0.85. A 9 g pull asks for 21 times the level
  thrust; the default fighter's engines have about 2.3 dry.
- **`maxThrustN`** is the same with full reheat, what the burner adds to it.
  For an engine with no reheat, give both the same.
- **`spanM`** spaces the wake's vortex pair, which carries the trails down.
- **`engines`** are where the trails start, one each.

## The defaults: a heavy fighter

Twin low-bypass engines close together at the tail, at 20 t and a lift-to-drag
of 9: about 1 g of fuel per metre per engine, a quarter of the fuel's heat
pushing it. The two trails merge into one within a second, drawn together by
the vortices on either side.

## An airliner

```tsx
<Contrails
  airframe={{
    massKg: 70_000,
    spanM: 34,
    liftToDrag: 17,
    // A high-bypass fan at cruise
    fuelPerThrust: 16e-6,
    // A CFM56-7B's 27 300 lbf, in newtons, and no reheat
    maxThrustN: 121_400,
    dryThrustN: 121_400,
    engines: [
      [-5.75, -1.5, 2],
      [5.75, -1.5, 2],
    ],
  }}
  flight={{ airspeedMPerS: 230 }}
/>
```

A third of its fuel's heat pushes it, so its threshold is about a degree warmer
than the fighter's. The engines sit under the wing, far from the centreline,
so the trails stay two for longer before they wrap round the vortices, and
sink with the wake about a hundred metres.

| at 11 km, 112 % over ice | fighter  | airliner |
| ------------------------ | -------- | -------- |
| fuel per metre, each     | 0.99 g   | 1.41 g   |
| efficiency               | 25 %     | 33 %     |
| threshold                | -51.5 °C | -50.6 °C |
| forms behind             | 36 m     | 26 m     |
| width at 1 min, σ        | 9.0 m    | 10.7 m   |
| wake sinks, at most      | 89 m     | 107 m    |

## Reheat

`flight.throttle` runs as a `Flight`'s does and the afterburner reads it: 0 at
idle, 1 at military power, on to 1.1 at full reheat. Dry, the engines hold the
flight, their thrust the drag, whatever the throttle. Past the detent the
burner lights as the afterburner's does, its first zone with a thump and the
rest staging in to the stop, on a core pushed to military power. Its thrust is
then what the burner makes, and its fuel what the burner burns, at reheat's
dearer consumption.

```tsx
<Contrails flight={{ airspeedMPerS: 250, throttle: 1.1 }} />
```

Read from a shared `Flight`, the trail lights with the plume: the throttle
that lights the afterburner lays its fuel's water too.

| the fighter at 11 km, Mach 0.85 | dry, at cruise | full reheat |
| ------------------------------- | -------------- | ----------- |
| thrust, both engines            | 21.8 kN        | 84.1 kN     |
| fuel per metre, each            | 0.99 g         | 6.05 g      |
| efficiency                      | 25 %           | 16 %        |
| threshold                       | -51.5 °C       | -52.4 °C    |
| forms behind                    | 36 m           | 47 m        |
| width at 1 min, σ               | 9.0 m          | 22.1 m      |
| optical depth across, at 1 min  | 0.22           | 0.54        |

Six times the fuel lays six times the water and the soot to freeze it on, in
a plume that mixed with six times the air: two and a half times as wide and as
dense. Less of the heat pushes, so the threshold is a degree colder and the
plume takes longer to cool to it. What is laid while the burner is lit stays
as thick once it goes out, behind the aircraft where it was flown.

## Engines that move

An engine can be an `Object3D`, a node of the model, whose position is read
every frame: a thrust-vectoring nozzle, or a model whose engines are placed
by its own animation.

## What it burns

```tsx
<Contrails fuel="hydrogen" />
```

Hydrogen makes seven times the water for each kilogram, and nearly three times
the heat: its mixing line is twice as steep, so it trails in air seven degrees
warmer than kerosene does. With no soot it seeds a hundred times fewer
crystals, which grow ten times larger from the same air: a trail that dims the
light half as much. Give `{ waterIndex, heatJPerKg, iceIndex }` for any other
fuel.
