---
title: The day and the look
description: "Humidity, altitude and temperature, and how the vapor is lit and photographed."
---

## The air

```tsx
<WingVapor
  air={{
    altitudeM: 300,
    temperatureOffsetK: 10, // a warm day
    relativeHumidity: 0.9,
  }}
/>
```

Everything comes down to the humidity. The cooling a wing or a vortex makes is
tens of kelvin at most, so at 30 % on a warm day nothing fogs, and at 95 % a
gentle pull trails its tips. The altitude and the temperature offset set the
International Standard Atmosphere's pressure, temperature and density, and so
the speed of sound the Mach number is measured against.

Where to start, low over the sea on a warm day:

| to see                | humidity     | flight                             |
| --------------------- | ------------ | ---------------------------------- |
| tip trails            | 0.85 to 0.95 | a hard pull, 5 to 7 g at Mach 0.5  |
| leading-edge vortices | 0.85 to 0.95 | a slow, high-alpha pull on a delta |
| the shock on the wing | 0.5 to 0.7   | a pull at Mach 0.9 to 0.95         |
| the vapor cone        | 0.7 to 0.85  | Mach 0.95 to 1.05                  |

## The look

Vapor is white because it scatters, not because it is given a colour. What it
looks like is the sun's and the sky's light, scattered by droplets of a given
size:

```tsx
<WingVapor
  look={{
    sunDirection: [5, 10, 5], // towards the sun, in world space
    sunIntensity: 3,
    skyColor: [0.55, 0.68, 0.9],
    dropletRadiusM: 1e-6,
    shutterS: 1 / 60,
  }}
/>
```

- **`sunDirection`** should match your scene's sun, so the cloud is lit as
  the skin is.
- **`dropletRadiusM`**: vapor that forms in a millisecond makes many tiny
  droplets, around a micron. Smaller is denser for the same water.
- **`humiditySpread`** and **`eddyM`**: how unevenly moist the air is, and
  how large its patches are. They break a sheet into patches.
- **`shutterS`**: the air goes past at the airspeed, so the patches streak
  along the flow by what it travels while the shutter is open. At 300 m/s and
  a sixtieth, five metres. The streaks are what make the vapor read as fast.
- **`anisotropy`**: a micron droplet throws most of the light forward, the
  silver of vapor seen against the sun.

Every field is in the [reference](../../reference/dials/).

## Which phenomena

`effects` switches each one on or off:

```tsx
<WingVapor effects={{ cone: false, selfShadow: false }} />
```

It is compiled into the shader, so changing it rebuilds the material.
