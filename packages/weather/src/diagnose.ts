import {
  AIR_CP,
  dew_point,
  LATENT_HEAT,
  mixing_ratio,
  saturation_pressure,
  standard_atmosphere,
} from "@aeronautic/core";
import type { AirColumn, Climate } from "./climate";
import {
  air_temperature,
  ESPY_M_PER_K,
  lift_parcel,
  rain_onset,
  saturation_mixing_ratio,
} from "./physics";

// The clouds over a column of air, from the air
//
// - Cumulus: a parcel the ground warmed rises dry to its condensation level,
//   the cumulus's base, then on the moist adiabat while it is buoyant. It
//   stops at the first of its equilibrium level, the inversion capping the
//   mixed layer, and the height dry air mixed into it from the side lets it
//   reach. How much of the sky it covers follows the humidity, as
//   Sundqvist's (1989) scheme has it, where there is buoyancy for it at all.
// - Stratocumulus: where the mixed layer under the inversion reaches
//   saturation, a deck forms under it, broken where it only nearly does
//   (Slingo 1987), and only as thin as decks are.
// - Altostratus: where the middle troposphere is humid, more so where the
//   air is being lifted, which cools it towards saturation; deepening, it is
//   nimbostratus, and rains what the ascent condenses.
// - Cirrus: where the air at its levels is humid over ice.
// - Showers: from a cumulus grown deep enough for its droplets to rain.
//
// The thunderstorms are convection.ts's: each a cell of its own, with a life

/**
 * The clouds over a point: what the weather map holds, texel by texel.
 */
export type CloudColumn = {
  /** The cumulus's share of the sky, and the stratocumulus's, 0 to 1 */
  cumulus: number;
  stratus: number;

  /** The altostratus's, and the cirrus's */
  alto: number;
  cirrus: number;

  /** The condensation level: the cumulus's base, metres above sea level */
  baseM: number;

  /** The tallest cumulus's top, and the deck's: the inversion */
  cumulusTopM: number;
  stratusTopM: number;

  /** The altostratus's base and top */
  altoBaseM: number;
  altoTopM: number;

  /** How thick a storm's anvil is over the point, metres under its top */
  anvilM: number;

  /** How hard it rains under the cloud, mm/h */
  rainMmPerH: number;

  /** How fast the cumulus rises: its billows boil up at it, m/s */
  updraftMPerS: number;
};

/** The channels of a column, in the weather map's order */
export const COLUMN_FIELDS: readonly (keyof CloudColumn)[] = [
  "cumulus",
  "stratus",
  "alto",
  "cirrus",
  "baseM",
  "cumulusTopM",
  "stratusTopM",
  "altoBaseM",
  "altoTopM",
  "anvilM",
  "rainMmPerH",
  "updraftMPerS",
];

/**
 * A column with no cloud.
 * @returns A fresh one
 */
export const empty_column = (): CloudColumn => ({
  cumulus: 0,
  stratus: 0,
  alto: 0,
  cirrus: 0,
  baseM: 0,
  cumulusTopM: 0,
  stratusTopM: 0,
  altoBaseM: 0,
  altoTopM: 0,
  anvilM: 0,
  rainMmPerH: 0,
  updraftMPerS: 0,
});

// The parcel table's axes: the humidity at the ground, and the warmth
const HUMIDITY_STEPS = 20;
const WARMTH_STEPS = 13;
const WARMTH_MAX_K = 6;

/**
 * What a climate's columns are worked out with, worked out once for it.
 */
export type Prepared = {
  climate: Climate;

  /**
   * The parcel's equilibrium level and CAPE over the humidity and the
   * warmth, a row a humidity
   */
  tops: Float32Array;
  capes: Float32Array;

  /** The climate's mean condensation level, metres above sea level */
  meanBaseM: number;

  /** The air's temperature there */
  meanBaseK: number;

  /**
   * How deep its cumulus must grow before they rain, metres: at its mean
   * base, for its air mass
   */
  rainOnsetM: number;
};

/**
 * Work a climate's tables out.
 * @param climate The climate
 * @returns Them
 */
