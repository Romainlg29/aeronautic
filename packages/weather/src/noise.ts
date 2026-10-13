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

// The shape tile is a few cells across, and a sky of it repeats: a lattice
// of the same clouds to the horizon. Cellular noise of two sets of points is
// that of their union, the nearer of the two, so the tile is read twice, the
// second time turned by the golden angle about the vertical and moved off
// by an irrational step, and the nearer point kept: the two lattices never
// line up again, so neither does the sky. Twice the points in each tile, so
// each is read 2^(1/3) as large, and the cells stay the size they were
export const UNION_SCALE = 2 ** (-1 / 3);
const UNION_TURN = Math.PI * (3 - Math.sqrt(5));
export const UNION_COS = Math.cos(UNION_TURN);
export const UNION_SIN = Math.sin(UNION_TURN);
export const UNION_OFFSET: readonly [number, number, number] = [
  (Math.sqrt(5) - 1) / 2,
  Math.SQRT2 - 1,
  Math.sqrt(3) - 1,
];

/**
 * The shape texture's channels at a point, read as two tiles' union.
 * @param u Where, in tiles, unwrapped
 * @param v Where
 * @param w Where
 * @param salt The seed's salt
 * @returns Its four channels, each the nearer point's
 */
export const shape_union = (
  u: number,
  v: number,
  w: number,
  salt: number,
): [number, number, number, number] => {
  const wrap = (x: number) => x - Math.floor(x);
  const a = shape_channels(
    wrap(u * UNION_SCALE),
    wrap(v * UNION_SCALE),
    wrap(w * UNION_SCALE),
    salt,
  );
  const b = shape_channels(
    wrap((UNION_COS * u - UNION_SIN * w) * UNION_SCALE + UNION_OFFSET[0]),
    wrap(v * UNION_SCALE + UNION_OFFSET[1]),
    wrap((UNION_SIN * u + UNION_COS * w) * UNION_SCALE + UNION_OFFSET[2]),
    salt,
  );

  return [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
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

// How rough a cloud's edge is from scale to scale: the edges of clouds and
// rain areas are fractal over 1 to 1000 km, their perimeter's dimension 1.35
// (Lovejoy 1982), so a billow half the size stands out 2^-(2 - 1.35) = 0.64
// as far. The shape's three cellular octaves, weighted so and summed to 1:
// the inverted cellular noise's level sets are spheres about its feature
// points, so each octave heaps rounded lobes on the last's, as cauliflower
export const ROUGHNESS_EXPONENT = 2 - 1.35;
const OCTAVE = 2 ** -ROUGHNESS_EXPONENT;
const SHAPE_SUM = 1 + OCTAVE + OCTAVE * OCTAVE;
export const SHAPE_WEIGHTS: readonly [number, number, number] = [
  1 / SHAPE_SUM,
  OCTAVE / SHAPE_SUM,
  (OCTAVE * OCTAVE) / SHAPE_SUM,
];

// Where the shape noise's values fall, two tiles' union, its 5th and 95th
// percentiles and its peak over 40 000 points of 16 tiles across. It is
// stretched over 0 to 1 from them, so a billow wears its full reach in and
// a tower is not just worn evenly; it is not clamped, so its strongest
// cores, up to its peak, stand out above the rest
export const SHAPE_SPREAD: readonly [number, number] = [0.436, 0.724];
const SHAPE_PEAK_VALUE = 0.904;

// The detail is the shape's octave ladder carried on: its three octaves
// each twice as fine again, weighted as the shape's are, and the whole a
// further OCTAVE³ down, so the edge is as rough as Lovejoy's from the tile
// down to a cell of the finest. Its median and peak over the same points
const DETAIL_MEDIAN = 0.464;
const DETAIL_PEAK = 0.803;

/** The detail's share of the shape noise, in its stretched units */
const DETAIL_SHARE = OCTAVE ** 3 / (SHAPE_SPREAD[1] - SHAPE_SPREAD[0]);

/** The most the detail lifts the shape noise anywhere */
export const DETAIL_REACH = (DETAIL_PEAK - DETAIL_MEDIAN) * DETAIL_SHARE;

/**
 * The shape noise's peak with its detail: the strongest core in the tile,
 * the one that reaches a cumulus layer's top
 */
export const SHAPE_PEAK =
  remap(SHAPE_PEAK_VALUE, ...SHAPE_SPREAD, 0, 1) + DETAIL_REACH;

/**
 * The shape the clouds' billows take from the shape texture: its three
 * cellular octaves, weighted as cloud edges are rough, stretched over their
 * spread.
 * @param channels The shape texture's four channels
 * @returns 0 to 1 over its 5th to 95th percentiles, its peak above
 */
export const shape_noise = (
  channels: readonly [number, number, number, number],
): number =>
  remap(
    channels[1] * SHAPE_WEIGHTS[0] +
      channels[2] * SHAPE_WEIGHTS[1] +
      channels[3] * SHAPE_WEIGHTS[2],
    ...SHAPE_SPREAD,
    0,
    1,
  );

/**
 * What the detail adds to the shape noise: its three octaves, weighted as
 * the shape's, about their median, at their share.
 * @param channels The detail texture's three channels
 * @returns In the shape noise's units, about 0
 */
export const detail_noise = (
  channels: readonly [number, number, number],
): number =>
  (channels[0] * SHAPE_WEIGHTS[0] +
    channels[1] * SHAPE_WEIGHTS[1] +
    channels[2] * SHAPE_WEIGHTS[2] -
    DETAIL_MEDIAN) *
  DETAIL_SHARE;

/** detail_noise's terms, for the shader: its weights and offset, scaled */
export const DETAIL_TERMS = {
  weights: SHAPE_WEIGHTS.map((w) => w * DETAIL_SHARE) as unknown as readonly [
    number,
    number,
    number,
  ],
  offset: DETAIL_MEDIAN * DETAIL_SHARE,
};

// The salts every texture is baked with: one tile for every seed, the seed
// moving where the sky samples it instead, so the textures are baked once
export const SHAPE_SALT = seed_salt(0x5a17);
export const DETAIL_SALT = seed_salt(0xde7a);

/**
 * Where a seed's sky samples the tiles from: its own offset, 0 to 1 each way.
 * @param seed The seed
 * @returns The offset, in tiles
 */
export const seed_offset = (seed: number): [number, number, number] => {
  const h = pcg3d(seed | 0, 0x2545f491, 0x6c8e9cf5);

  return [unit(h[0]), unit(h[1]), unit(h[2])];
};

// A period so long the field never visibly repeats: 2^16 cells
const UNBOUNDED = 65_536;

/**
 * Smooth noise over the ground and through time, for the air's fields: two
 * octaves of gradient noise, the second half the first's size and weight,
 * scaled so that −1 to 1 is two standard deviations: 95 % of the ground.
 * @param x Where, in the field's cells
 * @param z Where, in its cells
 * @param t When, in its lifetimes
 * @param salt Its own salt
 * @returns About −1 to 1, now and then past
 */
export const field_noise = (
  x: number,
  z: number,
  t: number,
  salt: number,
): number =>
  (perlin(x, z, t, UNBOUNDED, salt) +
    0.5 * perlin(x * 2 + 17.3, z * 2 + 5.1, t * 2, UNBOUNDED, salt)) *
  FIELD_SCALE;

// The two octaves' standard deviation, measured over 720 000 points: 0.2145.
// Its peaks are three and a half times that, so a field's amplitude is what
// it reaches on one ground in twenty, and its extremes are held by its limits
const FIELD_SCALE = 0.5 / 0.2145;

/** The coverage table's entries, from no cover to all of it */
export const COVERAGE_SIZE = 64;

let coverage_table: Float32Array | null = null;

/**
 * Where the shape noise must be cut so that a share of the sky is cloud: its
 * quantiles, measured over the tile. A cover of 0.3 cuts it at its 70th
 * percentile, so 30 % of the sky's base is cloud, as a cover means.
 * @returns The threshold at each cover from 0 to 1, `COVERAGE_SIZE` of them
 */
export const coverage_thresholds = (): Float32Array => {
  if (coverage_table) return coverage_table;

  // Points spread evenly over the sky: the R3 sequence (Roberts 2018), over
  // many tiles across, as the union never repeats, and one period of it
  // up
  const count = 8192;
  const across = 16;
  const values = new Float32Array(count);
  const g = 1.2207440846057596;

  for (let i = 0; i < count; i++) {
    const u = (0.5 + i / g) % 1;
    const v = (0.5 + i / (g * g)) % 1;
    const w = (0.5 + i / (g * g * g)) % 1;

    values[i] = shape_noise(
      shape_union(u * across, v / UNION_SCALE, w * across, SHAPE_SALT),
    );
  }

  values.sort();

  const table = new Float32Array(COVERAGE_SIZE);

  for (let i = 0; i < COVERAGE_SIZE; i++) {
    const cover = i / (COVERAGE_SIZE - 1);
    const at = Math.min(Math.max((1 - cover) * (count - 1), 0), count - 1);

    table[i] = values[Math.round(at)];
  }

  // No cover at all: past the noise's top, so nothing shows
  table[0] = 1.0001;
  coverage_table = table;

  return table;
};

/**
 * The threshold for a cover, from the table.
 * @param cover 0 to 1
 * @returns The shape noise's value a cloud is above
 */
export const coverage_threshold = (cover: number): number => {
  const table = coverage_thresholds();
  const at = Math.min(Math.max(cover, 0), 1) * (COVERAGE_SIZE - 1);
  const i = Math.min(Math.floor(at), COVERAGE_SIZE - 2);

  return table[i] + (table[i + 1] - table[i]) * (at - i);
};
