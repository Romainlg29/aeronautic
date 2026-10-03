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
- **a canard or a tailplane**: the second run along the chord, ahead of the
  wing or behind it. Its own tips shed their own vortices, along their own
  trails. A canard carries about 1.2 times its share of the area in lift, which
  comes off the wing, so it trails vapor in a hard pull. A tailplane only trims,
  at about 0.15 times its area's share, and rarely fogs;
- **the body**, as the round body of the same largest cross-section, for the
  cone.

The field reads the wing as that table, station by station, so the vapor sheet
follows the real planform and the tip vortices leave from the real tips. The
measured planform is also fitted with straight edges, into `airframe`, for the
lift and breakdown correlations. The aircraft's mass and how sharp its leading
edge is can't be seen in depth views, so they stay as given.

Engine nacelles and pods jutting from the leading or trailing edge are cut
off the wing they hang from: anything narrower than about a seventh of the
semispan that juts from an edge is not the wing the air lifts on.

Depth views only see the outside, which is what the air sees too: an intake
duct changes nothing a cloud forms in.

### Off the main thread, or ahead of time

`<WingVapor capture>` measures a few milliseconds a frame, so a big model
doesn't stall the page; until it is done the vapour flies `airframe` as given.
Without React, `await vapor.capture_async(model, { budget_ms, signal })`, or
`capture_airframe_async` for the measurement alone. `vapor.capture` and
`capture_airframe` are the same, all at once.

Or measure at build time, and ship the numbers in place of the capture:

```ts
// build script, in Node: capture_airframe needs no renderer
const baked = serialize_capture(capture_airframe(model, { filter }));
writeFileSync("jet.vapor.json", JSON.stringify(baked));

// at run time
import baked from "./jet.vapor.json";

<WingVapor measured={deserialize_capture(baked)} />;
```

A bake is versioned: one from a package whose table has changed is refused,
not misread.

### On real models

Besides the docs' fighter, the capture was checked on two models it was never
tuned on: Cesium's twin turboprop (`Cesium_Air.glb`) and Babylon.js's
aerobatic plane. The twin measured 25.7 m across, its wing 4.2 m deep at the
root and 0.8 m at the tip, 7° of sweep, the body 2.25 m out, and a tailplane
5.6 m across; its nacelles were what taught the capture to cut pods off.
Both fly as you would expect: a sheet over the wing in a hard pull in humid
air, and no tip trails. A 900 kg aerobatic plane at 7 g sheds a vortex a tenth
as strong as the fighter's, too weak to fog in 95 % air.

## The dials

They split four ways, the way the physics does. Every one is a physical
quantity in SI units.

- **`airframe`**: the wing's planform (span, root and tip chords, leading-edge
  sweep, where its apex sits, dihedral, thickness, where it meets the body), the
  fuselage as a body of revolution for the cone, and the mass, for the load
  factor. The defaults are the docs' delta fighter. `capture` fills in all of
  the shape for you.
- **`flight`**: `airspeed_m_s` and `angle_of_attack_rad`, and if you have
  them `sideslip_rad` and `roll_rate_rad_s`. Without a roll rate, the vapour
  measures it from how the group it follows turns.
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
     `Γ = L / ρ V b′`. It leaves the tip with a core a few per cent of the
     tip's chord across, holding part of that circulation, and the wake sheet
     rolls up into it over `0.28 AR / C_L` spans (Spreiter and Sacks): within
     a span in a hard pull, several in a gentle one. So the trail starts as a
     thread at the tip and swells as it rolls up. It trails along the free
     stream, rolls inboard to π/4 of the span, sinks under its own downwash,
     and its core spreads by turbulent diffusion until its pressure well is
     too shallow to fog. So the trail is longer for a heavier pull, a slower
     aircraft and moister air.
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
     its front and hard at its back. Past Mach one the pocket is the aft
     body's, ended by the tail's shock, and it fades out between Mach 1.25
     and 1.6, as it is seen to do low down.

   A linear theory's suction diverges at Mach one, so every deficit is eased
   into what an isentropic expansion to a local Mach 1.4 makes.

   A droplet doesn't vanish at a shock: it evaporates in the warmer air behind
   it, in about 3 ms for a micron's radius, which is a metre at 300 m/s. So
   behind the wing's shock and the cone's the field relaxes over that length,
   growing with the droplets' radius squared, and the hard edge has the short
   tail photographs show.

   **Rolls and sideslips** load one wing more than the other. A roll at rate
   `p` raises the angle of attack of the wing going down by `p y / V`, about
   `p s / V` over the angle the whole wing flies at. A sideslip turns the
   leeward wing's sweep against the flow and the windward wing's into it,
   `2β tan Λ` between them for a swept edge. Each tip's vortex, each
   leading-edge vortex and each half of the wing's sheet takes its own side's
   share, so the downgoing wing in a rolling pull fogs first and trails
   longest.

5. **The march.** One box round everything that can fog, marched per pixel.
   The field reports how far each point is from anything that could fog, so
   the clear air is skipped. Wherever the pressure is low enough, the table
   gives the liquid water, two octaves of noise make the moisture patchy, and
   the droplets scatter the sun (Henyey–Greenstein, mostly forward) and the
   sky. The blend is premultiplied, as a cloud's is, and the scene's depth
   stops the vapor at the wing it sits on.

The physics is all on the CPU too, in `vapor-field.ts`, where it is tested.
The shader mirrors it node for node.

### Self-shadowing

At every sample that holds water, three looks at the field towards the sun
(0.4, 1.4 and 4 m out) give the optical depth the sunlight crossed to get
there. The sun's light is split as clouds' is. The droplets' forward peak is
dimmed by e^−τ. What has scattered many times diffuses round the cloud, and is
dimmed only by e^−τ/4. That gives a thick cone its grey underside. The shadow
samples leave out the tip vortices: a tube a metre across shades almost
nothing. `effects.self_shadow` turns it off.

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

- The vapor shades itself, but the aircraft doesn't shade it.
- A roll's and a sideslip's asymmetry is a loading per side, not a
  recomputed lattice: good for the trends, not the last ten per cent.
- No contrails from the engines' exhaust: the afterburner package's plumes
  carry no water yet.
- The numbers are textbook correlations, good to ten or twenty per cent. That
  is far better than the eye can tell in a cloud that appears or not on a
  degree of dew point. `tip_core_radius`, `tip_core_share` and
  `leading_edge_core_radius` are the empirical ones.

## License

[MIT](LICENSE) © Romain Le Gall
