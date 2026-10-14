import type { Climate } from "./climate";
import type { CloudColumn, Prepared } from "./diagnose";
import {
  coverage_threshold,
  coverage_thresholds,
  COVERAGE_SIZE,
  shape_distribution,
  detail_channels,
  detail_noise,
  DETAIL_REACH,
  DETAIL_SALT,
  shape_noise,
  shape_union,
  SHAPE_PEAK,
  SHAPE_SALT,
} from "./noise";
import {
  adiabatic_water,
  air_temperature,
  cirrus_ice,
  droplet_coefficient,
  ice_coefficient,
  ice_share,
  warner_fraction,
} from "./physics";

// How dense each cloud is at a point, and how much light it stops there
//
// Every layer is cut from the same shape noise at the threshold its cover
// sets: the noise's own quantile, so a cover of 0.3 is 30 % of the sky
// (noise.ts's `coverage_thresholds`). Then:
//
// - Cumulus: the threshold rises with the height through the cloud, to the
//   noise's peak at the cumulus's: each cloud as tall as its noise is high
//   above the cut, most shallow and a few deep, as a field's are, and only
//   the strongest core reaching the top the parcel does. Its base is
//   flat, at the condensation level. The stronger its updraft, the higher
//   the threshold stays low: a storm's tower is solid nearly to its top.
// - Stratocumulus and altostratus: sheets, their density falling off to
//   their base and top as 1 − (2h − 1)⁴.
// - Cirrus and anvils: sheets of ice, the cirrus drawn out along the wind.
//
// Near the eye, the detail noise carries the shape's octaves on, down to
// tens of metres, before any of them is cut: it changes where the edge is,
// not only how dense it is.
//
// The density is the share of the cloud's water there, the water its
// layer's table gives at its height: what the parcel condenses, less what
// mixing with the dry air round it takes. The droplets' extinction goes as
// the water to the ⅔, the ice's as the ice; the rain's is Marshall and
// Palmer's, under the base. This file is the CPU's: tsl/density.ts is the
// same, for the GPU

/** The earth's mean radius, m: the clouds' shell curves round it */
export const EARTH_RADIUS_M = 6_371_000;

/** The water table's entries a row, and the heights they span above a base */
export const TABLE_SIZE = 64;
export const TABLE_RANGE_M = 12_000;

/** The water table's rows */
export const TABLE_ROWS = {
  cumulus: 0,
  stratus: 1,
  alto: 2,
  cirrus: 3,
  anvil: 4,
  coverage: 5,
  mean: 6,
} as const;
export const TABLE_ROW_COUNT = 7;

// The share of their adiabatic water decks and altostratus keep: 0.8 for
// stratocumulus (Albrecht et al. 1990), less for the deeper middle cloud,
// 0.6, an estimate
const STRATUS_FRACTION = 0.8;
const ALTO_FRACTION = 0.6;

// An anvil's ice near its storm: 0.05 g/m³, in the range Heymsfield (1986)
// measured. An estimate
const ANVIL_ICE_KG_M3 = 0.05e-3;

/**
 * How soft a cloud's edge is: the noise's span over which it goes from none
 * to all of its water. The detail's finest octave changes the noise by about
 * this over its cell, so the edge is no softer than its finest billow, some
 * tens of metres, and not so sharp that it aliases at the march's steps
 */
export const EDGE_SOFTNESS = 0.12;

/**
 * The cuts the mean row of the table spans: from below the noise's least
 * value, where all of it is cloud, to its peak with its detail, where none is
 */
export const MEAN_FROM = -0.5;
export const MEAN_TO = SHAPE_PEAK;

/**
 * A cloud's density over many of its billows: the mean, over the shape
 * noise's distribution, of the density a cut at an edge leaves, and of its
 * ⅔ power, as the droplets' extinction goes. Far off, a step is longer than
 * the clouds there and a pixel nearly as wide: what it sees of them is their
 * mean, not any one. The detail is left out: it averages to its median.
 * @param edge The cut
 * @returns The mean of d^⅔, and of d
 */
export const mean_density = (edge: number): [number, number] => {
  const values = shape_distribution();
  let two_thirds = 0;
  let linear = 0;

  for (const n of values) {
    const d = saturate((n - edge) / EDGE_SOFTNESS);

    two_thirds += Math.cbrt(d) ** 2;
    linear += d;
  }

  return [two_thirds / values.length, linear / values.length];
};

