// The noise every cloud is carved from, from a seed
//
// One seed makes the same sky everywhere: the GPU bakes this noise into the
// textures it raymarches, and the CPU evaluates the very same functions at a
// point, so what the aircraft flies into is what is drawn. Everything is
// integer hashing, which both do bit for bit alike: Jarzynski and Olano's
// pcg3d (2020), a hash good enough to pass for random with no table to share.
// tsl/noise.ts is this file, line for line, in TSL
//
// The noise tiles, so the textures it is baked into repeat seamlessly: every
// lattice cell is wrapped by the period before it is hashed

/** Three unsigned 32-bit integers */
export type Uint3 = [number, number, number];

/**
 * Jarzynski and Olano's pcg3d: three integers hashed together, each output
 * depending on all three inputs.
 * @param x The first
 * @param y The second
 * @param z The third
 * @param out Where to write it
 * @returns out: three hashes, unsigned
 */
export const pcg3d = (
  x: number,
  y: number,
  z: number,
  out: Uint3 = [0, 0, 0],
): Uint3 => {
  let a = (Math.imul(x >>> 0, 1664525) + 1013904223) >>> 0;
  let b = (Math.imul(y >>> 0, 1664525) + 1013904223) >>> 0;
  let c = (Math.imul(z >>> 0, 1664525) + 1013904223) >>> 0;

  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;

  a = (a ^ (a >>> 16)) >>> 0;
  b = (b ^ (b >>> 16)) >>> 0;
  c = (c ^ (c >>> 16)) >>> 0;

  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;

  out[0] = a;
  out[1] = b;
  out[2] = c;

  return out;
};

// An unsigned integer's top 24 bits as a float in [0, 1): all a float32 holds
// exactly, so the GPU gets the same number
const UNIT = 1 / 16777216;

/**
 * An unsigned hash as a number in [0, 1), as the GPU makes it.
 * @param hash The hash
 * @returns The number
 */
export const unit = (hash: number): number => (hash >>> 8) * UNIT;

/**
 * A seed's own salt: what the noise's lattice is shifted by in the hash, so
 * two seeds share no cell.
 * @param seed Any integer
 * @returns The salt, unsigned
 */
export const seed_salt = (seed: number): number =>
  pcg3d(seed | 0, 0x9e3779b9, 0x85ebca6b)[0];

/**
 * Wrap an integer cell into the period, never negative.
 * @param cell The cell
 * @param period The period, in cells
 * @returns 0 to period − 1
 */
const wrap = (cell: number, period: number): number =>
  ((cell % period) + period) % period;

const scratch: Uint3 = [0, 0, 0];

/**
 * Hash a cell of a tiling lattice, salted.
 * @param x The cell
 * @param y The cell
 * @param z The cell
 * @param period The lattice's period, in cells
 * @param salt The seed's salt
 * @returns Three hashes, in a scratch array
 */
const hash_cell = (
  x: number,
  y: number,
  z: number,
  period: number,
  salt: number,
): Uint3 =>
  pcg3d(
    wrap(x, period),
    wrap(y, period),
    (wrap(z, period) ^ salt) >>> 0,
    scratch,
  );

/**
 * Quintic fade: Perlin's (2002) smootherstep, its slope and curvature zero
 * at both ends.
 * @param t 0 to 1
 * @returns 0 to 1
 */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Tiling gradient noise (Perlin 2002), its gradients hashed per lattice point.
 * @param x Where, in cells
 * @param y Where, in cells
 * @param z Where, in cells
 * @param period Its period, in cells
 * @param salt The seed's salt
 * @returns −1 to 1, about
 */
export const perlin = (
  x: number,
  y: number,
  z: number,
  period: number,
  salt: number,
): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  const corner = (dx: number, dy: number, dz: number) => {
    const h = hash_cell(ix + dx, iy + dy, iz + dz, period, salt);

    // A gradient in the unit cube, centred
    const gx = unit(h[0]) * 2 - 1;
    const gy = unit(h[1]) * 2 - 1;
    const gz = unit(h[2]) * 2 - 1;

    return gx * (fx - dx) + gy * (fy - dy) + gz * (fz - dz);
  };

  const ux = fade(fx);
  const uy = fade(fy);
  const uz = fade(fz);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return lerp(
    lerp(
      lerp(corner(0, 0, 0), corner(1, 0, 0), ux),
      lerp(corner(0, 1, 0), corner(1, 1, 0), ux),
      uy,
    ),
    lerp(
      lerp(corner(0, 0, 1), corner(1, 0, 1), ux),
      lerp(corner(0, 1, 1), corner(1, 1, 1), ux),
      uy,
    ),
    uz,
  );
};

/**
 * Tiling cellular noise (Worley 1996), inverted: 1 at each cell's feature
 * point, falling to 0 a cell away. Its cells are the round billows a
 * cumulus is made of.
 * @param x Where, in cells
 * @param y Where, in cells
 * @param z Where, in cells
 * @param period Its period, in cells
 * @param salt The seed's salt
 * @returns 0 to 1
 */
export const worley = (
  x: number,
  y: number,
  z: number,
  period: number,
  salt: number,
): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let nearest = 1;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const h = hash_cell(ix + dx, iy + dy, iz + dz, period, salt);
        const px = ix + dx + unit(h[0]) - x;
        const py = iy + dy + unit(h[1]) - y;
        const pz = iz + dz + unit(h[2]) - z;

        nearest = Math.min(nearest, px * px + py * py + pz * pz);
      }
    }
  }

  return 1 - Math.min(Math.sqrt(nearest), 1);
};

/**
 * Three octaves of gradient noise, each twice the last's frequency and half
 * its weight, remapped to 0 to 1.
 * @param x Where, in the first octave's cells
 * @param y Where
 * @param z Where
 * @param period The first octave's period
 * @param salt The seed's salt
 * @returns 0 to 1
 */
