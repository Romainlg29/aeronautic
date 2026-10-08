import { SEA_LEVEL_K, SEA_LEVEL_PA } from "@aeronautic/core";

// How much thrust the engines have left at altitude
//
// A gas turbine run at the same corrected speed, in the same flight Mach
// number, passes the same corrected flow: its thrust scales with the total
// pressure at its inlet, δ₀ = p/p_SL · (1 + 0.2 M²)^3.5. That is Mattingly's
// lapse for a low-bypass, mixed-flow turbofan at maximum power, up to the
// throttle ratio, the total temperature θ₀ = T/T_SL · (1 + 0.2 M²) its
// controls hold the turbine at; past it the turbine runs out of temperature
// and the thrust falls the faster, by 3.5 (θ₀ − TR)/θ₀ (Mattingly, Heiser
// and Pratt, Aircraft Engine Design, 2nd ed., 2002, eq. 2.54)
//
// At 11 km and Mach 0.85 that is 0.36 of the sea-level static thrust

// θ₀ the engine is matched at: the ratio at which the lapse breaks
export const THROTTLE_RATIO = 1;

/**
 * The share of its sea-level static thrust an engine has at full power.
 * @param pressure_pa The air's static pressure, Pa
 * @param temperature_k The air's static temperature, K
 * @param mach The flight Mach number
 * @returns The lapse, 0 to over 1 when ram makes up for the altitude
 */
export const thrust_lapse = (
  pressure_pa: number,
  temperature_k: number,
  mach: number,
): number => {
  const ram = 1 + 0.2 * Math.max(mach, 0) ** 2;
  const delta_0 = (pressure_pa / SEA_LEVEL_PA) * ram ** 3.5;
  const theta_0 = (temperature_k / SEA_LEVEL_K) * ram;

  if (theta_0 <= THROTTLE_RATIO) return delta_0;

  return Math.max(
    delta_0 * (1 - (3.5 * (theta_0 - THROTTLE_RATIO)) / theta_0),
    0,
  );
};
