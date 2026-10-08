import { standard_atmosphere } from "@aeronautic/core";

// The air between a light and the eye
//
// Light is lost on its way through the air to the molecules, which scatter
// blue far more than red (Rayleigh, as λ⁻⁴), and to the haze's aerosol,
// which scatters nearly alike (as λ^-1.3, Ångström's exponent for
// continental haze). Together they set the day's visibility: Koschmieder's
// meteorological range, the distance at which a black target's contrast
// falls to 2 %, is 3.912 over the extinction at 550 nm. So the aerosol is
// what is left of that once the molecules' share is taken out, and a light
// far off is both dimmer and redder
//
// Three wavelengths stand for the display's red, green and blue: 680, 550
// and 440 nm, as Bruneton's atmosphere has them

/** The Rayleigh scattering of sea-level air at 680, 550 and 440 nm, per metre */
export const RAYLEIGH_SEA_LEVEL: readonly [number, number, number] = [
  5.802e-6, 13.558e-6, 33.1e-6,
];

/** The three wavelengths, nanometres */
export const WAVELENGTHS_NM: readonly [number, number, number] = [
  680, 550, 440,
];

/** Koschmieder's constant: -ln 0.02, the contrast threshold */
export const KOSCHMIEDER = 3.912;

/** Ångström's exponent for continental haze */
export const ANGSTROM_EXPONENT = 1.3;

/**
 * How much of the light the haze scatters rather than absorbs: continental
 * aerosol's single scattering albedo at 550 nm, about 0.9.
 */
export const AEROSOL_ALBEDO = 0.9;

/**
 * Henyey–Greenstein's asymmetry for haze: about 0.7, light scattered mostly
 * forward.
 */
export const AEROSOL_ASYMMETRY = 0.7;

/**
 * The air's density as a share of the standard sea level's.
 * @param altitude_m Metres above sea level
 * @returns ρ / ρ₀
 */
export const density_ratio = (altitude_m: number): number => {
  const air = standard_atmosphere(altitude_m);

  return (air.pressure * 288.15) / air.temperatureK;
};

/**
 * The air's extinction, per metre at each wavelength.
 */
export type Extinction = {
  /** By the molecules, which absorb nothing */
  rayleigh: [number, number, number];

  /** By the haze, scattered and absorbed */
  aerosol: [number, number, number];
};

/**
 * The air's extinction from the day's visibility.
 * @param visibility_m The meteorological range, metres
 * @param density The air's density as a share of sea level's
 * @returns Per metre at 680, 550 and 440 nm
 */
export const extinction = (visibility_m: number, density = 1): Extinction => {
  const rayleigh = RAYLEIGH_SEA_LEVEL.map((beta) => beta * density) as [
    number,
    number,
    number,
  ];

  // What the visibility leaves the haze, at 550 nm, and at the others by
  // Ångström's law
  const total = KOSCHMIEDER / Math.max(visibility_m, 1);
  const haze = Math.max(total - rayleigh[1], 0);
  const aerosol = WAVELENGTHS_NM.map(
    (wavelength) => haze * (wavelength / 550) ** -ANGSTROM_EXPONENT,
  ) as [number, number, number];

  return { rayleigh, aerosol };
};

/**
 * How much of a light gets through a length of the air, at each wavelength.
 * @param air Its extinction
 * @param distance_m How far
 * @param target Where to write it
 * @returns target: 0 to 1, red, green and blue
 */
export const transmission = (
  air: Extinction,
  distance_m: number,
  target: [number, number, number] = [0, 0, 0],
): [number, number, number] => {
  for (let channel = 0; channel < 3; channel++) {
    target[channel] = Math.exp(
      -(air.rayleigh[channel] + air.aerosol[channel]) * distance_m,
    );
  }

  return target;
};
