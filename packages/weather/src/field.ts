import {
  dew_point,
  saturation_pressure,
  standard_atmosphere,
} from "@aeronautic/core";
import {
  adiabatic_profile,
  condensation_level,
  droplet_extinction,
  DROPLET_SPREAD,
  DROPLETS_PER_M3,
  effective_radius,
  ice_extinction,
  ice_share,
  mie_phase,
  rain_extinction,
  saturation_mixing_ratio,
  type CondensationLevel,
  type MiePhase,
} from "./microphysics";
import {
  detail_channels,
  detail_noise,
  DETAIL_CELLS,
  pcg3d,
  perlin_fbm,
  seed_salt,
  shape_channels,
  shape_noise,
  SHAPE_CELLS,
  unit,
} from "./noise";
import type { CloudCell, CloudLayer, WeatherDay } from "./types";

// Where the clouds are, and how much water is in them
//
// Each layer is laid out on the ground first, as a map of columns: at every
// point, how high cloud reaches above the layer's base there, how far inside
// a cloud's footprint it is, how thick an anvil hangs there and how hard it
// rains. A cumuliform layer's columns are its clouds, each a dome over a disc;
// a stratiform layer's a sheet, holed where its cover leaves sky. The noise
// then carves billows into the columns, and the day's adiabat fills them with
// water. The GPU draws from the same map, baked to a texture, and the same
// noise, baked to two; the CPU evaluates both here, at a point
//
// The cumulus are a power law of sizes, as many clouds of each diameter as
// D^-b. They are drawn an octave of sizes at a time, each octave on its own
// grid whose cells are as wide as its largest cloud, so a cloud never leaves
// its cell and a point need look at one cell an octave. Each cell holds a
// cloud with the probability that gives the octave its share of the clouds,
// and the share of the sky the octaves cover together, overlapping at
// random, is the layer's cover

/** The ISA's tropopause, metres: where storms stop rising and spread */
export const TROPOPAUSE_M = 11_000;

/** The earth's mean radius, metres: the layers are shells round it */
export const EARTH_RADIUS_M = 6_371_000;

/** How many heights the water table holds, base to top */
export const TABLE_SIZE = 64;

// How rough a layer's base is, in billows: a cumulus's base is the flat
// condensation level, a sheet's as ragged as its top. Estimates
const BASE_ROUGHNESS = { cumuliform: 0.15, stratiform: 1 } as const;

// Most octaves of sizes a cumuliform layer draws
const MAX_OCTAVES = 5;

/**
 * One octave of a cumuliform layer's sizes, on its grid.
 */
export type SizeOctave = {
  /** Its smallest and largest diameter, metres */
  low: number;
  high: number;

  /** Its grid's spacing, metres: its largest diameter */
  spacing: number;

  /** The chance a cell holds a cloud */
  probability: number;
};

/**
 * A layer, worked out for the day: where it is, how its clouds are laid out,
 * and the water in them by height.
 */
export type ResolvedLayer = {
  layer: CloudLayer;

  /** Its base and its top, metres above sea level */
  baseM: number;
  topM: number;

  /** Its salt, for the map's hashes */
  salt: number;

  /** A cumuliform layer's octaves of sizes */
  octaves: SizeOctave[];

  /** The share of the sky it covers, as near the asked as it can */
  cover: number;

  /** A stratiform layer's coverage noise's threshold, for its cover */
  threshold: number;

  /**
   * By height, base to top: the extinction of the cloud's droplets and of
   * its ice where it holds all its water, per metre, and its ice's share
   */
  table: Float32Array;

  /** Its droplets' Mie phase, for their size mid-cloud */
  phase: MiePhase;

  /** Where its noise starts, in tiles, so no two layers share billows */
  noiseOffset: [number, number, number];
};

/**
 * The integral of D^exponent from low to high.
 * @param low From
 * @param high To
 * @param exponent The power
 * @returns The integral
 */