/**
 * The cumulus's shape exponent: how the threshold rises through it, h^k. A
 * small k lets few clouds grow deep, as in a fair-weather field; a large one
 * keeps a storm's tower solid nearly to its top. Between, by the updraft.
 */
export const SHALLOW_SHAPE = 0.5;
export const TOWER_SHAPE = 3;
export const TOWER_UPDRAFT_M_S = 10;

// A cirrus's streaks: drawn out along the wind four times their width
export const CIRRUS_STRETCH = 4;

/**
 * The length each layer's noise tiles over, metres, and how much flatter
 * the sheets' billows are than wide.
 */
export type NoiseScales = {
  cumulus: number;
  stratus: number;
  alto: number;
  cirrus: number;
  detail: number;
  rain: number;

  /** How much the sheets' noise is squashed vertically */
  flatten: number;
};

/**
 * The noise's scales for a climate. A cumulus field's cells are spaced as
 * Rayleigh's convection rolls are, about twice the mixed layer's depth
 * (Rayleigh's critical wavelength, 2π / 3.117 d): its tile holds four.
 * The rest scale with it, estimates from how such cloud looks.
 * @param prepared The climate's tables
 * @returns Them
 */
export const noise_scales = (prepared: Prepared): NoiseScales => {
  const depth = Math.max(prepared.meanBaseM - prepared.climate.groundM, 500);
  const cell = ((2 * Math.PI) / 3.117) * depth;
  const cumulus = 4 * cell;

  return {
    cumulus,
    stratus: cumulus * 2,
    alto: cumulus * 1.5,
    cirrus: 24_000,
    // The detail's first octave a cell of the shape's finest halved
    detail: cumulus / 16,
    rain: 4000,
    flatten: 4,
  };
};

/**
 * The clouds' water, as optical properties by height: a row a layer, each
 * entry the droplets' extinction at a density of one, over LWC^⅔, and the
 * ice's, and the coverage table in the last row.
 * @param prepared The climate's tables
 * @returns Four floats an entry, `TABLE_SIZE` a row
 */
export const water_table = (prepared: Prepared): Float32Array => {
  const { climate } = prepared;
  const table = new Float32Array(TABLE_SIZE * TABLE_ROW_COUNT * 4);
  const liquid = droplet_coefficient(climate.airMass);
  const ice = ice_coefficient();
  const offset = climate.temperatureOffsetK;

  const write = (
    row: number,
    entry: number,
    base_m: number,
    height_m: number,
    water: number,
    frozen: number | null,
  ) => {
    const altitude = base_m + height_m;
    const share = frozen ?? ice_share(air_temperature(altitude, offset));
    const at = (row * TABLE_SIZE + entry) * 4;

    table[at] = liquid * Math.cbrt(water * (1 - share)) ** 2;
    table[at + 1] = ice * water * share;
  };

  const layer = (
    row: number,
    base_m: number,
    fraction: (h: number) => number,
  ) => {
    const base_k = air_temperature(base_m, offset);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const height = (i / (TABLE_SIZE - 1)) * TABLE_RANGE_M;

      write(
        row,
        i,
        base_m,
        height,
        fraction(height) * adiabatic_water(base_m, base_k, height),
        null,
      );
    }
  };

  layer(TABLE_ROWS.cumulus, prepared.meanBaseM, warner_fraction);
  layer(TABLE_ROWS.stratus, prepared.meanBaseM, () => STRATUS_FRACTION);
  layer(TABLE_ROWS.alto, climate.altoBaseM, () => ALTO_FRACTION);

  for (let i = 0; i < TABLE_SIZE; i++) {
    const height = (i / (TABLE_SIZE - 1)) * TABLE_RANGE_M;
    const cirrus_at = climate.cirrusBaseM + height;

    write(
      TABLE_ROWS.cirrus,
      i,
      climate.cirrusBaseM,
      height,
      cirrus_ice(air_temperature(cirrus_at, offset), cirrus_at),
      1,
    );
    write(TABLE_ROWS.anvil, i, 0, 0, ANVIL_ICE_KG_M3, 1);
  }

  const thresholds = coverage_thresholds();

  for (let i = 0; i < COVERAGE_SIZE && i < TABLE_SIZE; i++) {
    table[(TABLE_ROWS.coverage * TABLE_SIZE + i) * 4] = thresholds[i];
  }

  for (let i = 0; i < TABLE_SIZE; i++) {
    const edge = MEAN_FROM + ((MEAN_TO - MEAN_FROM) * i) / (TABLE_SIZE - 1);
    const [two_thirds, linear] = mean_density(edge);
    const at = (TABLE_ROWS.mean * TABLE_SIZE + i) * 4;

    table[at] = two_thirds;
    table[at + 1] = linear;
  }

  return table;
};

