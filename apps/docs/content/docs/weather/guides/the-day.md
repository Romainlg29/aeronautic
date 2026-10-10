---
title: The day
description: "The air at the ground, and the clouds that follow from it."
---

A cloud is the day's air lifted until it saturates. `day` is that air, at
the ground:

```tsx
<Weather day={{ temperatureOffsetK: 12, surfaceHumidity: 0.75, groundM: 0 }}>
```

| field                | default | what it is                                                    |
| -------------------- | ------- | ------------------------------------------------------------- |
| `temperatureOffsetK` | `0`     | How much warmer than the ISA's standard day, at every height. |
| `surfaceHumidity`    | `0.7`   | The relative humidity at the ground, 0 to 1.                  |
| `groundM`            | `0`     | The ground's altitude above sea level, metres.                |

From these follow:

- **The base** of every layer whose `baseM` is `"condensation"`: the lifted
  condensation level, about 125 m for every kelvin between the air and its
  dew point (Espy). The default day's is about 680 m; at 50 % humidity it
  is 1.3 km, at 90 % 200 m.
- **The water** in every cloud: what a parcel condenses as it rises on from
  its base along the moist adiabat, times the layer's `adiabaticFraction`.
  Warmer air holds more, so the same cumulus are denser on a warm day.
- **The ice**: below 0 °C a share of the droplets is ice, all of them below
  −38 °C. A warmer day raises the freezing level, and the cloud turns to ice
  higher up.

Inside a `<FlightProvider>`, the flight's air is the same day: see
[flying through](/docs/weather/guides/flying-through).