const integral = (low: number, high: number, exponent: number): number =>
  Math.abs(exponent + 1) < 1e-9
    ? Math.log(high / low)
    : (high ** (exponent + 1) - low ** (exponent + 1)) / (exponent + 1);

/**
 * A cumuliform layer's octaves of sizes, each cell's chance of a cloud set so
 * the octaves, overlapping at random, cover the layer's share of the sky.
 * @param layer The layer
 * @returns The octaves, and the cover they reach
 */
export const size_octaves = (
  layer: CloudLayer,
): { octaves: SizeOctave[]; cover: number } => {
  const [smallest, largest] = layer.diameterM;
  const b = layer.sizeExponent;
  const octaves: SizeOctave[] = [];

  for (
    let high = Math.max(largest, smallest);
    octaves.length < MAX_OCTAVES;
    high /= 2
  ) {
    const low = Math.max(high / 2, smallest);

    octaves.push({ low, high, spacing: high, probability: 0 });

    if (low <= smallest) break;
  }

  // Each octave's cover, per cloud in a cell: the mean of π D² / 4 under
  // D^-b, over the cell's area
  const per_cell = octaves.map(
    ({ low, high, spacing }) =>
      ((Math.PI / 4) * (integral(low, high, 2 - b) / integral(low, high, -b))) /
      (spacing * spacing),
  );

  // How many clouds each octave holds against the others, per area: D^-b
  // over its sizes, so its probability goes as that times its cell's area
  const weight = octaves.map(
    ({ low, high, spacing }) => integral(low, high, -b) * spacing * spacing,
  );

  const covered = (scale: number): number =>
    1 -
    octaves.reduce(
      (open, _, index) =>
        open * (1 - Math.min(scale * weight[index], 1) * per_cell[index]),
      1,
    );

  // The scale that covers the asked share, bisected: no further than every
  // cell holding a cloud
  const asked = Math.min(Math.max(layer.cover, 0), 1);
  let low = 0;
  let high = 1 / Math.min(...weight);

  for (let iteration = 0; iteration < 60; iteration++) {
    const middle = (low + high) / 2;

    if (covered(middle) < asked) low = middle;
    else high = middle;
  }

  for (const [index, octave] of octaves.entries()) {
    octave.probability = Math.min(low * weight[index], 1);
  }

  return { octaves, cover: covered(low) };
};

// The coverage noise's distribution, sampled once: what share of the sky lies
// above each value, so a sheet's threshold gives its cover exactly
let coverage_quantiles: Float64Array | null = null;

/**
 * The coverage noise's value that the given share of the sky lies above.
 * @param cover 0 to 1
 * @returns The threshold
 */
const coverage_threshold = (cover: number): number => {
  if (cover >= 1) return -Infinity;
  if (cover <= 0) return Infinity;

  if (!coverage_quantiles) {
    const count = 4096;
    const salt = seed_salt(0x5eed);
    const values = new Float64Array(count);

    for (let index = 0; index < count; index++) {
      const h = pcg3d(index, 0x51, 0xc0);

      values[index] = perlin_fbm(
        unit(h[0]) * 64,
        0.5,
        unit(h[1]) * 64,
        64,
        salt,
      );
    }

    coverage_quantiles = values.sort();
  }

  const at = (1 - cover) * (coverage_quantiles.length - 1);
  const index = Math.floor(at);
  const next = Math.min(index + 1, coverage_quantiles.length - 1);

  return (
    coverage_quantiles[index] +
    (coverage_quantiles[next] - coverage_quantiles[index]) * (at - index)
  );
};

// How far the coverage noise rises from a sheet's edge to its full depth, in
// the noise's own units: a few tenths of its spread. An estimate
const COVERAGE_BAND = 0.05;

// The coverage noise's period, in its cells: far more than any map spans
const COVERAGE_PERIOD = 4096;

/**
 * The air at an altitude on the day.
 * @param altitude_m Metres above sea level
 * @param day The day
 * @returns Its temperature, kelvin
 */