/**
 * An entry of a row of the table, linearly.
 * @param table The table
 * @param row Its row
 * @param height_m The height above the layer's base
 * @param channel Which: 0 the droplets', 1 the ice's
 * @returns The value
 */
export const table_at = (
  table: Float32Array,
  row: number,
  height_m: number,
  channel: number,
): number => {
  const at = Math.min(
    Math.max((height_m / TABLE_RANGE_M) * (TABLE_SIZE - 1), 0),
    TABLE_SIZE - 1.001,
  );
  const i = Math.floor(at);
  const f = at - i;
  const a = table[(row * TABLE_SIZE + i) * 4 + channel];
  const b = table[(row * TABLE_SIZE + i + 1) * 4 + channel];

  return a + (b - a) * f;
};

/**
 * A smooth step from 0 to 1, clamped.
 * @param x The value
 * @returns 0 to 1
 */
export const saturate = (x: number): number => Math.min(Math.max(x, 0), 1);

/**
 * A cumulus's density.
 * @param noise The shape noise there
 * @param height Its height through the cumulus, 0 at the base, 1 at the top
 * @param cover Its cover
 * @param updraft_m_s Its updraft
 * @returns 0 to 1
 */
export const cumulus_density = (
  noise: number,
  height: number,
  cover: number,
  updraft_m_s: number,
): number => {
  const threshold = coverage_threshold(cover);
  const k =
    SHALLOW_SHAPE +
    (TOWER_SHAPE - SHALLOW_SHAPE) * saturate(updraft_m_s / TOWER_UPDRAFT_M_S);
  const edge =
    threshold + (SHAPE_PEAK - threshold) * Math.pow(saturate(height), k);

  return saturate((noise - edge) / EDGE_SOFTNESS);
};

// A sheet is as deep as its air is moist: its water grows from where the
// air saturates, so where the air is moister it saturates farther from where
// it saturates first, and the cloud there is deeper. A deck saturates first
// under its inversion, its top flat there and its base rising and falling
// with the moisture under it (Wood 2012), an anvil under the tropopause; an
// altostratus or a cirrus, held by no lid, from its middle. So the cut rises
// from the sheet's cover there to the noise's peak away from it: the cloud's
// depth in proportion to how far the noise stands over the cut, as the
// water grows in proportion to the height. The linear rise is an estimate
export type SheetLid = "top" | "none";

/**
 * A sheet's density: stratocumulus, altostratus, cirrus, an anvil.
 * @param noise The shape noise there
 * @param height Its height through the sheet, 0 to 1
 * @param cover Its cover
 * @param lid Where it saturates first: under its top, or in its middle
 * @returns 0 to 1
 */
export const sheet_density = (
  noise: number,
  height: number,
  cover: number,
  lid: SheetLid,
): number => {
  const h = 2 * saturate(height) - 1;
  const profile = 1 - h * h * h * h;
  const threshold = coverage_threshold(cover);
  const away = lid === "top" ? 1 - saturate(height) : Math.abs(h);
  const edge = threshold + (SHAPE_PEAK - threshold) * away;

  return saturate((noise - edge) / EDGE_SOFTNESS) * profile;
};

/**
 * The rain's extinction: Marshall and Palmer's, π N0 / Λ³, 3.65 × 10⁻⁴
 * R^0.63 a metre.
 */
export const RAIN_COEFFICIENT = (Math.PI * 8000) / 4.1 ** 3 / 1e6;
export const RAIN_EXPONENT = 0.63;

