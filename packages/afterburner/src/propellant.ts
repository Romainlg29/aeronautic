import type { AfterburnerParams } from "./types";

// What a rocket burns, and how rich it burns it
//
// A rocket runs fuel-rich on purpose: lighter exhaust is faster exhaust, and a
// cooler chamber is a chamber that survives. What it does not burn leaves with
// the exhaust, and that one choice sets most of what the plume looks like:
//
// - the fuel left over burns again where it meets the air, the bright sheath
// - a hydrocarbon run rich cracks into soot, which is what makes a flame yellow
//   and its smoke dark; at an even mix there is oxygen enough to burn it clean
// - and the chamber is hottest a little rich of an even mix, cooler either side
//
// So these turn a fuel and a mixture ratio into the params that carry it. Each
// law is shaped from the combustion literature and scaled so the shipped
// engines come out where their presets are

/**
 * A rocket fuel, burnt with liquid oxygen.
 */
export type Fuel = "kerosene" | "methane" | "hydrogen";

/**
 * What a rocket burns, and in what proportion.
 */
export type Propellant = {
  fuel: Fuel;

  /**
   * Oxidiser over fuel, by mass: about 2.4 for kerosene engines, 3.6 for methane,
   * 6 for hydrogen. Below the fuel's stoichiometric ratio the engine runs rich
   */
  mixtureRatio: number;
};

type FuelData = {
  /** The mixture ratio at which every gram of fuel just burns */
  stoichiometric: number;

  /**
   * Soot per metre at an equivalence ratio of two, for an absorption that
   * climbs as the excess over the sooting threshold to the 1.5
   */
  soot: number;

  /** What the leftover fuel adds burning in the air, per share of it unburnt */
  afterburningK: number;
};

const FUELS: Record<Fuel, FuelData> = {
  // RP-1 cracks readily: a kerosene engine run rich is a sooty one
  kerosene: { stoichiometric: 3.4, soot: 7.5, afterburningK: 3100 },

  // Methane has one carbon, and next to no tendency to soot
  methane: { stoichiometric: 4, soot: 3.3, afterburningK: 5000 },

  // And hydrogen none at all
  hydrogen: { stoichiometric: 7.94, soot: 0, afterburningK: 2850 },
};

// Where soot begins to form, as an equivalence ratio: only past an even mix is
// there carbon with no oxygen to take it
const SOOTING_THRESHOLD = 1;

// The chamber's hottest mix, as an equivalence ratio
const HOTTEST = 1.05;

/**
 * How rich a propellant burns.
 * @param propellant The fuel and its mixture ratio
 * @returns Fuel over oxidiser against the stoichiometric: above one is rich
 */
export const equivalence_ratio = (propellant: Propellant): number =>
  FUELS[propellant.fuel].stoichiometric /
  Math.max(propellant.mixtureRatio, 1e-3);

/**
 * The chamber's temperature at one mix, as a share of its hottest.
 * @param equivalence The equivalence ratio
 * @returns 0.4 to 1
 */
const chamber_share = (equivalence: number): number =>
  Math.max(1 - 0.45 * (equivalence - HOTTEST) ** 2, 0.4);

/**
 * The params a propellant sets, from nothing but the fuel and its mix.
 *
 * The exhaust's temperatures are left out, as they hang on the expansion as
 * much as the mix; `propellant_params` scales them from a known engine.
 * @param propellant The fuel and its mixture ratio
 * @returns Soot, how much of it survives, and what the leftover fuel adds
 */
export const propellant_effects = (
  propellant: Propellant,
): Pick<AfterburnerParams, "sootPerM" | "sootSurvival" | "afterburningK"> => {
  const fuel = FUELS[propellant.fuel];
  const equivalence = equivalence_ratio(propellant);

  // The share of the fuel the oxygen could not burn
  const unburnt = Math.max(1 - 1 / equivalence, 0);

  const excess = Math.max(equivalence - SOOTING_THRESHOLD, 0);

  return {
    sootPerM: fuel.soot * excess ** 1.5,

    // The richer, the less oxygen the mixing layer has left to burn it with
    sootSurvival: Math.min(
      Math.max(0.15 + 1.36 * (equivalence - 1.11), 0),
      0.95,
    ),

    afterburningK: fuel.afterburningK * unburnt,
  };
};

/**
 * The params a propellant sets, against an engine already known to burn it.
 *
 * Each is scaled from the engine's own values by how far the mix has moved,
 * so a preset comes back exactly at its own mix. Without one to scale from,
 * the soot and afterburning come straight from `propellant_effects` and the
 * temperatures are left as they were.
 * @param propellant The fuel and its new mixture ratio
 * @param reference The engine, and what it burns at its own values
 * @returns The params to write over the engine's
 */
export const propellant_params = (
  propellant: Propellant,
  reference?: { params: AfterburnerParams; propellant: Propellant },
): Partial<AfterburnerParams> => {
  const effects = propellant_effects(propellant);

  if (
    reference === undefined ||
    reference.propellant.fuel !== propellant.fuel
  ) {
    return effects;
  }

  const base = propellant_effects(reference.propellant);
  const params = reference.params;

  const ratio = (now: number, then: number, value: number) =>
    then > 1e-6 ? (value * now) / then : now;

  const heat =
    chamber_share(equivalence_ratio(propellant)) /
    chamber_share(equivalence_ratio(reference.propellant));

  return {
    sootPerM: ratio(effects.sootPerM, base.sootPerM, params.sootPerM),
    sootSurvival: Math.min(
      ratio(effects.sootSurvival, base.sootSurvival, params.sootSurvival),
      0.95,
    ),
    afterburningK: ratio(
      effects.afterburningK,
      base.afterburningK,
      params.afterburningK,
    ),
    exitTemperatureK: params.exitTemperatureK * heat,
    dryTemperatureK: params.dryTemperatureK * heat,
  };
};