export const day_temperature = (altitude_m: number, day: WeatherDay): number =>
  standard_atmosphere(altitude_m).temperatureK + day.temperatureOffsetK;

/**
 * Where the day's air saturates, lifted from the ground.
 * @param day The day
 * @returns The lifted condensation level
 */
export const day_condensation = (day: WeatherDay): CondensationLevel => {
  const surface_k = day_temperature(day.groundM, day);
  const humidity = Math.min(Math.max(day.surfaceHumidity, 0.01), 1);
  const dew_k = dew_point(humidity * saturation_pressure(surface_k));

  return condensation_level(surface_k, dew_k, day.groundM);
};

/**
 * A layer, worked out for the day.
 * @param layer The layer
 * @param day The day
 * @param seed The weather's seed
 * @param index Its place in the sky, its seed if it has none
 * @returns It, resolved
 */
export const resolve_layer = (
  layer: CloudLayer,
  day: WeatherDay,
  seed: number,
  index: number,
): ResolvedLayer => {
  // The base: the condensation level, or where it was put, saturated there
  const level: CondensationLevel =
    layer.baseM === "condensation"
      ? day_condensation(day)
      : (() => {
          const temperature = day_temperature(layer.baseM, day);

          return {
            altitudeM: layer.baseM,
            temperatureK: temperature,
            mixingRatio: saturation_mixing_ratio(temperature, layer.baseM),
          };
        })();

  const base_m = level.altitudeM;
  const top_m =
    layer.depthM === "tropopause"
      ? Math.max(TROPOPAUSE_M, base_m + 500)
      : base_m + Math.max(layer.depthM, 1);

  const salt = pcg3d(seed | 0, (layer.seed ?? index) | 0, 0x2c1b3c6d)[0];

  const { octaves, cover } =
    layer.form === "cumuliform"
      ? size_octaves(layer)
      : { octaves: [], cover: Math.min(Math.max(layer.cover, 0), 1) };

  // The water by height: the adiabat's, the share the cloud keeps, split
  // between droplets and ice by the temperature
  const profile = adiabatic_profile(level, top_m, TABLE_SIZE);
  const droplets = DROPLETS_PER_M3[layer.airMass];
  const spread = DROPLET_SPREAD[layer.airMass];
  const table = new Float32Array(TABLE_SIZE * 4);
  let mid_water = 0;

  for (let step = 0; step < TABLE_SIZE; step++) {
    const water = profile.waterKgPerM3[step] * layer.adiabaticFraction;
    const ice = ice_share(profile.temperatureK[step]);

    table[step * 4] = droplet_extinction(water * (1 - ice), droplets, spread);
    table[step * 4 + 1] = ice_extinction(water * ice, layer.iceSizeM);
    table[step * 4 + 2] = ice;

    if (step === TABLE_SIZE >> 1) mid_water = water * (1 - ice);
  }

  const noise = pcg3d(salt, 0x1d, 0x7f);

  return {
    layer,
    baseM: base_m,
    topM: top_m,
    salt,
    octaves,
    cover,
    threshold:
      layer.form === "stratiform" ? coverage_threshold(cover) : -Infinity,
    table,
    phase: mie_phase(
      2 * effective_radius(Math.max(mid_water, 1e-5), droplets, spread),
    ),
    noiseOffset: [unit(noise[0]), unit(noise[1]), unit(noise[2])],
  };
};

/**
 * One cloud of a cumuliform layer: a dome on a disc, its anvil if it has
 * one, and its rain.
 */
export type Cloud = {
  /** Its centre, in its layer's air, metres */
  x: number;
  z: number;

  /** Its radius at its base, metres */
  radius: number;

  /** How high it reaches above the base, metres */
  height: number;

  /** How square its top is */
  crown: number;

  /** Its anvil's centre, radius and thickness, if it has one */
  anvil: { x: number; z: number; radius: number; thickness: number } | null;

  /** How hard it rains at its core, mm/h */
  rain: number;
};