/**
 * The shafts' mean share of the rain, saturate(1.6 n − 0.2) over the shape
 * noise n: 0.56, measured over 400 000 points, its spread 0.35. The rain on
 * a long path is its mean, not its shafts
 */
export const RAIN_SHAFTS_MEAN = 0.56;

/**
 * What the weather's shapes are sampled with at a point: the noise's tiles
 * and the seed's offset into them.
 */
export type ShapeFrame = {
  scales: NoiseScales;

  /** The seed's offset into the tiles, 0 to 1 each way */
  offset: readonly [number, number, number];

  /** The direction of the upper wind, a unit vector in x and z */
  upper: readonly [number, number];

  /**
   * How far the upper wind has carried the cirrus past the low clouds' air,
   * metres in x and z
   */
  drift: readonly [number, number];
};

/**
 * The shape noise at a point of the air's frame, in tiles of a length.
 * @param x The point, metres
 * @param y Its altitude
 * @param z The point
 * @param tile The tile's length
 * @param flatten How much flatter its billows are
 * @param frame The frame
 * @returns 0 to 1 over its 5th to 95th percentiles
 */
export const shape_at = (
  x: number,
  y: number,
  z: number,
  tile: number,
  flatten: number,
  frame: ShapeFrame,
): number => {
  const [ox, oy, oz] = frame.offset;

  return shape_noise(
    shape_union(
      x / tile + ox,
      (y * flatten) / tile + oy,
      z / tile + oz,
      SHAPE_SALT,
    ),
  );
};

/**
 * The detail noise at a point of the air's frame.
 * @param x The point, metres
 * @param y Its altitude
 * @param z The point
 * @param frame The frame
 * @returns What it adds to the shape noise, about 0
 */
export const detail_at = (
  x: number,
  y: number,
  z: number,
  frame: ShapeFrame,
): number => {
  const wrap = (v: number) => v - Math.floor(v);
  const tile = frame.scales.detail;

  return detail_noise(
    detail_channels(
      wrap(x / tile),
      wrap(y / tile),
      wrap(z / tile),
      DETAIL_SALT,
    ),
  );
};

/**
 * The cloud at a point: its extinction by what makes it.
 */
export type CloudExtinction = {
  /** The droplets', the ice's and the rain's, per metre */
  water: number;
  ice: number;
  rain: number;

  /**
   * The optical depth over the point to its cloud's top, and under it to
   * its base, at its own extinction: what the sky's and the ground's light
   * come through
   */
  up: number;
  down: number;
};

/**
 * The cloud at a point, from the column over it.
 * @param column The column
 * @param x The point, in the air's frame
 * @param altitude_m Its altitude, metres above sea level
 * @param z The point
 * @param climate The climate
 * @param table The water table
 * @param frame The noise's frame
 * @param out Where to write it
 * @returns out
 */
