import {
  chromaticity_rgb,
  planckian,
  type Chromaticity,
} from "@aeronautic/core";

export { chromaticity_rgb, planckian, type Chromaticity };

// The lights' colours, from their chromaticity
//
// The rule gives aviation red, green and white as regions of the CIE 1931
// chromaticity diagram (25.1397). A light is a point in its region: an LED's
// narrow line, near the spectral locus, or a hot filament's or an arc's
// blackbody, on the Planckian locus. Core's `chromaticity_rgb` turns the
// point into its colour, and `planckian` a temperature into the point

/**
 * Aviation red as a red LED gives it: its line at 625 nm, the CIE 1931
 * colour matching functions' x̄ 0.7514, ȳ 0.3210, z̄ 0.0001 there.
 */
export const LED_RED: Chromaticity = [0.7006, 0.2993];

/**
 * Aviation green as a green LED gives it: its line at 525 nm, x̄ 0.1096,
 * ȳ 0.7932, z̄ 0.0573.
 */
export const LED_GREEN: Chromaticity = [0.1142, 0.8262];

/** CIE standard illuminant A, the tungsten filament lamp, in kelvin */
export const ILLUMINANT_A_K = 2856;

/**
 * Whether a chromaticity is aviation red (25.1397): y no more than 0.335,
 * z no more than 0.002.
 * @param chromaticity x, y
 * @returns Whether it is
 */
export const is_aviation_red = ([x, y]: Chromaticity): boolean =>
  y <= 0.335 && 1 - x - y <= 0.002;

/**
 * Whether a chromaticity is aviation green (25.1397).
 * @param chromaticity x, y
 * @returns Whether it is
 */
export const is_aviation_green = ([x, y]: Chromaticity): boolean =>
  x <= 0.44 - 0.32 * y && x <= y - 0.17 && y >= 0.39 - 0.17 * x;

/**
 * Whether a chromaticity is aviation white (25.1397): between x 0.300 and
 * 0.540, near the Planckian locus.
 * @param chromaticity x, y
 * @returns Whether it is
 */
export const is_aviation_white = ([x, y]: Chromaticity): boolean => {
  if (x < 0.3 || x > 0.54) return false;

  // The locus's y at this x, read off the fits by bisection on temperature
  let low = 1667;
  let high = 25000;

  for (let step = 0; step < 60; step++) {
    const middle = Math.sqrt(low * high);

    if (planckian(middle)[0] > x) low = middle;
    else high = middle;
  }

  const locus_y = planckian(low)[1];

  return (
    y >= Math.min(x - 0.04, locus_y - 0.01) &&
    y <= x + 0.02 &&
    y <= 0.636 - 0.4 * x
  );
};