export const perlin_fbm = (
  x: number,
  y: number,
  z: number,
  period: number,
  salt: number,
): number => {
  const sum =
    perlin(x, y, z, period, salt) * 0.5714 +
    perlin(x * 2, y * 2, z * 2, period * 2, salt) * 0.2857 +
    perlin(x * 4, y * 4, z * 4, period * 4, salt) * 0.1429;

  return Math.min(Math.max(sum * 0.5 + 0.5, 0), 1);
};

/**
 * Three octaves of cellular noise, as Schneider weighs them for clouds
 * (2015): 0.625, 0.25 and 0.125.
 * @param x Where, in the first octave's cells
 * @param y Where
 * @param z Where
 * @param period The first octave's period
 * @param salt The seed's salt
 * @returns 0 to 1
 */
export const worley_fbm = (
  x: number,
  y: number,
  z: number,
  period: number,
  salt: number,
): number =>
  worley(x, y, z, period, salt) * 0.625 +
  worley(x * 2, y * 2, z * 2, period * 2, salt) * 0.25 +
  worley(x * 4, y * 4, z * 4, period * 4, salt) * 0.125;

/**
 * Gradient noise billowed by cellular noise, Schneider's Perlin–Worley: the
 * gradient noise's soft wisps, lifted by the cells into round heaps.
 * @param x Where, in cells
 * @param y Where
 * @param z Where
 * @param period Its period
 * @param salt The seed's salt
 * @returns 0 to 1
 */
export const perlin_worley = (
  x: number,
  y: number,
  z: number,
  period: number,
  salt: number,
): number => {
  const billows = worley_fbm(x, y, z, period, salt);

  return billows + perlin_fbm(x, y, z, period, salt) * (1 - billows);
};

/**
 * Linear remap: where `value` is between `low` and `high`, put between
 * `to_low` and `to_high`.
 * @param value The value
 * @param low From
 * @param high From
 * @param to_low To
 * @param to_high To
 * @returns The remapped value, unclamped
 */
export const remap = (
  value: number,
  low: number,
  high: number,
  to_low: number,
  to_high: number,
): number =>
  to_low + ((value - low) * (to_high - to_low)) / (high - low || 1e-9);

/**
 * The cells per tile of the shape and the detail textures: the shape's red is
 * Perlin–Worley, its other three an octave of cellular noise each, each twice
 * as fine; the detail's three as many octaves, finer still. One octave a
 * channel, as Schneider's (2015), summed into an fbm where they are sampled:
 * the finest has 8 texels a cell, as a cell's rounded heap needs, where a
 * channel's own fbm would alias into cubes
 */
export const SHAPE_CELLS = 4;
export const DETAIL_CELLS = 2;

/**
 * The shape texture's four channels at a point of its tile.
 * @param u Where in the tile, 0 to 1
 * @param v Where
 * @param w Where
 * @param salt The seed's salt
 * @returns Its red, green, blue and alpha
 */
export const shape_channels = (
  u: number,
  v: number,
  w: number,
  salt: number,
): [number, number, number, number] => {
  const c = SHAPE_CELLS;

  return [
    perlin_worley(u * c, v * c, w * c, c, salt),
    worley(u * c, v * c, w * c, c, salt),
    worley(u * c * 2, v * c * 2, w * c * 2, c * 2, salt),
    worley(u * c * 4, v * c * 4, w * c * 4, c * 4, salt),
  ];
};

/**
 * The detail texture's three channels at a point of its tile.
 * @param u Where in the tile, 0 to 1
 * @param v Where
 * @param w Where
 * @param salt The seed's salt, a different one from the shape's
 * @returns Its red, green and blue
 */
export const detail_channels = (
  u: number,
  v: number,
  w: number,
  salt: number,
): [number, number, number] => {
  const c = DETAIL_CELLS;

  return [
    worley(u * c, v * c, w * c, c, salt),
    worley(u * c * 2, v * c * 2, w * c * 2, c * 2, salt),
    worley(u * c * 4, v * c * 4, w * c * 4, c * 4, salt),
  ];
};

// Where the noises' values fall, their 5th and 95th percentiles over 20 000
// points of the tile: the shape's Schneider remap keeps it within 0.78 to
// 0.89, the detail's sum within 0.31 to 0.68. Each is stretched over 0 to 1
// from them, so a billow wears its full reach in and a tower is not just
// worn evenly
export const SHAPE_SPREAD: readonly [number, number] = [0.78, 0.89];
export const DETAIL_SPREAD: readonly [number, number] = [0.31, 0.68];

/**
 * The shape the clouds' billows take from the shape texture: its
 * Perlin–Worley, eroded where its three finer cellular octaves are thin
 * (Schneider 2015), stretched over its spread.
 * @param channels The shape texture's four channels
 * @returns 0 to 1
 */
export const shape_noise = (
  channels: readonly [number, number, number, number],
): number => {
  const fbm = channels[1] * 0.625 + channels[2] * 0.25 + channels[3] * 0.125;
  const value = remap(channels[0], fbm - 1, 1, 0, 1);

  return Math.min(Math.max(remap(value, ...SHAPE_SPREAD, 0, 1), 0), 1);
};

/**
 * The detail texture's channels, summed as one octave each, stretched over
 * their spread.
 * @param channels The detail texture's three channels
 * @returns 0 to 1
 */
export const detail_noise = (
  channels: readonly [number, number, number],
): number => {
  const value = channels[0] * 0.625 + channels[1] * 0.25 + channels[2] * 0.125;

  return Math.min(Math.max(remap(value, ...DETAIL_SPREAD, 0, 1), 0), 1);
};
