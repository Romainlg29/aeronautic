---
title: Flying it
description: "Drive the flight every frame from a flight model: load factor, roll and sideslip."
---

The vapor comes and goes with the flight. Lift, and with it every vortex and
every suction peak, follows from the airspeed and the angle of attack, so those
are the two dials a scene writes every frame.

## From a shared flight

Inside a [`<FlightProvider>`](../../../core/guides/one-flight/), the vapor
reads the flight's airspeed, angle of attack, sideslip, altitude, day and
humidity on its own, whenever the flight changes, without a React render. The
plumes and the control surfaces read the same flight:

```tsx
const flight = useFlightStore();

useFrame(() => {
  flight.set({
    airspeedMPerS: aircraft.airspeed,
    angleOfAttackRad: aircraft.alpha,
    altitudeM: aircraft.position.y,
  });
});

<WingVapor airframe={airframe} />;
```

The flight wins over `flight` and `air` for what it holds. The altitude is
read to the nearest 10 m, so a climb rewrites the condensation table every
10 m rather than every frame. `source` picks another flight, and
`source={null}` flies only the props.

The flight's sideslip is from the right, as a flight model gives it; the
vapor's own `sideslipRad` is from +Z, the left, so it is turned round on the
way in.

## Through the ref

`<WingVapor>`'s ref is the `WingVaporHandle`, the `WingVapor` class underneath. Its `update*` methods
change the fields given and keep the rest, without a React render:

```tsx
const vapor = useRef<WingVaporHandle>(null);

useFrame(() => {
  vapor.current?.updateFlight({
    airspeedMPerS: aircraft.airspeed,
    angleOfAttackRad: aircraft.alpha,
  });
});

<WingVapor ref={vapor} airframe={airframe} air={air} />;
```

`updateFlight` only works the physics out again when a value changed, so it is
cheap to call every frame. `updateAir` rewrites the condensation table, a few
hundred moist adiabats: fine every frame, but not free. Write it when the
altitude or the humidity actually change.

A prop and the ref drive the same thing. When a prop changes, it wins again.

## From the load factor

A flight model usually knows the g, not the angle of attack.
`angle_of_attack_for_load` inverts the lift curve for it:

```ts
import { moist_air } from "@aeronautic/core";
import { angle_of_attack_for_load } from "@aeronautic/wing-vapor/physics";

const air = moist_air(altitude_m, relative_humidity, temperature_offset_k);
const airspeed_m_s = mach * air.soundMPerS;

const alpha = angle_of_attack_for_load(
  vapor.airframe, // its mass included
  g,
  airspeed_m_s,
  air,
);

vapor.updateFlight({ airspeedMPerS: airspeed_m_s, angleOfAttackRad: alpha });
```

Past the most the wing can lift, it returns the angle of that maximum: the wing
is stalled, and pulls no harder.

If the camera follows the flight path, pitch the model up by that angle: the
nose sits above the path by the angle of attack.

## Rolls and sideslips

A roll loads the wing going down harder than the one coming up, and a sideslip
loads one wing of a swept aircraft more than the other. Each tip's vortex, each
leading-edge vortex and each half of the sheet takes its own side's share, so
the downgoing wing in a rolling pull fogs first and trails longest.

- **`rollRateRadPerS`**: left out, the vapor measures it from how the group it
  follows turns, frame by frame. Give it when your flight model knows it.
- **`sideslipRad`**: positive blows from +Z in the canonical frame (x aft,
  y up, z along the span). None by default.

## The trails follow the flight

A vortex stays in the air it was shed into while the aircraft flies on, so a
trail is the tip's own path through the air: a curve in a turn, a corkscrew in
a roll. The vapor records the attitude of what it follows every frame and
integrates the airspeed along it. You don't have to move the aircraft through
the world for the trails to stream: a model held still in a showcase trails the
same as one flown through a game's world.

## Reading what it worked out

`vapor.state` is everything the vapor is drawn from:

```ts
const { air, flight, visible } = vapor.state;

air.dewPointK; // and the density, the pressure, the speed of sound…
flight.mach;
flight.loadFactor;
flight.lift_coefficient;
flight.breakdown; // how much of the leading-edge vortex is whole, 1 to 0
visible; // whether anything can fog at all
```
