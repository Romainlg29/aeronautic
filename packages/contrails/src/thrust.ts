import { SEA_LEVEL_K, SEA_LEVEL_PA } from "@aeronautic/core";

// How much thrust the engines have left at altitude, and what reheat costs
//
// A gas turbine run at the same corrected speed, in the same flight Mach
// number, passes the same corrected flow: its thrust scales with the total
// pressure at its inlet, δ₀ = p/p_SL · (1 + 0.2 M²)^3.5. That is Mattingly's
// lapse for a low-bypass, mixed-flow turbofan, up to the throttle ratio, the
// total temperature θ₀ = T/T_SL · (1 + 0.2 M²) its controls hold the turbine
// at; past it the turbine runs out of temperature and the thrust falls the
// faster, by 3.5 (θ₀ − TR)/θ₀ at maximum power and 3.8 at military, dry
// (Mattingly, Heiser and Pratt, Aircraft Engine Design, 2nd ed., 2002,
// eq. 2.54)
//
// At 11 km and Mach 0.85 that is 0.36 of the sea-level static thrust
//
// Reheat burns fuel in the exhaust, at the pressure the turbine left it at, so
// far less of its heat becomes thrust: the same engine's consumption at
// maximum power over military is (1.6 + 0.27 M) / (0.9 + 0.30 M) (ibid.,
// eq. 3.55), 1.8 standing and 1.6 at Mach 0.85

// θ₀ the engine is matched at: the ratio at which the lapse breaks
export const THROTTLE_RATIO = 1;

/**
 * Which power an engine runs at: `maximum`, with full reheat if it has it,
 * or `military`, the most it makes dry.
 */
export type EnginePower = "maximum" | "military";

// How fast each power's thrust falls once the turbine runs out of temperature
const HOT_LAPSE: Record<EnginePower, number> = { maximum: 3.5, military: 3.8 };

/**
 * The share of its sea-level static thrust an engine has at one power.
 * @param pressure_pa The air's static pressure, Pa
 * @param temperature_k The air's static temperature, K
 * @param mach The flight Mach number
 * @param power Maximum, with reheat, or military, dry. Maximum by default
 * @returns The lapse, 0 to over 1 when ram makes up for the altitude
 */
export const thrust_lapse = (
  pressure_pa: number,
  temperature_k: number,
  mach: number,
  power: EnginePower = "maximum",
): number => {
  const ram = 1 + 0.2 * Math.max(mach, 0) ** 2;
  const delta_0 = (pressure_pa / SEA_LEVEL_PA) * ram ** 3.5;
  const theta_0 = (temperature_k / SEA_LEVEL_K) * ram;

  if (theta_0 <= THROTTLE_RATIO) return delta_0;

  return Math.max(
    delta_0 * (1 - (HOT_LAPSE[power] * (theta_0 - THROTTLE_RATIO)) / theta_0),
    0,
  );
};

/**
 * How much more fuel each newton costs at full reheat than dry at military
 * power, the same engine at the same flight Mach number.
 * @param mach The flight Mach number
 * @returns The ratio of the two consumptions, about 1.6 to 1.8
 */
export const reheat_consumption = (mach: number): number => {
  const m = Math.max(mach, 0);

  return (1.6 + 0.27 * m) / (0.9 + 0.3 * m);
};
