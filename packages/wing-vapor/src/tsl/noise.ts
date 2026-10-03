import { Fn, mix, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";

// The noise the moisture is patchy with, as TSL
//
// A hash rather than a texture, so the package carries no assets, and value
// noise because it is eight hashes and a few mixes: the march samples it tens
// of times a fragment, and nothing about a patch of moist air needs better

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
  name: "wing_vapor_hash_cell",
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
  name: "wing_vapor_value_noise",
  type: "float",
  inputs: [{ name: "point", type: "vec3" }],
}) as unknown as (point: Node<"vec3">) => Node<"float">;

/**
 * Two octaves of value noise, centred on zero.
 * @param point Where to sample it
 * @returns Noise in about [-1, 1]
 */
export const patchiness = (point: Node<"vec3">): Node<"float"> =>
  value_noise(point)
    .mul(0.65)
    .add(value_noise(point.mul(2.37).add(vec3(5.2, 1.3, 7.7))).mul(0.35))
    .sub(0.5)
    .mul(2.4);
