import {
  AIR_CP,
  AIR_GAS_CONSTANT,
  mixing_ratio,
  VAPOUR_RATIO,
  type MoistAir,
} from "@aeronautic/core";
import {
  HOMOGENEOUS_FREEZING_K,
  ICE_DENSITY,
  ice_saturation_pressure,
  water_saturation_pressure,
} from "./ice";
import type { ContrailFuel } from "./types";

// The exhaust, mixing into the air behind the aircraft
//
// An engine puts out hot, wet gas. As it mixes with the cold air round it the
// mixture cools and dries along a straight line in temperature and vapour
// pressure, the mixing line, because both the heat and the water are diluted
// by the same air. Saturation pressure curves upward with temperature, so a
// steep enough line, wet enough exhaust in cold enough air, crosses it: the
// mixture passes water saturation on the way, droplets form on the soot and
// freeze at once. That is the Schmidt–Appleman criterion, with Schumann's
// (1996) correction that the heat spent pushing the aircraft never warms the
// plume
//
// How fast it mixes is measured: in more than seventy encounters behind
// airliners at cruise, the mass of air a kilogram of fuel's exhaust has mixed
// with grew as N = 7000 (t / 1 s)^0.8, from 6 ms to three hours (Schumann et
// al., 1998). Everything else follows from N: the plume's temperature and
// water, its width, and the ice in it, held at ice saturation as the crystals
// take up or give back vapour far faster than the plume changes

// Schumann et al.'s dilution, and the ages it was measured over
const DILUTION_AT_1S = 7000;
const DILUTION_EXPONENT = 0.8;
export const PLUME_MIN_AGE_S = 0.006;
export const PLUME_MAX_AGE_S = 1e4;

// Liquid water's density, for a plume too warm for its droplets to freeze
const WATER_DENSITY = 1000;

// Ice's refractive index, and the middle of the visible spectrum: what the
// crystals' extinction efficiency is worked out at
const ICE_REFRACTIVE_INDEX = 1.31;
const WATER_REFRACTIVE_INDEX = 1.333;
const LIGHT_WAVELENGTH_M = 550e-9;

// How finely the formation is looked for, from the first dilution to the last
const FORMATION_STEPS = 256;

/**
 * How much air a kilogram of fuel's exhaust has mixed with, at an age.
 * @param age_s Seconds since it left the engine
 * @returns Kilograms of air per kilogram of fuel
 */
export const dilution = (age_s: number): number =>
  DILUTION_AT_1S *
  Math.pow(
    Math.min(Math.max(age_s, PLUME_MIN_AGE_S), PLUME_MAX_AGE_S),
    DILUTION_EXPONENT,
  );

/**
 * The age at which the exhaust has mixed with so much air.
 * @param dilution_ratio Kilograms of air per kilogram of fuel
 * @returns Seconds since it left the engine
 */
export const age_at_dilution = (dilution_ratio: number): number =>
  Math.pow(Math.max(dilution_ratio, 0) / DILUTION_AT_1S, 1 / DILUTION_EXPONENT);

/**
 * The slope of the mixing line, in pascals of vapour per kelvin: how much
 * water the exhaust brings for each degree of heat it brings.
 * @param pressure_pa The air's pressure
 * @param fuel The fuel
 * @param efficiency How much of the fuel's heat pushes the aircraft, 0 to 1
 * @returns The slope, Pa/K
 */
export const mixing_slope = (
  pressure_pa: number,
  fuel: ContrailFuel,
  efficiency: number,
): number =>
  (fuel.waterIndex * AIR_CP * pressure_pa) /
  (VAPOUR_RATIO *
    fuel.heatJPerKg *
    Math.max(1 - Math.min(Math.max(efficiency, 0), 0.99), 0.01));

/**
 * What the Schmidt–Appleman criterion says about one day and one engine.
 */
export type ContrailFormation = {
  /** Whether the mixing exhaust passes water saturation: a contrail forms */
  forms: boolean;

  /** The mixing line's slope, Pa/K */
  slopePaPerK: number;

  /** Where the saturation curve is as steep as the mixing line, in kelvin */
  tangentK: number;

  /**
   * The warmest the air may be, with the water it carries, for a contrail to
   * form, in kelvin. It forms in air colder than this
   */
  thresholdK: number;
};

/**
 * The Schmidt–Appleman criterion, as Schumann (1996) gives it.
 *
 * The mixing line from the air's own temperature and vapour climbs at
 * `mixing_slope`. A contrail forms if it reaches the saturation curve over
 * water anywhere, and it first nears it where the curve is as steep as it is.
 * @param air The air
 * @param fuel The fuel
 * @param efficiency How much of the fuel's heat pushes the aircraft, 0 to 1
 * @returns Whether it forms, and the threshold
 */
