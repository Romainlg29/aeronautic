# @aeronautic/controls

Moves a glTF aircraft's control surfaces with its flight, for
[React Three Fiber](https://r3f.docs.pmnd.rs) and three.js. It drives:

- **Ailerons, elevons, stabilators, canards and rudders**, mixed from the stick
  and the pedals.
- **Flaps and leading-edge flaps**. The leading-edge flaps also follow the
  angle of attack.
- **Air brakes, spoilers and split drag rudders.**
- **Thrust vectoring and nozzle petals**: the nozzle opens at idle, closes down
  at military power and opens wide in reheat.
- **Landing gear and gear doors.**
- **The cockpit**: stick, pedals, the throttle lever past its reheat detent,
  and the gear lever.

Each part is a component of its own, so you put in the parts the aircraft has
and change how any of them moves. Each part moves like an actuator. It chases its target at a fixed rate, so a
stick slammed over sweeps the elevons across in a third of a second rather than
a single frame. Clips the model ships with, such as a gear retraction or a
nozzle opening, are scrubbed rather than played, so the doors and legs keep
their authored sequence. The flight is read once each time it changes, and no
frame allocates.

## Install

```bash
pnpm add @aeronautic/controls
```

It installs `@aeronautic/core` with it. The peer dependencies are `three`
0.186.x, plus `react` 19 and `@react-three/fiber` 9 (or 10) for
`@aeronautic/controls/react`.

## Quick start

```tsx
import { FlightProvider, useFlightStore } from "@aeronautic/core/react";
import { ControlSurfaces } from "@aeronautic/controls/react";
import { useGLTF } from "@react-three/drei";

const Jet = () => {
  const gltf = useGLTF("/fighter.glb");

  return (
    <FlightProvider initial={{ gear: 1 }}>
      <primitive object={gltf.scene} />
      <ControlSurfaces object={gltf.scene} animations={gltf.animations} />
      <Pilot />
    </FlightProvider>
  );
};

// Anything that writes the flight moves the model
const Pilot = () => {
  const flight = useFlightStore();

  useFrame(() => {
    flight?.set({ roll: stick.x, pitch: stick.y, yaw: pedals, throttle });
  });

  return null;
};
```

`roll`, `pitch` and `yaw` run from −1 to 1, with right, aft and right pedal
positive. `flaps`, `airbrake` and `gear` run from 0 to 1, where 1 means down,
out and down. `throttle` is 0 at idle, 1 at military power and 1.1 at full
reheat. See `@aeronautic/core` for the whole flight.

## One component per part

`<ControlSurfaces>` is a shortcut for an `<Airframe>` holding
`<FighterControls>`. To choose what moves, and how, put the parts in an
`<Airframe>` yourself. The `<Airframe>` finds the model's parts and moves them
each frame, but drives nothing on its own. Each part component drives the
parts of its kind:

```tsx
import {
  Airframe,
  Airbrakes,
  Cockpit,
  Elevons,
  Engine,
  Gear,
  LeadingEdgeFlaps,
  Rudders,
} from "@aeronautic/controls/react";
import { Afterburner } from "@aeronautic/afterburner";

<Airframe object={gltf.scene} animations={gltf.animations}>
  <Elevons pitch_share={0.7} />
  <Rudders />
  <LeadingEdgeFlaps start_deg={4} />
  <Airbrakes rate={20} />
  <Gear />
  <Cockpit />
  <Engine side="left">
    <Afterburner />
  </Engine>
  <Engine side="right">
    <Afterburner />
  </Engine>
</Airframe>;
```

The parts are `Ailerons`, `Elevators`, `Elevons`, `Stabilators`, `Canards`,
`Rudders`, `Flaps`, `LeadingEdgeFlaps`, `Airbrakes`, `Spoilers`,
`DragRudders`, `Gear`, `Cockpit` and `Engine`. Leave one out and its parts
stay at rest.

Each part takes the same props:

| Prop                       | What it does                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `from(values, part)`       | Where each part should be for a flight, in the part's own terms |
| `rate`                     | How fast it moves, in its unit a second                         |
| `on_move(value, part)`     | Called in the frame a part moves, with its value in its unit    |
| `side`                     | Only the parts on `left`, `right` or `centre`                   |
| `parts`, `group`, `filter` | Other parts: by name, by rig group, or any you pick             |

A `from` answers in the part's own terms:

- A **share of throw** from −1 to 1 for the parts that deflect, positive
  trailing edge down (or right, for a rudder). The part's limits turn it into
  degrees.
- A **share of travel** from 0 to 1 for the parts that open or extend: flaps,
  air brakes, spoilers and drag rudders.
- **Degrees** for the leading-edge flaps.
- **How far down**, 0 to 1, for the gear.

```tsx
// Rudders that also toe in with the air brake
<Rudders
  from={(f, part) => f.yaw + (part.side === "left" ? -0.3 : 0.3) * f.airbrake}
/>
```

The props are read in place each time the flight changes. Changing a `from`
re-renders nothing and re-registers nothing. Only a change to which parts it
takes does.

When two components claim the same part, the more specific one wins. A part
named in `parts` comes first, then one in a `group`, then one picked by its
kind. Setting `side` makes any of them more specific. Between two equally
specific claims, the later one wins. So one rudder can be taken over without
touching the other:

```tsx
<Rudders />
<Drive parts={["CTRL_Rudder_L"]} from={() => -10} />
```

`<Drive>` drives any parts, with a `from` in the part's unit. `<Clip>` scrubs
one of the model's clips from the flight, such as
`<Clip clip="ANIM_Canopy_Open" from={(f) => (f.airspeed_m_s < 5 ? 1 : 0)} />`.

## Engines and thrust vectoring

An `<Engine>` opens its nozzle with the throttle: open at idle, closed down at
military power, wide in reheat. It also turns the nozzle with the stick and the
pedals. What the nozzle can do is read from the model:

- The gimbal's limits are the `min` and `max` of its pitch and yaw parts.
- A `limit_shape` of `ellipse` means pitch and yaw share one round limit, as
  they do on a real nozzle. Full stick with full pedal reaches the circle, not
  its corner.
- `vectoring={{ pitch: 5 }}` caps an axis, within the model's limits.
  `vectoring={false}` holds the nozzle straight.

Whatever sits inside an `<Engine>` sits on its exhaust and turns with the
nozzle. An `<Afterburner>` inside an `<Engine>` also runs at that engine's
throttle, so its plume follows the gimbal with no `target` or `throttle`
needed.

A model with no gimbal can be given one. Pass `vectoring` (`true`, or the
limits) and pivots are put in at the exhaust. The engine's `anchor` then turns
with them.

```tsx
<Engine
  side="left"
  throttle={(f) => f.throttle * 0.95}
  on_vector={(pitch_deg, yaw_deg) => hud.set_nozzle(pitch_deg, yaw_deg)}
>
  <Afterburner />
</Engine>
```

The engine is available from a ref, or from `useEngine()` inside it:

- `vectoring`: the limits per axis, their `shape`, and whether the `gimbal` is
  the model's or `virtual`.
- `pitch_deg` and `yaw_deg`: where the exhaust points now, up and right of
  straight aft.
- `parts`: the `pitch`, `yaw` and `petals` parts.
- `clip`: the nozzle clip.
- `extras`: everything the model says of the gimbal and the exhaust.

## Reading the model's metadata

Every part keeps the extras its rig gave it, and every anchor the model marks
for an effect is found as well. An anchor is a node with an `fx_kind`, or one
named `FX_`, such as an exhaust, a gun's muzzle or a wingtip.

```tsx
const rudder = usePart("CTRL_Rudder_L"); // min, max, rest, positive, extras, node
const muzzle = useAnchor("FX_Gun_Muzzle_R"); // kind, side, extras.rate_rpm_hint, node

<Attach anchor="FX_Gun_Muzzle_R">
  <MuzzleFlash />
</Attach>;
```

`<Attach>` puts its children on a part or an anchor, in its frame, so they move
with it.

## How parts are found

**From a rig, when the model has one.** A `CTRL_` node under a `HINGE_` node
turns about its local X axis. Its glTF extras describe it:

| Extra                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `ctrl_type`          | `rotation` or `translation`                                                   |
| `unit`               | `deg` (the default), `rad`, `m`, or `normalized` with `deg_per_unit`          |
| `min`, `max`, `rest` | Its limits, and the pose it rests in                                          |
| `group`              | What it belongs to, such as `elevons`, `gear` or `canopy`                     |
| `positive`           | Which way a positive value moves it: `trailing_edge_down`, `open`, `retract`… |
| `limit_shape`        | `ellipse` on a nozzle's pitch and yaw, for one round limit                    |

The kind of part comes from the node's name and its group. When a rig labels
the other direction positive, such as `trailing_edge_up`, the part is turned
round. Any other extras, such as a throttle's `ab_detent`, are kept on the
part's `extras`.

**From names, when there is no rig.** Meshes named `Elevon_L`,
`rudder.001`, `LEFlap_Inner_R` and so on are found by their names. Each one's
hinge is fitted to the edge of its geometry that it turns about, and a pivot
group is inserted above the mesh so it turns there. This changes the scene
graph. Pass `names: false` to keep the scene graph unchanged, or `filter` to
skip nodes. Wells, bays, seals and fairings are left alone.

Both kinds of part need the aircraft's frame. By default it flies along −Z
with +Y up. Pass `forward` and `up` for any other model.

## Driving it by hand

The rig is available from the `<Airframe>`'s ref, or from `useAirframe()`.
Values set by hand win over every part component:

```tsx
rig.set("CTRL_Rudder_L", -10); // degrees, over its drive
rig.set("CTRL_Rudder_L", null); // back to its drive
rig.set_group("canopy", 1); // a share of its travel
rig.set_clip("ANIM_Bay_Open", 1); // scrub a clip
rig.value("CTRL_Elevon_Outer_L"); // where it is now
```

Pass `source={null}` to the `<Airframe>` to ignore the flight and drive
everything by hand, or `source={flight}` to follow a flight other than the
provider's. `rates` sets how fast each kind of part moves, over
`default_control_rates()`. `settle` jumps to the flight's pose on the first
read rather than moving there, and is on by default.

## Without React

Each part is a function that adds its drive to a rig and returns it, ready to
`refresh` or `dispose`:

```ts
import {
  ControlRig,
  add_engine,
  elevons,
  fighter_controls,
  rudders,
} from "@aeronautic/controls";

const rig = new ControlRig(scene, { animations, source: flight });

fighter_controls(rig); // or one by one:
elevons(rig, { pitch_share: 0.7 });
rudders(rig, { side: "left", from: (f) => f.yaw * 0.5 });
const engine = add_engine(rig, { side: "left" });

rig.drive({ kinds: ["airbrake"], from: (f, part) => part.max * f.airbrake });

// Each frame
rig.update(delta);
```

`deflect(part, share)` and `travel(part, share)` turn a share into a part's
value, the way the part components do. A drive is resolved when it is added or
removed, never in a frame. A frame reads the flight only when it has changed,
and allocates nothing.

## License

MIT