export const prepare = (climate: Climate): Prepared => {
  const tops = new Float32Array(HUMIDITY_STEPS * WARMTH_STEPS);
  const capes = new Float32Array(HUMIDITY_STEPS * WARMTH_STEPS);
  const { groundM: ground, temperatureOffsetK: offset } = climate;

  for (let h = 0; h < HUMIDITY_STEPS; h++) {
    for (let w = 0; w < WARMTH_STEPS; w++) {
      const parcel = lift_parcel(
        ground,
        offset,
        (h + 1) / HUMIDITY_STEPS,
        (w / (WARMTH_STEPS - 1)) * WARMTH_MAX_K,
      );

      tops[h * WARMTH_STEPS + w] = parcel.topM;
      capes[h * WARMTH_STEPS + w] = parcel.capeJPerKg;
    }
  }

  const mean = lift_parcel(
    ground,
    offset,
    climate.fields.humidity.mean,
    climate.fields.warmthK.mean,
  );

  return {
    climate,
    tops,
    capes,
    meanBaseM: mean.baseM,
    meanBaseK: mean.baseK,
    rainOnsetM: rain_onset(mean.baseM, mean.baseK, climate.airMass),
  };
};

/**
 * A table's value at a humidity and warmth, bilinearly.
 * @param table The table
 * @param humidity 0 to 1
 * @param warmth_k Kelvin
 * @returns The value
 */
const lookup = (table: Float32Array, humidity: number, warmth_k: number) => {
  const h = Math.min(
    Math.max(humidity * HUMIDITY_STEPS - 1, 0),
    HUMIDITY_STEPS - 1.001,
  );
  const w = Math.min(
    Math.max((warmth_k / WARMTH_MAX_K) * (WARMTH_STEPS - 1), 0),
    WARMTH_STEPS - 1.001,
  );
  const hi = Math.floor(h);
  const wi = Math.floor(w);
  const fh = h - hi;
  const fw = w - wi;
  const at = (i: number, j: number) => table[i * WARMTH_STEPS + j];

  return (
    (at(hi, wi) * (1 - fw) + at(hi, wi + 1) * fw) * (1 - fh) +
    (at(hi + 1, wi) * (1 - fw) + at(hi + 1, wi + 1) * fw) * fh
  );
};

/**
 * The condensation level of a parcel from the ground: Lawrence's (2005)
 * 125 m a kelvin of dew-point spread.
 * @param climate The climate
 * @param humidity The relative humidity at the ground
 * @param warmth_k The parcel's warmth
 * @returns Metres above sea level
 */
export const condensation_level = (
  climate: Climate,
  humidity: number,
  warmth_k: number,
): number => {
  const air_k = air_temperature(climate.groundM, climate.temperatureOffsetK);
  const dew_k = dew_point(
    Math.min(Math.max(humidity, 0.01), 1) * saturation_pressure(air_k),
  );

  return climate.groundM + ESPY_M_PER_K * Math.max(air_k + warmth_k - dew_k, 0);
};

// The share of a storm's inflow that has come under its rain, cooled to its
// wet bulb and saturated: half, an estimate. Its wall cloud's base then
// falls by about half the height of the storm's own, a few hundred metres,
// as wall clouds are seen to
const WALL_SHARE = 0.5;

/**
 * A storm's wall cloud's base: where its updraft draws in air its rain has
 * cooled, evaporating into it to its wet bulb, cp (T − Tw) = L (rs(Tw) − r),
 * and saturated it. Mixed with the rest of its inflow, that air reaches its
 * condensation level lower (Fujita 1959).
 * @param climate The climate
 * @param base_m The storm's base, from its inflow's dew-point spread
 * @returns Metres above sea level
 */
export const wall_base = (climate: Climate, base_m: number): number => {
  const ground = climate.groundM;
  const air_k =
    air_temperature(ground, climate.temperatureOffsetK) +
    climate.fields.warmthK.mean;
  const dew_k = air_k - Math.max(base_m - ground, 0) / ESPY_M_PER_K;
  const pressure = standard_atmosphere(ground).pressurePa;
  const vapour = saturation_pressure(dew_k);
  const mixing = mixing_ratio(vapour, pressure);

  // The wet bulb, between the dew point and the air, by halving
  let low = dew_k;
  let high = air_k;

  for (let i = 0; i < 24; i++) {
    const wet = (low + high) / 2;
    const left =
      AIR_CP * (air_k - wet) -
      LATENT_HEAT * (mixing_ratio(saturation_pressure(wet), pressure) - mixing);

    if (left > 0) low = wet;
    else high = wet;
  }

  const wet_k = (low + high) / 2;
  const mixed_k = air_k - WALL_SHARE * (air_k - wet_k);
  const mixed_vapour =
    vapour + WALL_SHARE * (saturation_pressure(wet_k) - vapour);

  return ground + ESPY_M_PER_K * Math.max(mixed_k - dew_point(mixed_vapour), 0);
};