export const schmidt_appleman = (
  air: MoistAir,
  fuel: ContrailFuel,
  efficiency: number,
): ContrailFormation => {
  const slope = mixing_slope(air.pressurePa, fuel, efficiency);

  // The saturation curve's slope rises with temperature: bisect for the
  // temperature where it matches the mixing line's
  let low = 150;
  let high = 330;

  for (let iteration = 0; iteration < 60; iteration++) {
    const middle = (low + high) / 2;
    const steepness =
      (water_saturation_pressure(middle + 0.01) -
        water_saturation_pressure(middle - 0.01)) /
      0.02;

    if (steepness < slope) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const tangent_k = (low + high) / 2;

  // The line through the tangent point at this vapour pressure crosses the
  // air's vapour at the warmest air that still forms one
  const threshold_k =
    tangent_k - (water_saturation_pressure(tangent_k) - air.vapourPa) / slope;

  return {
    forms: air.temperatureK <= threshold_k,
    slopePaPerK: slope,
    tangentK: tangent_k,
    thresholdK: threshold_k,
  };
};

/**
 * The exhaust mixed with so much air: its temperature and its water.
 * @param dilution_ratio Kilograms of air per kilogram of fuel
 * @param air The air it mixes with
 * @param fuel The fuel
 * @param efficiency How much of the fuel's heat pushes the aircraft
 * @returns The mixture's temperature in kelvin, and its water per kilogram
 *   of air
 */
export const mixture = (
  dilution_ratio: number,
  air: MoistAir,
  fuel: ContrailFuel,
  efficiency: number,
): { temperatureK: number; water: number } => {
  const n = Math.max(dilution_ratio, 1);

  return {
    temperatureK:
      air.temperatureK +
      (fuel.heatJPerKg * (1 - Math.min(Math.max(efficiency, 0), 0.99))) /
        (AIR_CP * n),
    water: air.mixingRatio + fuel.waterIndex / n,
  };
};

/**
 * Where on its way out a plume first reaches water saturation, and whether
 * the droplets it makes there freeze.
 */
export type PlumeFormation = {
  /**
   * The dilution at which droplets form, kilograms of air per kilogram of
   * fuel. Infinity if they never do
   */
  dilution: number;

  /**
   * The dilution at which they freeze: where the plume cools past -38 °C
   * with its droplets still standing, or where they form if it is colder
   * already. Infinity if they evaporate first, and the trail is a wisp of
   * cloud that lasts as long as the plume stays saturated over water
   */
  freezeDilution: number;
};

/**
 * Follow the mixing exhaust out and find where it first reaches water
 * saturation: the same criterion as `schmidt_appleman`, along the plume's
 * own dilution, so the contrail starts as far behind the engine as the
 * exhaust takes to cool that far.
 * @param air The air
 * @param fuel The fuel
 * @param efficiency How much of the fuel's heat pushes the aircraft
 * @returns Where it forms, if it does
 */
export const plume_formation = (
  air: MoistAir,
  fuel: ContrailFuel,
  efficiency: number,
): PlumeFormation => {
  const supersaturation = (n: number) => {
    const { temperatureK, water } = mixture(n, air, fuel, efficiency);
    const vapour_pa = (air.pressurePa * water) / (VAPOUR_RATIO + water);

    return vapour_pa - water_saturation_pressure(temperatureK);
  };

  const first = Math.log(dilution(PLUME_MIN_AGE_S));
  const last = Math.log(dilution(PLUME_MAX_AGE_S));

  let before = first;

  for (let step = 0; step <= FORMATION_STEPS; step++) {
    const here = first + ((last - first) * step) / FORMATION_STEPS;

    if (supersaturation(Math.exp(here)) >= 0) {
      // Between the last step that was dry and this one
      let low = step === 0 ? here : before;
      let high = here;

      for (let iteration = 0; iteration < 40 && step > 0; iteration++) {
        const middle = (low + high) / 2;

        if (supersaturation(Math.exp(middle)) >= 0) {
          high = middle;
        } else {
          low = middle;
        }
      }

      const n = Math.exp(high);

      // Droplets freeze where the plume cools past homogeneous freezing, if
      // the plume is still saturated over water there to keep them
      const heat =
        fuel.heatJPerKg * (1 - Math.min(Math.max(efficiency, 0), 0.99));
      const freezing =
        air.temperatureK < HOMOGENEOUS_FREEZING_K
          ? Math.max(
              heat / (AIR_CP * (HOMOGENEOUS_FREEZING_K - air.temperatureK)),
              n,
            )
          : Infinity;

      return {
        dilution: n,
        freezeDilution:
          freezing === n || supersaturation(freezing) >= 0
            ? freezing
            : Infinity,
      };
    }

    before = here;
  }

  return { dilution: Infinity, freezeDilution: Infinity };
};

/**
 * How well a particle stops light: its extinction cross-section over its
 * geometric one. Van de Hulst's anomalous diffraction, good for the
 * micron-sized, weakly refracting crystals here: two for a particle much
 * larger than the light, towards nothing for one much smaller.
 * @param radius_m The particle's radius
 * @param refractive_index Its real refractive index
 * @returns The efficiency, about 2 for a large particle
 */
export const extinction_efficiency = (
  radius_m: number,
  refractive_index = ICE_REFRACTIVE_INDEX,
): number => {
  const phase =
    ((4 * Math.PI * Math.max(radius_m, 0)) / LIGHT_WAVELENGTH_M) *
    (refractive_index - 1);

  if (phase < 1e-3) {
    return (phase * phase) / 2;
  }

  return (
    2 -
    (4 / phase) * Math.sin(phase) +
    (4 / (phase * phase)) * (1 - Math.cos(phase))
  );
};

/**
 * One engine's exhaust as it leaves, the same all along the trail it lays
 * while the aircraft flies the same.
 */
export type Emission = {
  /** Fuel burnt per metre flown, kilograms, this engine's own */
  fuelPerMetreKg: number;

  /** How much of the fuel's heat pushes the aircraft */
  efficiency: number;

  /** Where its plume forms */
  formation: PlumeFormation;
};

/**
 * A plume at one age.
 */
export type PlumeState = {
  /** Kilograms of air per kilogram of fuel */
  dilution: number;

  /** In kelvin */
  temperatureK: number;

  /** Ice (or water) per kilogram of air in the plume */
  condensate: number;

  /** Ice per metre of trail, kilograms */
  icePerMetreKg: number;

  /**
   * The plume's width: the standard deviation of its Gaussian cross-section,
   * in metres
   */
  sigmaM: number;

  /** The crystals' mean radius, in metres */
  crystalRadiusM: number;

  /**
   * Its extinction cross-section per metre of trail, in metres: the
   * extinction coefficient summed across it. Seen side on through its axis,
   * its optical depth is this over √(2π) σ
   */
  extinctionM: number;
};

/**
 * A plume at one age, in the air it is mixing with.
 * @param age_s Seconds since it left the engine
 * @param emission The engine's exhaust when it left
 * @param air The air
 * @param fuel The fuel
 * @returns The plume
 */
export const plume_at = (
  age_s: number,
  emission: Emission,
  air: MoistAir,
  fuel: ContrailFuel,
): PlumeState => {
  const n = dilution(age_s);
  const { temperatureK, water } = mixture(n, air, fuel, emission.efficiency);

  // The mass of plume per metre of trail, and the room it takes
  const air_per_metre_kg = n * emission.fuelPerMetreKg;
  const density = air.pressurePa / (AIR_GAS_CONSTANT * temperatureK);
  const area_m2 = air_per_metre_kg / density;
  const sigma_m = Math.sqrt(area_m2 / (2 * Math.PI));

  const formation = emission.formation;
  const formed = n >= formation.dilution;
  const frozen = n >= formation.freezeDilution;

  // Once formed, held at saturation over what it is: water, then ice
  const saturated = frozen
    ? ice_saturation_pressure(temperatureK)
    : water_saturation_pressure(temperatureK);

  const condensate = formed
    ? Math.max(water - mixing_ratio(saturated, air.pressurePa), 0)
    : 0;

  const ice_kg = condensate * air_per_metre_kg;

  // Every soot particle the engine put out holds one crystal, and they share
  // the ice between them
  const crystals = Math.max(fuel.iceIndex, 1) * emission.fuelPerMetreKg;
  const particle_density = frozen ? ICE_DENSITY : WATER_DENSITY;
  const radius_m =
    crystals > 0 && ice_kg > 0
      ? Math.cbrt((3 * ice_kg) / (4 * Math.PI * particle_density * crystals))
      : 0;

  const efficiency = extinction_efficiency(
    radius_m,
    frozen ? ICE_REFRACTIVE_INDEX : WATER_REFRACTIVE_INDEX,
  );

  return {
    dilution: n,
    temperatureK,
    condensate,
    icePerMetreKg: ice_kg,
    sigmaM: sigma_m,
    crystalRadiusM: radius_m,
    extinctionM: crystals * Math.PI * radius_m * radius_m * efficiency,
  };
};
