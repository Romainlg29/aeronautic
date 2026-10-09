// A flame as the eye and a seeker see it
//
// The flame of a magnesium–Teflon flare is a cloud of hot carbon and
// magnesium oxide, so dense that it radiates near enough as a graybody:
// Planck's law at its temperature, times an emissivity a little below one.
// Its makers measure it in a seeker's band, 1.8 to 2.6 µm; the eye sees it
// through the photopic curve. One temperature ties the two: the ratio of
// what the flame gives the eye to what it gives the band is the ratio of
// those two integrals of Planck's law, whatever its size or emissivity. And
// the band's intensity over the band's radiance is the flame's area

/** Planck's constant, J s */
const PLANCK_H = 6.62607015e-34;

/** The speed of light, m/s */
const LIGHT_C = 2.99792458e8;

/** Boltzmann's constant, J/K */
const BOLTZMANN_K = 1.380649e-23;

/** The most luminous efficacy, lm/W, at 555 nm: the candela's definition */
export const KM = 683;

/**
 * The CIE 1924 photopic luminosity function V(λ), every 10 nm from 380 to
 * 780 nm, as CIE 018:2019 tabulates it.
 */
export const PHOTOPIC: readonly number[] = [
  0.000039, 0.00012, 0.000396, 0.00121, 0.004, 0.0116, 0.023, 0.038, 0.06,
  0.09098, 0.13902, 0.20802, 0.323, 0.503, 0.71, 0.862, 0.954, 0.99495, 0.995,
  0.952, 0.87, 0.757, 0.631, 0.503, 0.381, 0.265, 0.175, 0.107, 0.061, 0.032,
  0.017, 0.00821, 0.004102, 0.002091, 0.001047, 0.00052, 0.000249, 0.00012,
  0.00006, 0.00003, 0.000015,
];

/** The first wavelength of `PHOTOPIC`, metres */
const PHOTOPIC_START_M = 380e-9;

/** Its step, metres */
const PHOTOPIC_STEP_M = 10e-9;

/**
 * A blackbody's spectral radiance, Planck's law.
 * @param wavelength_m The wavelength, metres
 * @param temperature_k Its temperature, kelvin
 * @returns W/(m² sr m)
 */
export const planck = (wavelength_m: number, temperature_k: number): number =>
  (2 * PLANCK_H * LIGHT_C ** 2) /
  wavelength_m ** 5 /
  Math.expm1(
    (PLANCK_H * LIGHT_C) / (wavelength_m * BOLTZMANN_K * temperature_k),
  );

/**
 * A blackbody's radiance over a band of wavelengths.
 * @param low_m The band's short end, metres
 * @param high_m Its long end, metres
 * @param temperature_k The temperature, kelvin
 * @returns W/(m² sr)
 */
export const band_radiance = (
  low_m: number,
  high_m: number,
  temperature_k: number,
): number => {
  // Planck's law is smooth over a band this narrow: the midpoint rule
  const steps = 256;
  const step = (high_m - low_m) / steps;
  let sum = 0;

  for (let index = 0; index < steps; index++) {
    sum += planck(low_m + (index + 0.5) * step, temperature_k);
  }

  return sum * step;
};

/**
 * A blackbody's luminance: its spectrum through the photopic curve.
 * @param temperature_k The temperature, kelvin
 * @returns cd/m²
 */
export const blackbody_luminance = (temperature_k: number): number => {
  // The trapezoid rule over the CIE's own 10 nm table, whose ends are nil
  let sum = 0;

  for (let index = 0; index < PHOTOPIC.length; index++) {
    const weight = index === 0 || index === PHOTOPIC.length - 1 ? 0.5 : 1;
    const wavelength = PHOTOPIC_START_M + index * PHOTOPIC_STEP_M;

    sum += weight * PHOTOPIC[index] * planck(wavelength, temperature_k);
  }

  return KM * sum * PHOTOPIC_STEP_M;
};
