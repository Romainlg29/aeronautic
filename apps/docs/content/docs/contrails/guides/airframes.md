---
title: Airframes
description: "A fighter, an airliner, or yours: the five numbers that set its trails."
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
- **`maxThrustN`** caps it: each engine's sea-level static thrust, in
  newtons, lapsing with the air's pressure at altitude, to 0.36 of it at
  11 km and Mach 0.85. A 9 g pull asks for 21 times the level thrust; the
  default fighter's engines have about 3.9.
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
    // A CFM56-7B's 27 300 lbf, in newtons
    maxThrustN: 121_400,
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
