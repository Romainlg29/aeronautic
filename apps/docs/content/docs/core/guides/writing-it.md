---
title: Writing it
description: "Set the flight from a flight model, a control, or a slider."
---

A flight is written with `set`, which changes the fields given and keeps the
rest. Get it with `useFlightStore` inside a provider:

```tsx
const flight = useFlightStore();

useFrame(() => {
  flight?.set({
    airspeedMPerS: model.speed,
    angleOfAttackRad: model.alpha,
    loadFactor: model.g,
    altitudeM: model.height,
  });
});
```

## What can be written

| field                | unit     | meaning                                          |
| -------------------- | -------- | ------------------------------------------------ |
| `airspeedMPerS`      | m/s      | true airspeed                                    |
| `angleOfAttackRad`   | rad      | positive with the nose above the flight path     |
| `sideslipRad`        | rad      | positive when the air blows from the right       |
| `loadFactor`         | g        | lift over weight: 1 in level flight              |
| `rollRateRadPerS`    | rad/s    | right wing down positive                         |
| `pitchRateRadPerS`   | rad/s    | nose up positive                                 |
| `yawRateRadPerS`     | rad/s    | nose right positive                              |
| `throttle`           | 0 to 1.1 | 0 idle, 1 military power, 1.1 full reheat        |
| `roll`               | −1 to 1  | the stick, right positive                        |
| `pitch`              | −1 to 1  | the stick, aft (nose up) positive                |
| `yaw`                | −1 to 1  | the pedals, right positive                       |
| `flaps`              | 0 to 1   | 1 fully down                                     |
| `airbrake`           | 0 to 1   | 1 fully out                                      |
| `gear`               | 0 to 1   | 1 down                                           |
| `altitudeM`          | m        | above sea level                                  |
| `temperatureOffsetK` | K        | how much warmer the day is than the standard one |
| `relativeHumidity`   | 0 to 1   | as a weather report gives it                     |

A new flight starts as `default_flight_input()`: at rest at sea level, at
military power, gear up, on a standard day at 60 % humidity. Give
`<FlightProvider initial={…}>` or `new Flight({…})` what differs.

## Cheap enough for every frame

`set` compares each field with what it holds. When nothing changed, it does
nothing: no work, no listener called, and the version stays put, so every
effect skips its own work too. Write the whole flight every frame, and only
what moved costs anything.

When something did change, the speeds that follow (Mach, dynamic pressure, the
ram pressure) are worked out again. The air is worked out only when the
altitude, the day's offset or the humidity changed.

## From the UI

A slider writes to the same flight. Outside the Canvas, hold the flight
yourself and hand it to the providers, as in
[Round the HUD too](../one-flight/#round-the-hud-too):

```tsx
<input
  type="range"
  min={0}
  max={1.1}
  step={0.01}
  defaultValue={1}
  onChange={(event) => flight.set({ throttle: event.target.valueAsNumber })}
/>
```

Nothing re-renders: the effects pick it up in their next frame.

## Writes and tracking together

A tracked flight is written by the tracker each frame, before anything reads
it. It only writes what it can see, so `set` the throttle, the controls and the
day as usual. See [Tracking](../tracking/).

Next, [let it watch an object](../tracking/).