/**
 * A parcel's equilibrium level and CAPE, from the table.
 * @param prepared The climate's tables
 * @param humidity The relative humidity at the ground
 * @param warmth_k The parcel's warmth
 * @returns Its top, metres above sea level, and its CAPE, J/kg
 */
export const parcel_top = (
  prepared: Prepared,
  humidity: number,
  warmth_k: number,
): { topM: number; capeJPerKg: number } => ({
  topM: lookup(prepared.tops, humidity, warmth_k),
  capeJPerKg: Math.max(lookup(prepared.capes, humidity, warmth_k), 0),
});

/**
 * Sundqvist's (1989) cloud fraction: none below a critical humidity, all of
 * the sky at saturation, 1 − √((1 − RH) / (1 − RHc)) between.
 * @param humidity The relative humidity
 * @param critical Its critical value
 * @returns 0 to 1
 */
export const sundqvist = (humidity: number, critical: number): number =>
  humidity <= critical
    ? 0
    : 1 - Math.sqrt(Math.max(1 - humidity, 0) / (1 - critical));

/**
 * Slingo's (1987) cloud fraction: ((RH − 0.8) / 0.2)², none below 80 %.
 * @param humidity The relative humidity
 * @returns 0 to 1
 */
export const slingo = (humidity: number): number => {
  const over = Math.min(Math.max((humidity - 0.8) / 0.2, 0), 1);

  return over * over;
};

// The critical humidity at the ground for cumulus: an estimate, so that a
// 70 % day covers about a fifth of the sky, as fair-weather cumulus do
// (Neggers et al. 2003: 10 to 30 %)
const CUMULUS_CRITICAL = 0.5;

// Shallow cumulus seldom cover more than this, the rest of the sky the
// subsiding air between them (Neggers et al. 2003)
const CUMULUS_MOST = 0.6;

// How far up dry air mixed in from the side lets a cumulus reach, in a dry
// middle troposphere and a saturated one: entrainment stops cumulus in dry
// air well short of their equilibrium level (Derbyshire et al. 2004). An
// estimate, as their runs show it
const ENTRAINED_SHALLOW_M = 500;
const ENTRAINED_DEEP_M = 4500;

// Decks are a few hundred metres thick, 200 to 400 most often (Wood 2012): a
// cloud layer much deeper under the inversion is cumulus, not a deck
const DECK_MOST_M = 800;
const DECK_FADE_M = 400;

// Near 10 °C, the saturation vapour pressure rises 6.5 % a kelvin (Magnus):
// a dew-point spread of ΔT is a relative humidity of e^(−0.065 ΔT)
const MAGNUS_SLOPE = 0.065;

// How long air spends in a region of ascent: an estimate, as fronts and
// troughs pass in a few hours
const ASCENT_S = 3 * 3600;

// The moist adiabat's lapse rate in the middle troposphere, about
const MOIST_LAPSE = 0.0065;

// The share of a storm's condensate that reaches the ground as rain, the
// rest evaporated or carried into the anvil: about 0.3 for deep convection
// (Market et al. 2003 find 0.2 to 0.5). An estimate
export const PRECIPITATION_EFFICIENCY = 0.3;

// A rising thermal's mean updraft against the √(2 CAPE) it would reach
// unmixed: about half (Weisman and Klemp 1982's storms). An estimate
export const UPDRAFT_SHARE = 0.5;

// The updraft's core is about half a cloud's width, its condensate falling
// over the whole cloud: a quarter of its area. An estimate
export const CORE_AREA = 0.25;

/**
 * How hard a cloud rains: its updraft carries the vapour it condenses up,
 * ρ w Δq a second, and the efficiency's share falls out.
 * @param base_m Its base
 * @param top_m Its top
 * @param offset_k The day's offset
 * @param updraft_m_s Its updraft
 * @param efficiency The share that falls
 * @returns mm/h
 */
export const condensation_rain = (
  base_m: number,
  top_m: number,
  offset_k: number,
  updraft_m_s: number,
  efficiency: number,
): number => {
  if (top_m <= base_m || updraft_m_s <= 0) return 0;

  const condensed =
    saturation_mixing_ratio(air_temperature(base_m, offset_k), base_m) -
    saturation_mixing_ratio(air_temperature(top_m, offset_k), top_m);
  const density =
    standard_atmosphere(base_m).pressurePa /
    (287.05 * air_temperature(base_m, offset_k));

  // kg/m²/s is mm/s of rain
  return Math.max(condensed, 0) * density * updraft_m_s * efficiency * 3600;
};