const scratch_hash: [number, number, number] = [0, 0, 0];

/**
 * A cloud, its anvil and its rain, from its size and where it is.
 * @param resolved Its layer
 * @param x Its centre
 * @param z Its centre
 * @param diameter Its diameter
 * @param cell A cloud placed by hand, for what it overrides
 * @returns The cloud
 */
const make_cloud = (
  resolved: ResolvedLayer,
  x: number,
  z: number,
  diameter: number,
  cell?: CloudCell,
): Cloud => {
  const { layer, baseM, topM } = resolved;
  const depth = topM - baseM;
  const height = Math.min(
    cell?.topM !== undefined ? cell.topM - baseM : layer.aspect * diameter,
    depth,
  );

  // An anvil only where the tower reached the stable air at the top
  let anvil: Cloud["anvil"] = null;

  if (layer.anvil && height >= depth * 0.95) {
    const radius =
      (cell?.anvilDiameterM ??
        (layer.anvil.diameterM * diameter) / layer.diameterM[1]) / 2;
    const [wx, wz] = layer.windMPerS;
    const speed = Math.hypot(wx, wz) || 1;
    const drift = layer.anvil.drift * radius;

    anvil = {
      x: x + (wx / speed) * drift,
      z: z + (wz / speed) * drift,
      radius,
      thickness: Math.min(layer.anvil.thicknessM, depth * 0.5),
    };
  }

  return {
    x,
    z,
    radius: diameter / 2,
    height,
    crown: layer.crown,
    anvil,
    rain: cell?.rainMmPerH ?? layer.rainMmPerH,
  };
};

/**
 * The cloud in one cell of an octave's grid, if there is one.
 * @param resolved The layer
 * @param octave Which octave
 * @param i The cell
 * @param j The cell
 * @returns The cloud, or null
 */
export const cell_cloud = (
  resolved: ResolvedLayer,
  octave: number,
  i: number,
  j: number,
): Cloud | null => {
  const { low, high, spacing, probability } = resolved.octaves[octave];
  const first = pcg3d(
    i | 0,
    j | 0,
    (resolved.salt ^ (octave * 0x27d4eb2f)) >>> 0,
    scratch_hash,
  );

  if (unit(first[0]) >= probability) return null;

  // Its size from the octave's power law, by the inverse of its distribution
  const b = resolved.layer.sizeExponent;
  const u = unit(first[1]);
  const diameter =
    Math.abs(b - 1) < 1e-9
      ? low * (high / low) ** u
      : (low ** (1 - b) + u * (high ** (1 - b) - low ** (1 - b))) **
        (1 / (1 - b));

  // Anywhere in its cell it fits
  const second = pcg3d(first[2], first[0], 0x165667b1, scratch_hash);
  const radius = diameter / 2;
  const room = spacing - diameter;

  return make_cloud(
    resolved,
    i * spacing + radius + unit(second[0]) * room,
    j * spacing + radius + unit(second[1]) * room,
    diameter,
  );
};

/**
 * A column of a layer: what the map holds at a point.
 */
export type Column = {
  /** How high cloud reaches above the base, metres */
  height: number;

  /**
   * How steep the dome that sets the height is there, metres up a metre
   * across: 0 on a flat top, more and more towards a wall
   */
  slope: number;

  /** How thick an anvil hangs under the top, metres */
  anvil: number;

  /** How hard it rains, mm/h */
  rain: number;
};

// A wall steeper than this is a wall: a half float holds it
export const SLOPE_MAX = 1000;

/**
 * How steep a cloud's dome is at a point of its footprint: of h = H u^k, with
 * u = 1 − r² / R² and k = 1 / crown, |dh/dr| = 2 H k (r / R) u^(k − 1) / R.
 * @param cloud The cloud
 * @param r2 The point's r² / R²
 * @returns Metres up a metre across
 */
