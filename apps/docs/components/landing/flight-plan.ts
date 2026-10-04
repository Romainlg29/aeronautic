import { moist_air } from "@aeronautic/core";

// What the landing's flight is flown in and how fast it may go, shared by the
// scene and by the flight the keyboard writes. Kept out of the scene so the
// page can read it without loading three

// A humid summer day, just over the sea
export const AIR = {
  altitudeM: 100,
  temperatureOffsetK: 10,
  relativeHumidity: 0.88,
};

export const MOIST = moist_air(
  AIR.altitudeM,
  AIR.relativeHumidity,
  AIR.temperatureOffsetK,
);

// This low, a fighter is held back by its airframe, not its thrust: the
// dynamic pressure the structure is cleared for, placarded on the F-15 and
// the F-16 as 800 knots calibrated. Calibrated is equivalent airspeed this
// low, so the true speed is that over the root of the density ratio, about
// Mach 1.2 on this day
const LIMIT_KCAS = 800;
const KNOT_M_PER_S = 0.514444;
const SEA_LEVEL_DENSITY_KG_PER_M3 = 1.225;

// The Mach number it settles at, at idle, at military power and at full
// reheat, clean
export const IDLE_MACH = 0.3;
export const DRY_MACH = 0.9;
export const REHEAT_MACH =
  (LIMIT_KCAS *
    KNOT_M_PER_S *
    Math.sqrt(SEA_LEVEL_DENSITY_KG_PER_M3 / MOIST.densityKgPerM3)) /
  MOIST.soundMPerS;

/**
 * The Mach number a throttle setting settles at, clean: idle to military
 * power, then on through the reheat. The drag climbs steeply round Mach one,
 * so the first of the reheat buys the least speed.
 * @param throttle The throttle, 0 to 1.1
 * @returns The Mach number
 */
export const cruise_mach = (throttle: number) =>
  throttle <= 1
    ? IDLE_MACH + (DRY_MACH - IDLE_MACH) * throttle
    : DRY_MACH + (REHEAT_MACH - DRY_MACH) * ((throttle - 1) / 0.1) ** 2;

// Where it starts: just over Mach one, the vapor cone on it, and the throttle
// that holds it there, `cruise_mach` turned round
const START_MACH = 1.04;

export const START_THROTTLE =
  1 + 0.1 * Math.sqrt((START_MACH - DRY_MACH) / (REHEAT_MACH - DRY_MACH));