/**
 * The clouds over a column of air.
 * @param prepared The climate's tables
 * @param air The air
 * @param out Where to write them
 * @returns out
 */
export const diagnose = (
  prepared: Prepared,
  air: AirColumn,
  out: CloudColumn = empty_column(),
): CloudColumn => {
  const { climate } = prepared;
  const ground = climate.groundM;
  const offset = climate.temperatureOffsetK;

  const base = condensation_level(climate, air.humidity, air.warmthK);
  const { topM: equilibrium, capeJPerKg: free_cape } = parcel_top(
    prepared,
    air.humidity,
    air.warmthK,
  );
  const cap = ground + air.capM;

  // The deck: the mixed layer's humidity at the inversion, saturated if the
  // condensation level is under it, its dew-point spread there otherwise
  const spread_k = Math.max(base - cap, 0) / ESPY_M_PER_K;
  const capped = cap < equilibrium;
  const thickness = cap - base;
  const deck = capped
    ? slingo(Math.exp(-MAGNUS_SLOPE * spread_k)) *
      Math.min(Math.max((DECK_MOST_M - thickness) / DECK_FADE_M, 0), 1)
    : 0;

  out.baseM = base;
  out.stratus = deck;
  out.stratusTopM = cap;

  // The cumulus: as high as the first of what stops it
  const entrained =
    base +
    ENTRAINED_SHALLOW_M +
    ENTRAINED_DEEP_M * air.midHumidity * air.midHumidity;
  const top = Math.min(equilibrium, cap, entrained);
  const depth = top - base;

  // The buoyancy it gains as far as it gets: the parcel's CAPE is to its
  // equilibrium level, and one stopped short gains a share of it. Its
  // buoyancy grows about evenly from none at its base, so the share is the
  // square of the share of the way it rose. An estimate: it peaks and falls
  // again before the equilibrium level
  const share =
    equilibrium > base
      ? Math.min(Math.max(depth, 0) / (equilibrium - base), 1)
      : 0;
  const cape = free_cape * share * share;
  const updraft = UPDRAFT_SHARE * Math.sqrt(2 * cape);

  // Whether buoyant past their base or not: thermals carried past it form
  // cumulus all the same, forced if not active (Stull 1985), as many as the
  // humidity makes
  if (depth > 150) {
    out.cumulus =
      Math.min(sundqvist(air.humidity, CUMULUS_CRITICAL), CUMULUS_MOST) *
      (1 - deck);
    out.cumulusTopM = top;
    out.updraftMPerS = updraft;
  } else {
    out.cumulus = 0;
    out.cumulusTopM = base;
    out.updraftMPerS = 0;
  }

  // Showers, from cumulus grown past where their droplets rain, harder the
  // deeper they grow past it
  const onset = prepared.rainOnsetM;
  const showers =
    out.cumulus > 0 && depth > onset
      ? condensation_rain(
          base,
          top,
          offset,
          updraft,
          PRECIPITATION_EFFICIENCY,
        ) *
        CORE_AREA *
        Math.min((depth - onset) / onset, 1)
      : 0;

  // The middle troposphere, lifted: as far as it rose in the ascent, cooled
  // on the moist adiabat, and that much nearer saturation
  const risen = Math.max(air.liftMPerS, 0) * ASCENT_S;
  const lifted = Math.exp(MAGNUS_SLOPE * MOIST_LAPSE * risen);
  const sinking = Math.exp(
    -MAGNUS_SLOPE * 0.0098 * Math.max(-air.liftMPerS, 0) * ASCENT_S,
  );

  out.alto = slingo(air.midHumidity * lifted * sinking);

  // The ascent brings the base down, the air that rose from below saturated
  // too, and the top up, as far as it rose
  out.altoBaseM = Math.max(climate.altoBaseM - risen, base);
  out.altoTopM = climate.altoBaseM + climate.altoDepthM + risen;

  const steady =
    out.alto > 0.5
      ? condensation_rain(
          out.altoBaseM,
          out.altoTopM,
          offset,
          Math.max(air.liftMPerS, 0),
          1,
        ) * out.alto
      : 0;

  out.cirrus = slingo(air.highHumidity * lifted * sinking);

  out.anvilM = 0;
  out.rainMmPerH = Math.max(showers, steady);

  return out;
};
