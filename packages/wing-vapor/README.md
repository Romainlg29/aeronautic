# r3f-wing-vapor

Physically based **wing vapor** for [React Three Fiber](https://r3f.docs.pmnd.rs)
and three.js, written in TSL for three's `WebGPURenderer`.

Four phenomena, from one pressure field:

- **Tip vortex trails** in a hard pull, streaming back along the free stream,
  rolling inboard and spreading until they no longer fog.
- **Leading-edge vortices** over a swept wing at high angle of attack, bursting
  where vortex breakdown has reached.
- **Vapor over the wing**: the suction of the upper surface in a pull, and once
  the flow over it goes supersonic, a rooftop ending in a **shock** that cuts
  the cloud off in a hard edge, marching aft as the speed climbs.
- **The vapor cone** (the "Prandtl–Glauert cloud") near Mach one: the
  transonic pocket round the fuselage, ended by the shock behind it.

None of it is drawn to a shape. The package works out the pressure round the
aircraft from its planform, its airspeed and its angle of attack, expands the
day's moist air through that pressure field, and draws cloud wherever the air
passes its dew point. Dry air stays clear however hard the pull, and in humid
air a gentle turn trails its tips.

**[Live example on the docs' fighter](https://romainlg29.github.io/afterburner/docs/examples/wing-vapor/)**

## Install

```bash
pnpm add r3f-wing-vapor
```

The same peer dependencies as `r3f-afterburner`: `react` 19, `three` 0.186.x and
`@react-three/fiber` 9 (or 10). It needs a `WebGPURenderer`, which falls back to
WebGL 2 by itself. It doesn't run on the classic `WebGLRenderer`.

## Quick start

`<WingVapor>` is a group where the aircraft's reference point sits. Put it
inside the model, and give it the airframe, the flight and the day:

```tsx
import { WingVapor } from "r3f-wing-vapor";

const Jet = () => (
  <group>
    <JetModel />
    <WingVapor
      // The model flies along its local -Z, with +Y up (the defaults)
      forward={[0, 0, -1]}
      airframe={{
        span_m: 14,
        root_chord_m: 9.2,
        tip_chord_m: 1.6,
        leading_edge_sweep_rad: (55 * Math.PI) / 180,
        apex_m: -5.66, // the leading edge meets the centreline 5.66 m ahead
      }}
      flight={{ airspeed_m_s: 170, angle_of_attack_rad: 0.35 }}
      air={{ altitude_m: 300, relative_humidity: 0.9 }}
      look={{ sun_direction: [5, 10, 5] }}
    />
  </group>
);
```

The flight changes every frame in a real scene. Write it through the ref, which
costs no React render:

```tsx
const vapor = useRef<WingVaporCore>(null);

useFrame(() => {
  vapor.current?.update_flight({ airspeed_m_s, angle_of_attack_rad });
});

<WingVapor ref={vapor} airframe={airframe} />;
```

A flight model usually knows the load factor, not the angle of attack.
`angle_of_attack_for_load(airframe, g, airspeed, air)` inverts the lift curve
for it.

Without React, `WingVaporCore` is the same thing: add `vapor.mesh` to the scene
and set `vapor.object` to the object it follows.

## Any shape: capture it

Rather than typing the planform in, let the package measure the model:

```tsx
const { scene } = useGLTF("/jet.glb");

<group>
  <primitive object={scene} />
  <WingVapor
    capture={scene}
    // Not the shape the air flies round
    capture_filter={(mesh) => !/Gear|Pylon|Missile/.test(mesh.name)}
    flight={flight}
    air={air}
  />
</group>;
```

`capture` takes six orthographic depth views of the model, from above and
below, ahead and astern, and either side, at 128 pixels along its longest side.
They're rasterised on the CPU, so they need no renderer and come out the same
everywhere: tens of milliseconds for a few hundred thousand triangles, once.
From them it measures:

- **every station of the wing** across the span: its leading and trailing
  edges, its thickness and its mid-plane's height. A cranked delta keeps its
  crank. A tailplane or canard at the same stations is told apart from the wing
  by the clear air between them, and a fin standing on the wing by how tall it
  is;
- **where the wing meets the body**: where the leading edge leaps forward to the
  nose, or the section gets far thicker for its chord;
- **the spanwise loading**, from a Weissinger vortex lattice on the measured
  planform;
- **the body**, as the round body of the same largest cross-section, for the
  cone.

The field reads the wing as that table, station by station, so the vapor sheet
follows the real planform and the tip vortices leave from the real tips. The
measured planform is also fitted with straight edges, into `airframe`, for the
lift and breakdown correlations. The aircraft's mass and how sharp its leading
edge is can't be seen in depth views, so they stay as given.

Without React: `vapor.capture(model, options)`, or `capture_airframe(model,
options)` for the measurement alone. Depth views only see the outside, which
is what the air sees too: an intake duct changes nothing a cloud forms in.

## The dials

They split four ways, the way the physics does. Every one is a physical
quantity in SI units.

- **`airframe`**: the wing's planform (span, root and tip chords, leading-edge
  sweep, where its apex sits, dihedral, thickness, where it meets the body), the
  fuselage as a body of revolution for the cone, and the mass, for the load
  factor. The defaults are the docs' delta fighter. `capture` fills in all of
  the shape for you.
- **`flight`**: `airspeed_m_s` and `angle_of_attack_rad`.
- **`air`**: `altitude_m`, `temperature_offset_k` and `relative_humidity`.
  Everything comes down to the humidity. The cooling a wing or a vortex makes
  is tens of kelvin at most, so at 30 % on a warm day nothing fogs.
- **`look`**: the sun's direction and colour, the sky's light, the droplets'
  size, how patchy the moisture is, and the shutter, which streaks the patches
  along the flow.

`effects` switches each phenomenon on or off. It is compiled into the shader.

`vapor.state` reports what the physics worked out: the air (dew point, density,
speed of sound), the flight (Mach number, lift coefficient, load factor,
circulation) and every part of the field.

## How it works

1. **The air.** The International Standard Atmosphere, with the vapour on top:
   its partial pressure from the relative humidity, Magnus's saturation
   pressure over liquid water (the droplets are supercooled), the mixing ratio
   and the dew point.
2. **The parcel.** Air swept past a wing has its pressure dropped in well under
   a millisecond, so it expands adiabatically. Past its dew point the vapour
   condenses and gives up its latent heat, which warms the parcel back up and
   holds the cloud to far less water than a dry expansion would. The parcel is
   solved on the moist adiabat, and the water it holds against the pressure
   ratio goes into a small lookup table, made once per day and altitude.
3. **The lift.** DATCOM's lift slope for the attached flow, and Polhamus's
   suction analogy for what a sharp swept leading edge's vortices add. Vortex
   breakdown marches up the wing with the angle of attack, sooner for a less
   swept edge, and the vortex lift goes with it: the stall.
4. **The pressure field**, as four deficits that add:
   - Each **tip vortex** is a Scully vortex holding part of the circulation,
     `Γ = L / ρ V b′`. It trails along the free stream, rolls inboard to π/4 of
     the span, sinks under its own downwash, and its core spreads by turbulent
     diffusion until its pressure well is too shallow to fog. So the trail is
     longer for a heavier pull, a slower aircraft and moister air.
   - Each **leading-edge vortex** is conical, so its core pressure is the same
     all the way along until it bursts. There its core swells and the vapor
     fades into a ragged puff.
   - The **upper surface** carries thin-airfoil theory's suction, the peak at
     the nose handed to the leading-edge vortex once the flow separates off a
     sharp edge, corrected for compressibility with Kármán–Tsien and simple
     sweep theory. Once the suction passes sonic it becomes a supersonic
     rooftop ended by a shock, which stands further aft the faster the flight
     and drops the pressure back to subsonic. In drier air only the pocket
     fogs, and its aft edge is the shock.
   - The **cone** is the fuselage as a slender body. Its transonic pocket keeps
     expanding until the shock that ends it, is felt further out the nearer
     Mach one, and is cut off by the shock. Hence a cone opening aft, soft at
     its front and hard at its back. It fades above about Mach 1.15.

   A linear theory's suction diverges at Mach one, so every deficit is eased
   into what an isentropic expansion to a local Mach 1.4 makes.

5. **The march.** One box round everything that can fog, marched per pixel.
   The field reports how far each point is from anything that could fog, so
   the clear air is skipped. Wherever the pressure is low enough, the table
   gives the liquid water, two octaves of noise make the moisture patchy, and
   the droplets scatter the sun (Henyey–Greenstein, mostly forward) and the
   sky. The blend is premultiplied, as a cloud's is, and the scene's depth
   stops the vapor at the wing it sits on.

The physics is all on the CPU too, in `vapor-field.ts`, where it is tested.
The shader mirrors it node for node.

### Trails that follow the flight

A vortex stays in the air it was shed into while the aircraft flies on, so a
trail is the tip's own path through the air: a curve in a turn, a corkscrew in
a roll. Every frame the vapor records the aircraft's attitude and integrates
its airspeed along its flight path, through the air rather than the world, and
lays both trails back along that history. A model held still in a showcase
trails the same as one flown through a game's world, and a slow frame is split
into steps with the attitude turned evenly between them. The trails go to the
shader as two 64-point polylines in the aircraft's frame now.

### Performance

The CPU side is about a quarter of a millisecond per aircraft per frame: the
flight's state, both trails and the bounds. The capture and the wing's lattice
only run when the shape changes.

On the GPU each pixel of the vapor's box marches, skipping clear air by the
distance the field reports to each part. Two things keep a frame's cost even:

- **Coverage.** Past 15 % of the screen, the steps coarsen as the square root
  of the box's area on screen, up to three times. Up close, the features a step
  resolves are many pixels across anyway.
- **Detail.** Smaller than 6 % of the screen's height, the moisture's patches,
  the dearest part of a sample, are dropped.

`max_steps` caps any one pixel. It hasn't been measured on real hardware yet.
Measure GPU time with `renderer.resolveTimestampsAsync("render")` and
`trackTimestamp: true`, as for the plumes, from the worst view (the camera in
the vapor cone) and the common one.

### What it leaves out

- The field is symmetric left to right for the wing and the leading-edge
  vortices: no sideslip. The tips' trails are each their own.
- The vapor isn't shadowed by itself or by the aircraft.
- The numbers are textbook correlations, good to ten or twenty per cent. That
  is far better than the eye can tell in a cloud that appears or not on a
  degree of dew point. `tip_core_radius`, `tip_core_share` and
  `leading_edge_core_radius` are the empirical ones.

## License

[MIT](LICENSE) © Romain Le Gall
