# @aeronautic/lights

[![npm](https://img.shields.io/npm/v/@aeronautic/lights)](https://www.npmjs.com/package/@aeronautic/lights)
[![CI](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml/badge.svg)](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Physically based **aircraft lights** for [React Three Fiber](https://r3f.docs.pmnd.rs)
and three.js, written in TSL for three's `WebGPURenderer`.

- **Navigation lights**: red to the left, green to the right, white astern,
  over the arcs and with the intensities of the airworthiness rules
  (CS/FAR 25.1385–1397). Seen from outside its arc, a light falls to the
  spill the rule allows.
- **Anti-collision lights**: flashing 40 to 100 times a minute (25.1401). Each
  flash is seen at its **Blondel–Rey** effective intensity, not its peak.
- **Landing and taxi lights**: their beams as photometric cones that light the
  ground, and show in the air through what it scatters.
- **Glare** from the light's real luminance and the exposure: the eye's own
  scatter round a point of light (CIE 146), not a bloom tuned by eye.
- **The air**: haze and molecules dim each light, the blue more than the red,
  with the day's visibility.

None of it is drawn to a size or a timer. How bright a light looks is its
intensity towards the camera, over the distance squared, less what the air
takes, at the scene's exposure.

**[Docs](https://romainlg29.github.io/aeronautic/docs/lights/start/introduction/)** ·
**[Live example on the docs' fighter](https://romainlg29.github.io/aeronautic/docs/lights/examples/at-night/)**

The docs have guides, the live example, the full reference and how the
lights are worked out. This README is the short version.

## Install

```bash
pnpm add @aeronautic/lights @aeronautic/core three@~0.186
```

The same peer dependencies as the other packages: `@aeronautic/core`, `three`
0.186.x, plus `react` 19 and `@react-three/fiber` 9 (or 10) for
`@aeronautic/lights/react`. It needs a `WebGPURenderer`, which falls back to
WebGL 2 by itself. It doesn't run on the classic `WebGLRenderer`. In R3F,
`gl={webgpu_gl()}` from `@aeronautic/core/react` makes one.

## Quick start

`<Lights>` is a group where the aircraft's reference point sits. Put it
inside the model, and say where the lights are:

```tsx
import { useGLTF } from "@react-three/drei";
import { Lights } from "@aeronautic/lights/react";
import { useMemo } from "react";

export const Jet = () => {
  const { scene, nodes } = useGLTF("/jet.glb");

  // Nodes of the model, read every frame, or positions in metres. A lamp
  // points along its node's -Z
  const airframe = useMemo(
    () => ({
      navigation: [
        { side: "left", at: nodes.Nav_L },
        { side: "right", at: nodes.Nav_R },
        { side: "aft", at: nodes.Nav_Tail },
      ],
      anticollision: [
        { at: nodes.Strobe_Top, color: "white" },
        { at: nodes.Beacon_Bottom, color: "red", phaseS: 0.5 },
      ],
      beams: [{ at: nodes.Landing, lamp: "landing", onGear: true }],
    }),
    [nodes],
  );

  return (
    <group>
      <primitive object={scene} />
      <Lights airframe={airframe} air={{ visibilityM: 4000 }} />
    </group>
  );
};
```

`onGear` holds a lamp off until the gear is down: give `gear`, 0 up to 1
down, or let a `<FlightProvider>` from `@aeronautic/core` give it.

The lights are in candela and the scene's light in cd/m²: `look.exposure` is
the number one cd/m² is drawn as. By default it is EV100 3, a floodlit apron
at night; `exposure_ev100` from `@aeronautic/lights/physics` gives it for
another.

## The dials

Each is a physical quantity in SI units:

- **`airframe`**: where the navigation, anti-collision and beam lights are,
  and which lamp each beam is.
- **`switches`**: `navigation`, `anticollision`, `landing` and `taxi`.
- **`navigation`**: how many times the rule's minimum the lights give, how
  much spill past their arcs, and their colours.
- **`anticollision`**: the effective intensity, the flash rate and the
  flash's shape.
- **`air`**: `altitudeM` and `visibilityM`.
- **`look`**: the exposure, the observer's age and eyes, and whether a flash
  is seen by an eye or a camera.
- **`illuminate`**: which lights also light the scene, as three lights.

## How it works

- **The rule.** Each navigation light's intensity is the minimum CS/FAR 25
  sets for the direction it is seen from, in the aircraft's axes, times
  `scale`. Past its arc it falls to the overlap the rule allows. The colours
  are inside the rule's chromaticity boxes.
- **Flashes.** A flash's effective intensity is Blondel and Rey's
  ∫ I dt / (0.2 + t₂ − t₁), over the window that makes it largest. 400 cd
  effective from a xenon tube dying away in 0.2 ms takes a peak of about
  403 000 cd.
- **The air.** Molecules scatter as Rayleigh found, as λ⁻⁴, and a
  continental haze as λ^-1.3, Ångström's exponent. Koschmieder's 3.912 over
  the visibility gives the extinction at 550 nm, the haze's share being what
  the molecules leave.
- **Glare.** CIE 146's glare spread function, for the observer's age and
  eyes, times the illuminance at the eye. It is drawn out to where it falls
  below what the screen shows.
- **Beams.** A lamp's beam is a Gaussian falling to a tenth of the peak at
  half the catalogue's spread. It lights the scene as a spot light, and the
  air is summed along each ray through its cone, with Henyey–Greenstein
  scattering.

### What it leaves out

- The haze between a lamp and the ground it lights: under a per cent at a
  taxi light's distances.
- A lens's flare: the glare is the eye's, with no spikes or ghosts.
- The intensity towards the camera is worked out once a frame, from where the
  camera was when the frame began.
- A page's own bloom, if it has one, adds to the glare.

## License

[MIT](LICENSE) © Romain Le Gall
