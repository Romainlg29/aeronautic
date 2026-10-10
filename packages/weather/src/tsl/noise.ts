import {
  bitXor,
  Fn,
  Loop,
  float,
  floor,
  int,
  ivec3,
  min,
  shiftRight,
  sqrt,
  uint,
  uvec3,
  vec3,
} from "three/tsl";
import type { Node } from "three/webgpu";

// noise.ts in TSL, line for line, so what the GPU bakes is what the CPU
// evaluates. Each function is a function of the shader's own, with a layout,
// so the 27 cells of a cellular octave are written once however often it is
// called

type F = Node<"float">;
type I = Node<"int">;
type U = Node<"uint">;
type V3 = Node<"vec3">;
type IV3 = Node<"ivec3">;
type UV3 = Node<"uvec3">;

// The bitwise operators on vectors, which WGSL and GLSL have and the types
// leave out
type Bitwise = <T extends Node>(a: T, b: Node) => T;
export const xor = bitXor as unknown as Bitwise;
const shift_right = shiftRight as unknown as Bitwise;

// Loop over several ranges at once, each named, which the types leave out
const loop = Loop as unknown as (...args: unknown[]) => void;

/**
 * Jarzynski and Olano's pcg3d, as noise.ts's `pcg3d`.
 */
export const pcg3d = Fn(([input]: [UV3]) => {
  const v = uvec3(input).mul(uint(1664525)).add(uint(1013904223)).toVar();

  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));

  v.assign(xor(v, shift_right(v, uvec3(16))));

  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));

  return v;
}).setLayout({
  name: "weather_pcg3d",
  type: "uvec3",
  inputs: [{ name: "input", type: "uvec3" }],
}) as unknown as (input: UV3) => UV3;

/**
 * Three hashes as numbers in [0, 1), as noise.ts's `unit`.
 * @param hash The hashes
 * @returns The numbers
 */
export const unit3 = (hash: UV3): V3 =>
  vec3(shift_right(hash, uvec3(8)) as unknown as V3).mul(1 / 16777216) as V3;

/**
 * Hash a cell of a tiling lattice, salted, as noise.ts's `hash_cell`.
 */
const hash_cell = Fn(([cell, period, salt]: [IV3, I, U]) => {
  const wrapped = cell.mod(period).add(period).mod(period);
  const lattice = uvec3(wrapped as unknown as UV3).toVar();

  lattice.z.assign(xor(lattice.z, salt));

  return unit3(pcg3d(lattice));
}).setLayout({
  name: "weather_hash_cell",
  type: "vec3",
  inputs: [
    { name: "cell", type: "ivec3" },
    { name: "period", type: "int" },
    { name: "salt", type: "uint" },
  ],
}) as unknown as (cell: IV3, period: I, salt: U) => V3;

/**
 * Quintic fade, as noise.ts's `fade`.
 * @param t 0 to 1
 * @returns 0 to 1
 */
const fade = (t: V3): V3 =>
  t
    .mul(t)
    .mul(t)
    .mul(t.mul(t.mul(6).sub(15)).add(10)) as V3;

/**
 * Tiling gradient noise, as noise.ts's `perlin`.
 */
export const perlin = Fn(([p, period, salt]: [V3, I, U]) => {
  const cell = floor(p).toVar();
  const f = p.sub(cell).toVar();
  const base = ivec3(cell as unknown as IV3).toVar();

  const corner = (dx: number, dy: number, dz: number) => {
    const g = hash_cell(base.add(ivec3(dx, dy, dz)), period, salt)
      .mul(2)
      .sub(1);

    return g.dot(f.sub(vec3(dx, dy, dz))) as unknown as F;
  };

  const u = fade(f as unknown as V3).toVar();

  const x00 = corner(0, 0, 0).mix(corner(1, 0, 0), u.x);
  const x10 = corner(0, 1, 0).mix(corner(1, 1, 0), u.x);
  const x01 = corner(0, 0, 1).mix(corner(1, 0, 1), u.x);
  const x11 = corner(0, 1, 1).mix(corner(1, 1, 1), u.x);

  return x00.mix(x10, u.y).mix(x01.mix(x11, u.y), u.z);
}).setLayout({
  name: "weather_perlin",
  type: "float",
  inputs: [
    { name: "p", type: "vec3" },
    { name: "period", type: "int" },
    { name: "salt", type: "uint" },
  ],
}) as unknown as (p: V3, period: I, salt: U) => F;

/**
 * Tiling cellular noise, inverted, as noise.ts's `worley`.
 */
export const worley = Fn(([p, period, salt]: [V3, I, U]) => {
  const cell = floor(p).toVar();
  const base = ivec3(cell as unknown as IV3).toVar();
  const nearest = float(1).toVar();

  // Three nested loops, named so the innermost can read the outer two
  loop(
    { start: int(-1), end: int(2), name: "dz" },
    { start: int(-1), end: int(2), name: "dy" },
    { start: int(-1), end: int(2), name: "dx" },
    ({ dx, dy, dz }: { dx: I; dy: I; dz: I }) => {
      const offset = ivec3(dx, dy, dz);
      const feature = vec3(base.add(offset) as unknown as V3)
        .add(hash_cell(base.add(offset), period, salt))
        .sub(p);

      nearest.assign(min(nearest, feature.dot(feature)));
    },
  );

  return float(1).sub(min(sqrt(nearest), 1));
}).setLayout({
  name: "weather_worley",
  type: "float",
  inputs: [
    { name: "p", type: "vec3" },
    { name: "period", type: "int" },
    { name: "salt", type: "uint" },
  ],
}) as unknown as (p: V3, period: I, salt: U) => F;

/**
 * Three octaves of gradient noise, as noise.ts's `perlin_fbm`.
 */
export const perlin_fbm = Fn(([p, period, salt]: [V3, I, U]) => {
  const sum = perlin(p, period, salt)
    .mul(0.5714)
    .add(perlin(p.mul(2), period.mul(2), salt).mul(0.2857))
    .add(perlin(p.mul(4), period.mul(4), salt).mul(0.1429));

  return sum.mul(0.5).add(0.5).clamp(0, 1);
}).setLayout({
  name: "weather_perlin_fbm",
  type: "float",
  inputs: [
    { name: "p", type: "vec3" },
    { name: "period", type: "int" },
    { name: "salt", type: "uint" },
  ],
}) as unknown as (p: V3, period: I, salt: U) => F;

/**
 * Three octaves of cellular noise, as noise.ts's `worley_fbm`.
 */
export const worley_fbm = Fn(([p, period, salt]: [V3, I, U]) =>
  worley(p, period, salt)
    .mul(0.625)
    .add(worley(p.mul(2), period.mul(2), salt).mul(0.25))
    .add(worley(p.mul(4), period.mul(4), salt).mul(0.125)),
).setLayout({
  name: "weather_worley_fbm",
  type: "float",
  inputs: [
    { name: "p", type: "vec3" },
    { name: "period", type: "int" },
    { name: "salt", type: "uint" },
  ],
}) as unknown as (p: V3, period: I, salt: U) => F;

/**
 * Perlin–Worley, as noise.ts's `perlin_worley`.
 * @param p Where, in cells
 * @param period Its period
 * @param salt The seed's salt
 * @returns 0 to 1
 */
export const perlin_worley = (p: V3, period: I, salt: U): F => {
  const billows = worley_fbm(p, period, salt);

  return billows.add(perlin_fbm(p, period, salt).mul(billows.oneMinus())) as F;
};
