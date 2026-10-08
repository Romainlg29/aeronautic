import { saturation_pressure, type MoistAir } from "@aeronautic/core";

// Water at cruise altitude: over ice, and over water far below freezing
//
// Core's Magnus fit is good from -40 to 50 °C, where wing vapour lives. A
// contrail forms at -40 to -70 °C, where it drifts by several per cent, and
// what decides whether a contrail lasts a second or an afternoon is a few per
// cent either side of ice saturation. So the saturation pressures here are
// Murphy and Koop's (2005), over ice and over supercooled water, good to a
// tenth of a per cent down to 123 K. The vapour the air carries is still
// core's, so the day is the one every other package flies through

/** Ice's density, kg/m³ */
export const ICE_DENSITY = 917;

/**
 * Below this, a droplet freezes as soon as it forms, without anything to
 * freeze on: the homogeneous freezing of water, in kelvin
 */
export const HOMOGENEOUS_FREEZING_K = 235.15;

/**
 * What water vapour's pressure is at saturation over ice.
 * Murphy and Koop's (2005) fit, from 110 K to freezing.
 * @param temperature_k The temperature, in kelvin
 * @returns The saturation vapour pressure, in pascals
 */
export const ice_saturation_pressure = (temperature_k: number): number => {
  const t = Math.max(temperature_k, 110);

  return Math.exp(
    9.550426 - 5723.265 / t + 3.53068 * Math.log(t) - 0.00728332 * t,
  );
};

/**
 * What water vapour's pressure is at saturation over liquid water, supercooled
 * far below freezing as the droplets in a young contrail are.
 * Murphy and Koop's (2005) fit, from 123 K to 332 K.
 * @param temperature_k The temperature, in kelvin
 * @returns The saturation vapour pressure, in pascals
 */
export const water_saturation_pressure = (temperature_k: number): number => {
  const t = Math.min(Math.max(temperature_k, 123), 332);
  const ln = Math.log(t);

  return Math.exp(
    54.842763 -
      6763.22 / t -
      4.21 * ln +
      0.000367 * t +
      Math.tanh(0.0415 * (t - 218.8)) *
        (53.878 - 1331.22 / t - 9.44523 * ln + 0.014025 * t),
  );
};

/**
 * How moist the air is over ice: its vapour over what ice would hold.
 * Above one the air is supersaturated over ice, and a contrail that forms in
 * it takes up the excess and lasts.
 * @param air The air, from core's `moist_air`
 * @returns The relative humidity over ice, 1 at saturation
 */
export const ice_humidity = (air: MoistAir): number =>
  air.vapourPa / ice_saturation_pressure(air.temperatureK);

/**
 * The relative humidity over water, as core and a `Flight` take it, that
 * holds a given humidity over ice at a temperature.
 *
 * Weather reports give humidity over water, but contrails are told by the
 * humidity over ice: at -55 °C, air at 100 % over ice is 59 % over water.
 * @param ice_humidity Relative humidity over ice, 1 at saturation
 * @param temperature_k The air's temperature, in kelvin
 * @returns The relative humidity over water, 0 to 1, as core's `moist_air`
 *   reads it
 */
export const humidity_over_water = (
  ice_humidity: number,
  temperature_k: number,
): number =>
  Math.min(
    Math.max(
      (ice_humidity * ice_saturation_pressure(temperature_k)) /
        saturation_pressure(temperature_k),
      0,
    ),
    1,
  );