export const cloud_extinction = (
  column: CloudColumn,
  x: number,
  altitude_m: number,
  z: number,
  climate: Climate,
  table: Float32Array,
  frame: ShapeFrame,
  out: CloudExtinction = { water: 0, ice: 0, rain: 0, up: 0, down: 0 },
): CloudExtinction => {
  const { scales } = frame;
  const a = altitude_m;
  let water = 0;
  let ice = 0;
  let up = 0;
  let down = 0;
  let detail = -2;

  // The density, from the noise lifted by the detail: only where the most
  // detail could make cloud is it sampled
  const add = (
    row: number,
    base: number,
    top: number,
    density_of: (shift: number) => number,
  ) => {
    if (density_of(DETAIL_REACH) <= 0) return;

    if (detail < -1) detail = detail_at(x, a, z, frame);

    const d = density_of(detail);

    if (d <= 0) return;

    const liquid = table_at(table, row, a - base, 0) * Math.cbrt(d) ** 2;
    const frozen = table_at(table, row, a - base, 1) * d;
    const here = liquid + frozen;

    water += liquid;
    ice += frozen;
    up += here * Math.max(top - a, 0);
    down += here * Math.max(a - base, 0);
  };

  // Cumulus
  const base = column.baseM;
  const top = column.cumulusTopM;

  if (column.cumulus > 0 && a > base && a < top) {
    const n = shape_at(x, a, z, scales.cumulus, 1, frame);

    add(TABLE_ROWS.cumulus, base, top, (shift) =>
      cumulus_density(
        n + shift,
        (a - base) / (top - base),
        column.cumulus,
        column.updraftMPerS,
      ),
    );
  }

  // The deck, under the inversion
  const deck_top = column.stratusTopM;
  const deck_base = Math.min(base, deck_top - 150);

  if (column.stratus > 0 && a > deck_base && a < deck_top) {
    const n = shape_at(x, a, z, scales.stratus, scales.flatten, frame);

    add(TABLE_ROWS.stratus, deck_base, deck_top, (shift) =>
      sheet_density(
        n + shift,
        (a - deck_base) / (deck_top - deck_base),
        column.stratus,
        "top",
      ),
    );
  }

  // Altostratus
  if (column.alto > 0 && a > column.altoBaseM && a < column.altoTopM) {
    const n = shape_at(x, a, z, scales.alto, scales.flatten, frame);

    add(TABLE_ROWS.alto, column.altoBaseM, column.altoTopM, (shift) =>
      sheet_density(
        n + shift,
        (a - column.altoBaseM) / (column.altoTopM - column.altoBaseM),
        column.alto,
        "none",
      ),
    );
  }

  // Cirrus, drawn out along the upper wind
  const cirrus_top = climate.cirrusBaseM + climate.cirrusDepthM;

  if (column.cirrus > 0 && a > climate.cirrusBaseM && a < cirrus_top) {
    const [ux, uz] = frame.upper;
    const cx = x - frame.drift[0];
    const cz = z - frame.drift[1];
    const along = cx * ux + cz * uz;
    const across = -cx * uz + cz * ux;
    const n = shape_at(
      along / CIRRUS_STRETCH,
      a,
      across,
      scales.cirrus,
      scales.flatten,
      frame,
    );

    add(TABLE_ROWS.cirrus, climate.cirrusBaseM, cirrus_top, (shift) =>
      sheet_density(
        n + shift,
        (a - climate.cirrusBaseM) / climate.cirrusDepthM,
        column.cirrus,
        "none",
      ),
    );
  }

  // An anvil, under the tropopause
  const anvil_base = climate.tropopauseM - column.anvilM;

  if (column.anvilM > 0 && a > anvil_base && a < climate.tropopauseM) {
    const n = shape_at(x, a, z, scales.stratus, scales.flatten, frame);

    add(TABLE_ROWS.anvil, anvil_base, climate.tropopauseM, (shift) =>
      sheet_density(n + shift, (a - anvil_base) / column.anvilM, 0.95, "top"),
    );
  }

  // Rain, under the cloud it falls from, in shafts
  let rain = 0;

  if (column.rainMmPerH > 0) {
    const from =
      column.cumulus > 0.01
        ? base
        : column.alto > 0.01
          ? column.altoBaseM
          : deck_base;

    if (a < from && a > climate.groundM) {
      rain = rain_extinction_at(column, x, a, z, from, frame);
    }
  }

  out.water = water;
  out.ice = ice;
  out.rain = rain;
  out.up = up;
  out.down = down;

  return out;
};

/**
 * The rain's extinction at a point under its cloud: Marshall and Palmer's,
 * in shafts under the showers' clouds, evenly under a sheet's.
 * @param column The column
 * @param x The point, in the air's frame
 * @param a Its altitude
 * @param z The point
 * @param from The base it falls from
 * @param frame The noise's frame
 * @returns Per metre
 */
export const rain_extinction_at = (
  column: CloudColumn,
  x: number,
  a: number,
  z: number,
  from: number,
  frame: ShapeFrame,
): number => {
  // Under a cumulus, only where there is cloud at its base to fall from
  let under = 1;

  if (column.cumulus > 0.01 && column.cumulus < 0.99) {
    const n = shape_at(x, from + 1, z, frame.scales.cumulus, 1, frame);

    under = saturate((n - coverage_threshold(column.cumulus)) / EDGE_SOFTNESS);
  }

  // Drawn into shafts, the falling streaks far taller than wide
  const shafts = shape_at(x, a / 6, z, frame.scales.rain, 1, frame);

  return (
    RAIN_COEFFICIENT *
    Math.pow(column.rainMmPerH, RAIN_EXPONENT) *
    under *
    saturate(shafts * 1.6 - 0.2)
  );
};