export const dome_slope = (cloud: Cloud, r2: number): number => {
  const k = 1 / cloud.crown;
  const u = Math.max(1 - r2, 1e-9);

  return Math.min(
    (2 * cloud.height * k * Math.sqrt(r2) * u ** (k - 1)) / cloud.radius,
    SLOPE_MAX,
  );
};

/**
 * Lay one cloud's column over a point's.
 * @param column The point's, updated
 * @param cloud The cloud
 * @param x The point
 * @param z The point
 */
export const add_cloud = (
  column: Column,
  cloud: Cloud,
  x: number,
  z: number,
): void => {
  const dx = x - cloud.x;
  const dz = z - cloud.z;
  const r2 = (dx * dx + dz * dz) / (cloud.radius * cloud.radius);

  if (r2 < 1) {
    const bump = 1 - r2;

    // A dome: cloud where the bump is above the height to the crown's power
    const height = cloud.height * bump ** (1 / cloud.crown);

    if (height > column.height) {
      column.height = height;
      column.slope = dome_slope(cloud, r2);
    }

    // Rain under its core, hardest at the centre
    column.rain = Math.max(column.rain, cloud.rain * bump * bump);
  }

  const { anvil } = cloud;

  if (anvil) {
    const ax = x - anvil.x;
    const az = z - anvil.z;
    const a2 = (ax * ax + az * az) / (anvil.radius * anvil.radius);

    // A lens, thickest at its centre
    if (a2 < 1) {
      column.anvil = Math.max(
        column.anvil,
        anvil.thickness * Math.sqrt(1 - a2),
      );
    }
  }
};

/**
 * How far a cloud's column can reach from its centre, anvil and all.
 * @param cloud The cloud
 * @returns Metres
 */
export const cloud_reach = (cloud: Cloud): number =>
  cloud.anvil
    ? Math.max(
        cloud.radius,
        Math.hypot(cloud.anvil.x - cloud.x, cloud.anvil.z - cloud.z) +
          cloud.anvil.radius,
      )
    : cloud.radius;

/**
 * The clouds placed by hand, as clouds.
 * @param resolved The layer
 * @returns Them
 */
export const hand_clouds = (resolved: ResolvedLayer): Cloud[] =>
  (resolved.layer.cells ?? []).map((cell) =>
    make_cloud(resolved, cell.at[0], cell.at[1], cell.diameterM, cell),
  );

/**
 * A stratiform layer's column at a point.
 * @param resolved The layer
 * @param x The point, in its air
 * @param z The point
 * @param column Where to write it
 */
export const sheet_column = (
  resolved: ResolvedLayer,
  x: number,
  z: number,
  column: Column,
): void => {
  const { layer, threshold } = resolved;
  const depth = resolved.topM - resolved.baseM;

  let coverage = 1;

  if (threshold > -Infinity) {
    const patch = layer.diameterM[1];
    const value = perlin_fbm(
      x / patch,
      0.5,
      z / patch,
      COVERAGE_PERIOD,
      resolved.salt,
    );

    coverage = Math.min(Math.max((value - threshold) / COVERAGE_BAND, 0), 1);
  }

  column.height = Math.max(column.height, depth * coverage);
  column.rain = Math.max(column.rain, layer.rainMmPerH * coverage);
};

/**
 * A layer's column at one point, as the map holds it.
 * @param resolved The layer
 * @param hand Its clouds placed by hand
 * @param x The point, in the layer's air
 * @param z The point
 * @returns The column
 */
