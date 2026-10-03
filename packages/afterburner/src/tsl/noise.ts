import type { Data3DTexture } from "three";
import { Fn, float, mix, texture3D, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { NOISE_VOLUME_PERIOD, get_noise_volume } from "../noise-volume";

// The noise the plume is made of, as TSL
//
// The eddies and the meander read a small volume of gradient noise baked at
// start up: one fetch an octave, and one for both curves of the meander (see
// noise-volume.ts). The hashed value noise stays for anyone's own hooks
//
// Each of these compiles to one native function, so calling them in a loop
// costs a call rather than another copy of the code

/**
 * A pseudo-random number in [0, 1) from a point, constant across a unit cell.
 * @param cell The point to hash, usually a lattice cell
 * @returns The hash
 */
export const hash_cell = /*@__PURE__*/ Fn(([cell]: [Node<"vec3">]) => {
  const p = cell
    .mul(0.3183099)
    .add(vec3(0.1, 0.2, 0.3))
    .fract()
    .mul(17);

  return p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)).fract();
}).setLayout({
  name: "afterburner_hash_cell",
  type: "float",
  inputs: [{ name: "cell", type: "vec3" }],
}) as unknown as (cell: Node<"vec3">) => Node<"float">;

/**
 * Smoothed value noise, with no grid showing in it.
 * @param point Where to sample it
 * @returns Noise in [0, 1]
 */
export const value_noise = /*@__PURE__*/ Fn(([point]: [Node<"vec3">]) => {
  const cell = point.floor().toVar();
  const offset = point.fract();

  // The smoothstep of the unit interval, which is what kills the lattice
  const eased = offset.mul(offset).mul(offset.mul(-2).add(3)).toVar();

  const corner = (x: number, y: number, z: number) =>
    hash_cell(cell.add(vec3(x, y, z)));

  return mix(
    mix(
      mix(corner(0, 0, 0), corner(1, 0, 0), eased.x),
      mix(corner(0, 1, 0), corner(1, 1, 0), eased.x),
      eased.y,
    ),
    mix(
      mix(corner(0, 0, 1), corner(1, 0, 1), eased.x),
      mix(corner(0, 1, 1), corner(1, 1, 1), eased.x),
      eased.y,
    ),
    eased.z,
  );
}).setLayout({
  name: "afterburner_value_noise",
  type: "float",
  inputs: [{ name: "point", type: "vec3" }],
}) as unknown as (point: Node<"vec3">) => Node<"float">;

// Folded in JavaScript, so the octave count is compiled into the shader
// An octave is eight hashes, so this is the one number that sets what a near
// fragment costs. Two is a plume; three is for a screenshot
/**
 * A few octaves of value noise, summed.
 * @param point Where to sample it
 * @param octaves How many, 1 to 3
 * @returns Noise in [0, 1]
 */
export const turbulence = (point: Node<"vec3">, octaves = 2): Node<"float"> => {
  let eddies = value_noise(point);

  if (octaves > 1) {
    eddies = eddies.mul(0.65).add(value_noise(point.mul(2.17)).mul(0.35));
  }

  if (octaves > 2) {
    eddies = eddies.mul(0.78).add(value_noise(point.mul(4.63)).mul(0.22));
  }

  return eddies;
};

/**
 * Gradient noise from the baked volume: one filtered fetch.
 *
 * Sampled with an explicit level, so it is safe anywhere, a march loop's
 * non-uniform control flow included. One unit of `point` is one noise cell,
 * as it is for `value_noise`.
 * @param point Where to sample it
 * @param volume The volume, `get_noise_volume()` by default
 * @returns Noise in [0, 1], with value noise's mean and spread
 */
export const volume_noise = (
  point: Node<"vec3">,
  volume: Data3DTexture = get_noise_volume(),
): Node<"float"> =>
  texture3D(volume, point.div(NOISE_VOLUME_PERIOD), float(0))
    .r as unknown as Node<"float">;

/**
 * A few octaves of the baked noise, summed: one fetch an octave.
 * @param point Where to sample it
 * @param octaves How many, 1 to 3
 * @param volume The volume, `get_noise_volume()` by default
 * @returns Noise in [0, 1]
 */
export const volume_turbulence = (
  point: Node<"vec3">,
  octaves = 2,
  volume: Data3DTexture = get_noise_volume(),
): Node<"float"> => {
  let eddies = volume_noise(point, volume);

  // Each octave shifted off the last, so their tiles do not line up
  if (octaves > 1) {
    eddies = eddies
      .mul(0.65)
      .add(
        volume_noise(point.mul(2.17).add(vec3(5.3, 1.7, 9.1)), volume).mul(
          0.35,
        ),
      );
  }

  if (octaves > 2) {
    eddies = eddies
      .mul(0.78)
      .add(
        volume_noise(point.mul(4.63).add(vec3(2.9, 7.1, 3.7)), volume).mul(
          0.22,
        ),
      );
  }

  return eddies;
};

// One dimensional value noise strays 0.25 from its mean, the volume 0.184
const WANDER_GRADE = 0.25 / 0.184;

/**
 * Two independent curves of one dimensional noise from the baked volume, for
 * something that only varies along the plume: one fetch for both, against
 * wander_noise's four hashes.
 *
 * Read down a line slanted across the volume, so it does not repeat with the
 * tile, and graded to wander_noise's spread.
 * @param along Where to sample it
 * @param seed Which pair of curves to sample
 * @param volume The volume, `get_noise_volume()` by default
 * @returns Two curves, each about 0.5 with wander_noise's spread
 */
export const volume_wander = (
  along: Node<"float">,
  seed: Node<"float">,
  volume: Data3DTexture = get_noise_volume(),
): Node<"vec2"> =>
  (
    texture3D(
      volume,
      vec3(along, seed.add(along.mul(0.37)), 0.37).div(NOISE_VOLUME_PERIOD),
      float(0),
    ).rg as unknown as Node<"vec2">
  )
    .sub(0.5)
    .mul(WANDER_GRADE)
    .add(0.5);

// Two hashes rather than the eight a 3D lookup costs
// And the right shape as well as the cheap one: a whip moves a cross-section
/**
 * One dimensional value noise, for something that only varies along the plume.
 * @param along Where to sample it
 * @param seed Which of the independent curves to sample
 * @returns Noise in [0, 1]
 */
export const wander_noise = /*@__PURE__*/ Fn(
  ([along, seed]: [Node<"float">, Node<"float">]) => {
    const cell = along.floor().toVar();
    const offset = along.fract();

    const eased = offset.mul(offset).mul(offset.mul(-2).add(3));

    return mix(
      hash_cell(vec3(cell, seed, 0)),
      hash_cell(vec3(cell.add(1), seed, 0)),
      eased,
    );
  },
).setLayout({
  name: "afterburner_wander_noise",
  type: "float",
  inputs: [
    { name: "along", type: "float" },
    { name: "seed", type: "float" },
  ],
}) as unknown as (
  along: Node<"float"> | number,
  seed: Node<"float"> | number,
) => Node<"float">;

/**
 * Value noise centred on zero, in [-1, 1].
 * @param noise Noise in [0, 1]
 * @returns The same, signed
 */
export const signed = (noise: Node<"float">): Node<"float"> =>
  noise.sub(0.5).mul(2);
