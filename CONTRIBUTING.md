# Contributing

Thanks for wanting to help. Bug reports, new presets, performance work, docs
fixes and new examples are all welcome, and so are pull requests written with
an AI assistant. The bar is the same for every PR, however it was made: you've
read it, you understand it, and you've checked it runs.

## Setup

You need Node 22 or later (CI uses 24) and pnpm 11 (`corepack enable` picks
the version from `package.json`).

```bash
pnpm install
pnpm dev        # the docs and live examples, on http://localhost:3000
```

The docs run the library from its source, so an edit to `packages/afterburner`
shows up in the examples straight away, with no build.

## The layout

| Where                            | What                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `packages/afterburner/src`       | The library: components, the batch, presets, and the CPU-side physics      |
| `packages/afterburner/src/tsl`   | The shader, in TSL: the jet, the field, the march                          |
| `packages/wing-vapor/src`        | Wing vapor: moist air, condensation, the lift and its pressure field       |
| `packages/wing-vapor/src/tsl`    | Its shader, in TSL: the same field, node for node                          |
| `packages/contrails/src`         | Contrails: the Schmidt–Appleman criterion, the plume, the ice and the wake |
| `packages/lights/src`            | Lights: the rule's arcs and intensities, flashes, the air, glare, beams    |
| `packages/controls/src`          | Control surfaces, gear and engines: finding parts, mixing, the rig         |
| `packages/core/src`              | The shared flight, the atmosphere and the depth capture                    |
| `apps/docs`                      | The docs site (Fumadocs on Next.js, exported static)                       |
| `apps/docs/examples`             | Each live example. Its page runs the file and shows it as the code         |
| `apps/docs/scripts/reference.ts` | Generates the params, profile and quality reference pages from `types.ts`  |

The docs hold one section per library, `content/docs/afterburner`,
`content/docs/wing-vapor`, `content/docs/contrails`, `content/docs/lights`,
`content/docs/controls`
and `content/docs/core`,
each with its own sidebar. Afterburner's params,
profile and quality pages are generated from the comments in
`packages/afterburner/src/types.ts`. Edit the comments there, not the pages.
Wing vapor's reference is written by hand: change its dials page with
`packages/wing-vapor/src/types.ts`.

## Before you open a PR

Run what CI runs:

```bash
pnpm lint
pnpm fmt          # or fmt:check, which CI uses
pnpm typecheck
pnpm test
pnpm build
pnpm build:docs
```

For anything that changes the picture, open the docs (`pnpm dev`), look at the
affected examples, and check the browser console for shader errors. The tests
cover the CPU side only. A screenshot or a short clip in the PR helps a lot.

## The style

- `snake_case` for functions and variables, `PascalCase` for types and
  components, `SCREAMING_CASE` for constants.
- Comments explain why, in plain sentences, and the physics where there is
  some. Look at `presets.ts` or `plume-profile.ts` for the tone.
- Every distance is in metres and every param is in SI units. A new dial
  should be a physical quantity rather than an artistic knob where it can be.
- Keep the library dependency-free beyond its peers (`three`, `react`,
  `@react-three/fiber`).

oxlint and oxfmt enforce the rest.

## Adding a preset

A preset is an engine. To add one:

1. Add it to `AFTERBURNER_PRESETS` in `packages/afterburner/src/presets.ts`,
   with a comment saying what engine it is and why its numbers are what they
   are: exit Mach from the expansion ratio, temperatures from the propellant,
   and so on. Start from the closest existing preset.
2. Add a row to the presets tables in `README.md`,
   `packages/afterburner/README.md` and
   `apps/docs/content/docs/afterburner/guides/presets-and-propellants.mdx`.
3. Check it in the docs' [Every preset](apps/docs/examples/presets-gallery.tsx)
   example, which picks it up by itself, from abeam and from astern.

Real engines are a great reference for the numbers. Describe them by type in
the comments (a "gas-generator kerosene first stage"), not by product name.

## Performance work

Performance PRs are very welcome. Please include:

- What you measured, where (GPU, browser, resolution) and how: GPU time
  from `renderer.resolveTimestampsAsync("render")` with
  `trackTimestamp: true` on the renderer, not FPS.
- Before and after, from the same viewpoints. Close up astern (the camera in
  the plume, looking up it) is the worst case, and abeam is the common one.
- Screenshots from both, so the look can be compared.

[Frame budget](apps/docs/content/docs/afterburner/how-it-works/frame-budget.md) and
[Hull and tiers](apps/docs/content/docs/afterburner/how-it-works/hull-and-tiers.md) explain
where the time goes today.

## AI-assisted PRs

They're welcome. Please:

- Say so in the PR, and say roughly what the assistant did.
- Read and understand every line before you submit it. You're the author, and
  you'll be the one answering review comments.
- Run the checks and look at the result in a browser yourself. A shader that
  type-checks can still render black.
- Keep the PR focused. One change, with the reasoning in the description, is
  much easier to review than a sweeping refactor.

## three.js versions

The library supports one three minor at a time, capped in its peer range,
because TSL changes between releases. A weekly workflow opens an issue when a
new three is out, with a checklist for testing it and widening the range.
Picking one of those up is a good first contribution.

## Releasing

Only the maintainer publishes to npm, each package from a tag naming it.
[RELEASING.md](RELEASING.md) has the steps: a new version, what to do when a
release run fails, and how to add and first publish a new package.

## Code of conduct

Everyone taking part is expected to follow the
[code of conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