export const layer_column = (
  resolved: ResolvedLayer,
  hand: readonly Cloud[],
  x: number,
  z: number,
): Column => {
  const column: Column = { height: 0, slope: 0, anvil: 0, rain: 0 };

  if (resolved.layer.form === "stratiform") {
    sheet_column(resolved, x, z, column);
  } else {
    for (const [index, octave] of resolved.octaves.entries()) {
      const i = Math.floor(x / octave.spacing);
      const j = Math.floor(z / octave.spacing);

      // An anvil reaches past its cell; the towers never do
      const around = resolved.layer.anvil
        ? Math.ceil(
            (resolved.layer.anvil.diameterM *
              (1 + resolved.layer.anvil.drift)) /
              2 /
              octave.spacing,
          )
        : 0;

      for (let dj = -around; dj <= around; dj++) {
        for (let di = -around; di <= around; di++) {
          const cloud = cell_cloud(resolved, index, i + di, j + dj);

          if (cloud) add_cloud(column, cloud, x, z);
        }
      }
    }
  }

  for (const cloud of hand) add_cloud(column, cloud, x, z);

  return column;
};

/**
 * How the billows erode a column: the noise and the layer's scales, worked
 * out the same on the CPU and the GPU.
 */
export type Erosion = {
  /** The shape's noise, 0 to 1 */
  shape: number;

  /** The detail's noise, 0 to 1 */
  detail: number;
};

/**
 * How much of its water a layer holds at a point: 1 deep in a cloud, 0 out of
 * it, between over its edge.
 *
 * The column's top and base are worn in by the billows: by up to a billow
 * where the shape noise is low, and a detail more where the detail noise is,
 * as cauliflower is. Its edge is a detail wide.
 * @param resolved The layer
 * @param column Its column at the point
 * @param altitude_m The point's altitude
 * @param erosion The noise there
 * @returns 0 to 1
 */
export const layer_density = (
  resolved: ResolvedLayer,
  column: Column,
  altitude_m: number,
  erosion: Erosion,
): number => {
  const { layer, baseM, topM } = resolved;
  const height = altitude_m - baseM;

  const worn_shape = 1 - erosion.shape;
  const worn_detail = (1 - erosion.detail) * layer.detailM;

  let density = 0;

  if (column.height > 0) {
    // A tower is worn a whole billow in, its edge as well as its top: worn
    // less where it is thin, its rim would be left standing. A sheet by at
    // most half its depth, its gaps its cover's
    const reach =
      layer.form === "cumuliform"
        ? layer.billowM
        : Math.min(layer.billowM, column.height * 0.5);
    // How far below the dome the point is, across it, not straight down: a
    // wall is worn in as far as a top
    const under =
      (column.height - height) / Math.sqrt(1 + column.slope * column.slope);
    const top = under - worn_shape * reach - worn_detail;
    const base =
      height -
      worn_shape * reach * BASE_ROUGHNESS[layer.form] -
      worn_detail * BASE_ROUGHNESS[layer.form];

    density = Math.min(Math.max(Math.min(top, base) / layer.detailM, 0), 1);
  }

  if (column.anvil > 0) {
    const below = topM - altitude_m;
    const reach = Math.min(layer.billowM, column.anvil) * 0.5;
    const lens =
      Math.min(below, column.anvil - below) - worn_shape * reach - worn_detail;

    density = Math.max(density, Math.min(Math.max(lens / layer.detailM, 0), 1));
  }

  return density;
};

/**
 * A layer's extinction at a point: its droplets', its ice's and its rain's.
 * @param resolved The layer
 * @param column Its column there
 * @param altitude_m The point's altitude
 * @param density How much of its water it holds there
 * @param ground_m The ground's altitude: rain stops there
 * @returns Per metre: droplets, ice, rain
 */
