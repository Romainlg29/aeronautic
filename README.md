# aeronautic

[![CI](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml/badge.svg)](https://github.com/Romainlg29/aeronautic/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Physically based **aircraft effects** for **three.js** and **React Three
Fiber**, raymarched in TSL for WebGPU. Describe the engine, the airframe and
the day: the look comes out of them.

**[Docs and live examples](https://romainlg29.github.io/aeronautic/)**

| Package                                                  | npm                                                                                                                   | What it draws                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`@aeronautic/afterburner`](packages/afterburner#readme) | [![npm](https://img.shields.io/npm/v/@aeronautic/afterburner)](https://www.npmjs.com/package/@aeronautic/afterburner) | Jet afterburners and rocket exhaust plumes                        |
| [`@aeronautic/wing-vapor`](packages/wing-vapor#readme)   | [![npm](https://img.shields.io/npm/v/@aeronautic/wing-vapor)](https://www.npmjs.com/package/@aeronautic/wing-vapor)   | Vortex trails, shock vapor and the vapor cone a wing pulls in air |

Each installs on its own, with the same peers: `react` 19, `three` 0.186 and
`@react-three/fiber` 9. Each release supports one three minor, because TSL
changes between them. Both need three's `WebGPURenderer`, which falls back to
WebGL 2 by itself. They don't run on the classic `WebGLRenderer`.

## Afterburner

![A twin-engined fighter banking, both afterburners lit, rendered with @aeronautic/afterburner](.github/assets/afterburner.gif)

Realistic **jet engine afterburner** and **rocket exhaust plumes**, with
shock diamonds (Mach diamonds), heat haze, soot and eddies. Every plume in a
batch is one instanced draw.

```bash
pnpm add @aeronautic/afterburner
```

`<Afterburner>` is a group where a nozzle sits. The plume streams out along the
group's local **+X**, and every distance is in metres:

```tsx
import { Canvas } from "@react-three/fiber";
import { Afterburner } from "@aeronautic/afterburner";
import { WebGPURenderer } from "three/webgpu";

export const App = () => (
  <Canvas
    gl={async (props) => {
      const renderer = new WebGPURenderer({ ...props, antialias: false });
      await renderer.init();
      return renderer;
    }}
  >
    <Afterburner preset="afterburner" params={{ nozzle_radius_m: 0.5 }} />
  </Canvas>
);
```

Seven presets, from a fighter's reheat to a methalox booster, and physical
params in SI units: the plume's length and its shock spacing come out of them.
Sit it on any node of a loaded model with `target`, shape the exit, and drive
the throttle every frame through a ref.

[Afterburner docs](https://romainlg29.github.io/aeronautic/docs/afterburner/start/introduction/)
· [README](packages/afterburner/README.md)
· [How the plume works](https://romainlg29.github.io/aeronautic/docs/afterburner/how-it-works/the-plume/)

## Wing vapor

![A delta fighter in a hard pull, trailing vapor from both wingtips and over the wing, rendered with @aeronautic/wing-vapor](.github/assets/wing-vapor.gif)

The vapor a wing pulls out of humid air: **tip vortex trails** that follow the
flight path, **leading-edge vortices** over a swept wing, **shock vapor** over
the wing and the **vapor cone** near Mach one. Nothing is drawn to a shape: it
works out the pressure round the aircraft from its planform, its airspeed and
its angle of attack, and expands the day's moist air through it.

```bash
pnpm add @aeronautic/wing-vapor
```

Put `<WingVapor>` at the aircraft's reference point. It can measure the
planform off the model itself:

```tsx
import { useGLTF } from "@react-three/drei";
import { WingVapor } from "@aeronautic/wing-vapor";

export const Jet = () => {
  const { scene } = useGLTF("/jet.glb");

  return (
    <group>
      <primitive object={scene} />
      <WingVapor
        capture={scene}
        flight={{ airspeed_m_s: 170, angle_of_attack_rad: 0.35 }}
        air={{ altitude_m: 300, relative_humidity: 0.9 }}
      />
    </group>
  );
};
```

[Wing vapor docs](https://romainlg29.github.io/aeronautic/docs/wing-vapor/start/introduction/)
· [README](packages/wing-vapor/README.md)
· [How the vapor forms](https://romainlg29.github.io/aeronautic/docs/wing-vapor/how-it-works/the-air/)

## The repository

- [`packages/afterburner`](packages/afterburner): `@aeronautic/afterburner`.
- [`packages/wing-vapor`](packages/wing-vapor): `@aeronautic/wing-vapor`.
- [`apps/docs`](apps/docs): a [Fumadocs](https://fumadocs.dev) site (Next.js,
  exported static) with a section per library: getting started, guides, live
  examples, the reference and how the shaders work. Deployed to GitHub Pages at
  <https://romainlg29.github.io/aeronautic/>.

## Development

```bash
pnpm install
pnpm dev             # the docs and live examples, on http://localhost:3000
pnpm dev:docs        # the same
pnpm test            # vitest
pnpm lint            # oxlint
pnpm fmt             # oxfmt (fmt:check in CI)
pnpm typecheck
pnpm build           # the libraries, with tsdown (Rolldown)
pnpm build:docs      # the docs, into apps/docs/out
```

There's no `pnpm docs` script, because that name is pnpm's own command (it
opens a package's homepage) and would win over the script.

The docs' params, profile and quality pages are generated from the comments in
`packages/afterburner/src/types.ts` by `apps/docs/scripts/reference.ts`, before
every docs build and dev server. Edit the comments, not the pages.

Each live example is a file in `apps/docs/examples/`. Its page runs that file
and shows it as the code, so the two cannot drift.

The fighter in the docs' "On a model" example is
`apps/docs/public/fighter.glb`. It is the Blender export with its meshes
compressed with meshopt and its textures capped at 2048² WebP (2.4 MB, from 6.8),
every node name kept: the plumes sit on its `FX_Exhaust_L` and `FX_Exhaust_R`
empties. drei's `useGLTF` decodes meshopt by itself.

The docs build reads `BASE_PATH` (default `/`) and `REPOSITORY_URL`, which the
Pages workflow sets.

## How it was made

These libraries were written with AI, under human supervision throughout. The AI
wrote much of the code. A human set the direction, reviewed every change,
checked each result in the browser and decided what shipped. The physics, the
look and the API were argued over and reworked until they were right, not
accepted as they first came out.

Performance was the main objective from the start:

- Every plume in a batch is one instanced draw.
- The raymarch runs inside a tight proxy hull, so pixels outside it are never
  shaded.
- Distance tiers cut the steps for plumes far from the camera.
- An optional half-resolution pass covers scenes with many nozzles.

Each of these was measured in GPU time, not FPS, from the worst-case viewpoint
(close up, astern) as well as the common one (abeam).
[Frame budget](https://romainlg29.github.io/aeronautic/docs/afterburner/how-it-works/frame-budget/)
in the docs shows where the time goes.

## Contributing

Bug reports, new presets, performance work and AI-assisted PRs are all
welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks, how to
add a preset and how to measure performance. Report security issues privately,
as [SECURITY.md](SECURITY.md) describes.

The docs deploy on every push to `main`. Releases to npm are
the maintainer's, each package from a tag naming it, `afterburner-v*` or
`wing-vapor-v*` (see "Releasing" in CONTRIBUTING.md).

## License

[MIT](LICENSE) © Romain Le Gall
