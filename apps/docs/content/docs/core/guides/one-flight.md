---
title: One flight for every effect
description: "Wrap an aircraft in a FlightProvider, and every effect in it reads the same flight."
---

Every `@aeronautic` effect looks for the nearest `<FlightProvider>` above it,
and reads its flight where it draws. One provider round an aircraft is all it
takes to fly them together.

```tsx
<FlightProvider initial={{ airspeedMPerS: 240, altitudeM: 6000 }}>
  <primitive object={gltf.scene} />
  <ControlSurfaces object={gltf.scene} animations={gltf.animations} />
  <Afterburner position={[0, 0, 6]} />
  <WingVapor capture={gltf.scene} />
</FlightProvider>
```

## What each effect reads

| effect                                | reads                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `<Afterburner>`, `<AfterburnerBatch>` | the throttle, the altitude, the airspeed and the day's temperature offset                        |
| `<WingVapor>`                         | the airspeed, the angle of attack, the sideslip, the altitude, the day's offset and the humidity |
| `@aeronautic/controls`                | the stick, the pedals, the throttle, the flaps, the air brake, the gear and the angle of attack  |

What a flight gives an effect wins over the effect's own props for the same
thing: an afterburner's `profile.altitudeM` is the flight's altitude inside a
provider. Everything else, such as the plume's look or the vapor's dials, is
still the props'.

## Opting out

Each effect takes a `source` prop. Left out, it is the nearest provider's
flight. Give it a `Flight` to read another one, or `null` to fly on the props
alone:

```tsx
<FlightProvider initial={{ altitudeM: 9000 }}>
  {/* Flies at 9 km */}
  <Afterburner position={[0, 0, 6]} />

  {/* Flies at sea level, on its own throttle */}
  <Afterburner source={null} throttle={0.6} position={[0, 0, -6]} />
</FlightProvider>
```

## Two aircraft

Two providers make two flights. Each effect reads the one round it, so two
aircraft at two altitudes fly through two airs, and their afterburners are
drawn by two batches, one per flight:

```tsx
<FlightProvider initial={{ altitudeM: 500 }}>
  <Jet />
</FlightProvider>
<FlightProvider initial={{ altitudeM: 12_000 }}>
  <Jet />
</FlightProvider>
```

## Round the HUD too

A provider without `track` needs no renderer, so it can sit outside the
`<Canvas>` and wrap the page's UI as well. React's context does not cross into
a Canvas, though, so hand the same flight to a second provider inside it:

```tsx
const [flight] = useState(() => new Flight({ airspeedMPerS: 200 }));

<FlightProvider flight={flight}>
  <Hud />
  <Canvas>
    <FlightProvider flight={flight} track={jet}>
      <Jet ref={jet} />
    </FlightProvider>
  </Canvas>
</FlightProvider>;
```

Both providers hold the one `Flight`: what the scene tracks, the HUD shows. See
it [running](../../examples/one-flight/).

Next, [write to it](../writing-it/).
