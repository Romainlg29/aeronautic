// The air the aircraft flies through, and the water it carries
//
// The International Standard Atmosphere for the pressure and the temperature,
// and the moist air on top of it: how much vapour the air holds, and how much
// it could. Everything the vapour does comes down to the gap between the two,
// so this is the module the rest of the package is measured against

// g₀M/R*, in kelvin per metre: what the hydrostatic equation integrates over
const HYDROSTATIC = 0.0341632;

export const SEA_LEVEL_K = 288.15;
export const SEA_LEVEL_PA = 101_325;

export const AIR_GAMMA = 1.4;

// Dry air's gas constant and heat capacity at constant pressure, J/(kg K)
export const AIR_GAS_CONSTANT = 287.05;
export const AIR_CP = 1004.6;

// Water vapour's molar mass over dry air's
export const VAPOUR_RATIO = 0.622;

// The latent heat of condensation near freezing, J/kg
// It falls by a few per cent from 0 to 40 °C, less than the rest is known to
export const LATENT_HEAT = 2.501e6;

// Where each layer starts, in metres, and its lapse rate in kelvin per metre
// Above the last the air is taken as isothermal. Vapour is a tropospheric
// business, but a jet may fly higher and the air above still has to be right
const LAYERS: [base_m: number, lapse_k_m: number][] = [
  [0, -0.0065],
  [11_000, 0],
  [20_000, 0.001],
  [32_000, 0.0028],
  [47_000, 0],
];

const CEILING_M = 51_000;

/**
 * The air at one altitude, with the water in it.
 */
export type MoistAir = {
  // In kelvin, the day's offset included
  temperature_k: number;

  // In pascals
  pressure_pa: number;

  // In kilograms per cubic metre
  density_kg_m3: number;

  // How fast sound runs in it, metres per second
  sound_m_s: number;

  // The vapour's partial pressure, in pascals
  vapour_pa: number;

  // Kilograms of vapour per kilogram of dry air
  mixing_ratio: number;

  // Where the vapour would start to condense if the air were cooled at this
  // pressure, in kelvin
  dew_point_k: number;

  // The relative humidity it was made with, 0 to 1
  relative_humidity: number;
};

/**
 * The standard atmosphere's temperature and pressure at one altitude.
 * @param altitude_m Metres above sea level
 * @returns The standard temperature in kelvin and the pressure in pascals
 */
export const standard_atmosphere = (
  altitude_m: number,
): { temperature_k: number; pressure_pa: number } => {
  const height = Math.max(0, Math.min(altitude_m, CEILING_M));

  let temperature_k = SEA_LEVEL_K;
  let pressure = 1;

  for (let index = 0; index < LAYERS.length; index++) {
    const [base, lapse] = LAYERS[index];
    const top = LAYERS[index + 1]?.[0] ?? Infinity;

    const rise = Math.min(height, top) - base;

    if (rise <= 0) {
      break;
    }

    const next_k = temperature_k + lapse * rise;

    pressure *=
      lapse === 0
        ? Math.exp((-HYDROSTATIC * rise) / temperature_k)
        : Math.pow(next_k / temperature_k, -HYDROSTATIC / lapse);

    temperature_k = next_k;
  }

  return { temperature_k, pressure_pa: pressure * SEA_LEVEL_PA };
};

/**
 * What water vapour's pressure is at saturation, over liquid water.
 *
 * Over liquid even below freezing: the droplets a sudden expansion makes are
 * supercooled, and freeze far too slowly to matter in the tenth of a second
 * they live. Alduchov and Eskridge's Magnus fit, good to a few tenths of a per
 * cent from -40 to 50 °C.
 * @param temperature_k The temperature, in kelvin
 * @returns The saturation vapour pressure, in pascals
 */
export const saturation_pressure = (temperature_k: number): number => {
  const celsius = temperature_k - 273.15;

  return 610.94 * Math.exp((17.625 * celsius) / (celsius + 243.04));
};

/**
 * The temperature at which vapour at one partial pressure saturates.
 * The Magnus fit, inverted.
 * @param vapour_pa The vapour's partial pressure, in pascals
 * @returns The dew point, in kelvin
 */
export const dew_point = (vapour_pa: number): number => {
  const ln = Math.log(Math.max(vapour_pa, 1e-6) / 610.94);

  return 273.15 + (243.04 * ln) / (17.625 - ln);
};

/**
 * How much vapour a kilogram of dry air carries, at one vapour pressure.
 * @param vapour_pa The vapour's partial pressure, in pascals
 * @param pressure_pa The total pressure, in pascals
 * @returns Kilograms of vapour per kilogram of dry air
 */
export const mixing_ratio = (vapour_pa: number, pressure_pa: number): number =>
  (VAPOUR_RATIO * vapour_pa) / Math.max(pressure_pa - vapour_pa, 1);

/**
 * The air at one altitude on one day.
 *
 * The pressure is the standard one at the altitude, and the day's offset warms
 * the air at that pressure, so a hot day is a thinner one. The humidity is
 * relative, as a weather report gives it, so the same 90 % holds far more
 * water on a hot day than on a cold one.
 * @param altitude_m Metres above sea level
 * @param relative_humidity 0 to 1
 * @param temperature_offset_k How much warmer the day is than the standard one
 * @returns The air
 */
export const moist_air = (
  altitude_m: number,
  relative_humidity: number,
  temperature_offset_k = 0,
): MoistAir => {
  const standard = standard_atmosphere(altitude_m);

  const temperature_k = Math.max(
    standard.temperature_k + temperature_offset_k,
    150,
  );

  const humidity = Math.min(Math.max(relative_humidity, 0), 1);

  // Never more than the air's own pressure, however hot the day
  const vapour_pa = Math.min(
    humidity * saturation_pressure(temperature_k),
    standard.pressure_pa * 0.5,
  );

  const density_kg_m3 =
    (standard.pressure_pa - 0.378 * vapour_pa) /
    (AIR_GAS_CONSTANT * temperature_k);

  return {
    temperature_k,
    pressure_pa: standard.pressure_pa,
    density_kg_m3,
    sound_m_s: Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * temperature_k),
    vapour_pa,
    mixing_ratio: mixing_ratio(vapour_pa, standard.pressure_pa),
    dew_point_k: dew_point(vapour_pa),
    relative_humidity: humidity,
  };
};
