import { humidity_over_water } from "@aeronautic/contrails/physics";
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

// The ISA tropopause, -56.5 °C, in air 112 % saturated over ice: cold enough
// for the engines' exhaust to make a contrail, humid enough for it to stay.
// Down low, on the summer day, the exhaust is far too warm to make one
export const TROPOPAUSE_M = 11_000;
const TROPOPAUSE_K = 216.65;
const ICE_HUMIDITY = 1.12;

export const HIGH_AIR = {
  altitudeM: TROPOPAUSE_M,
  temperatureOffsetK: 0,
  relativeHumidity: humidity_over_water(ICE_HUMIDITY, TROPOPAUSE_K),
};

// How low and how high it may be flown: a wingspan or so over the waves, and
// the F-15's and F-16's service ceiling, 50,000 ft
export const FLOOR_M = 30;
export const CEILING_M = 15_240;

/**
 * The air at an altitude: the ISA's lapse, and the day's warmth and its
 * humidity drawn straight from the sea's air to the tropopause's, the
 * tropopause's above it. An estimate between the two: a real sounding has its
 * own.
 * @param altitude_m The altitude, metres
 * @returns The flight's air there
 */
export const air_at = (altitude_m: number) => {
  const share = Math.min(
    Math.max((altitude_m - AIR.altitudeM) / (TROPOPAUSE_M - AIR.altitudeM), 0),
    1,
  );

  return {
    altitudeM: altitude_m,
    temperatureOffsetK:
      AIR.temperatureOffsetK +
      (HIGH_AIR.temperatureOffsetK - AIR.temperatureOffsetK) * share,
    relativeHumidity:
      AIR.relativeHumidity +
      (HIGH_AIR.relativeHumidity - AIR.relativeHumidity) * share,
  };
};