export const layer_extinction = (
  resolved: ResolvedLayer,
  column: Column,
  altitude_m: number,
  density: number,
  ground_m: number,
): [number, number, number] => {
  const { baseM, topM, table } = resolved;

  let water = 0;
  let ice = 0;

  if (density > 0) {
    const at =
      Math.min(Math.max((altitude_m - baseM) / (topM - baseM), 0), 1) *
      (TABLE_SIZE - 1);
    const index = Math.floor(at);
    const next = Math.min(index + 1, TABLE_SIZE - 1);
    const t = at - index;

    const sigma_water = table[index * 4] * (1 - t) + table[next * 4] * t;
    const sigma_ice = table[index * 4 + 1] * (1 - t) + table[next * 4 + 1] * t;

    // The droplets' extinction goes as their water to the 2/3, their number
    // held; the ice's as its water, its crystals' size held
    water = sigma_water * density ** (2 / 3);
    ice = sigma_ice * density;
  }

  // Rain forms in the cloud and falls out of its base: it is in the cloud,
  // and in the shaft under it, not in the clear air between the billows
  const raining =
    column.rain > 0 &&
    altitude_m > ground_m &&
    (altitude_m < baseM || (density > 0 && altitude_m < baseM + column.height));

  return [water, ice, raining ? rain_extinction(column.rain) : 0];
};

/**
 * Where a point is in a layer's noise, in tiles of its shape's texture and of
 * its detail's: the billows boil up at the updraft, and are drawn out along
 * the wind by the stretch.
 * @param resolved The layer
 * @param x The point, in its air
 * @param altitude_m Its altitude
 * @param z The point
 * @param time_s The weather's clock
 * @returns The shape's coordinates, then the detail's
 */
export const noise_coordinates = (
  resolved: ResolvedLayer,
  x: number,
  altitude_m: number,
  z: number,
  time_s: number,
): [number, number, number, number, number, number] => {
  const { layer, noiseOffset: offset } = resolved;
  const [wx, wz] = layer.windMPerS;
  const speed = Math.hypot(wx, wz);

  let px = x;
  let pz = z;

  if (speed > 0 && layer.stretch !== 1) {
    const ux = wx / speed;
    const uz = wz / speed;
    const along = (px * ux + pz * uz) * (1 / layer.stretch - 1);

    px += ux * along;
    pz += uz * along;
  }

  const py = altitude_m - layer.updraftMPerS * time_s;
  const shape = 1 / (SHAPE_CELLS * layer.billowM);
  const detail = 1 / (DETAIL_CELLS * layer.detailM);

  return [
    px * shape + offset[0],
    py * shape + offset[1],
    pz * shape + offset[2],
    px * detail + offset[2],
    py * detail + offset[0],
    pz * detail + offset[1],
  ];
};

/**
 * The fractional part, as the GPU wraps a repeating texture.
 * @param value Any number
 * @returns 0 to 1
 */
const fract = (value: number): number => value - Math.floor(value);

/**
 * The noise at a point, as the textures hold it: the CPU's evaluation of what
 * the GPU baked.
 * @param coordinates From `noise_coordinates`
 * @param shape_salt The shape texture's salt
 * @param detail_salt The detail texture's salt
 * @returns The erosion
 */
export const erosion_at = (
  coordinates: readonly number[],
  shape_salt: number,
  detail_salt: number,
): Erosion => ({
  shape: shape_noise(
    shape_channels(
      fract(coordinates[0]),
      fract(coordinates[1]),
      fract(coordinates[2]),
      shape_salt,
    ),
  ),
  detail: detail_noise(
    detail_channels(
      fract(coordinates[3]),
      fract(coordinates[4]),
      fract(coordinates[5]),
      detail_salt,
    ),
  ),
});

/**
 * The noise textures' salts, from the weather's seed.
 * @param seed The seed
 * @returns The shape's and the detail's
 */
export const noise_salts = (seed: number): [number, number] => [
  seed_salt(seed),
  seed_salt((seed ^ 0x6a09e667) | 0),
];

/**
 * A point's altitude over the round earth, from where it is in the weather's
 * frame: x and z along the ground at the origin, y its altitude there.
 * @param x The point
 * @param y The point
 * @param z The point
 * @returns Metres above sea level
 */
export const curved_altitude = (x: number, y: number, z: number): number => {
  const up = EARTH_RADIUS_M + y;

  return Math.sqrt(x * x + up * up + z * z) - EARTH_RADIUS_M;
};
