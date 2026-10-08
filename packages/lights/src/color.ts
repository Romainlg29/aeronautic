// The lights' colours, from their chromaticity
//
// The rule gives aviation red, green and white as regions of the CIE 1931
// chromaticity diagram (25.1397). A light is a point in its region: an LED's
// narrow line, near the spectral locus, or a hot filament's or an arc's
// blackbody, on the Planckian locus. From the point and a luminance of one
// candela per square metre the colour follows in linear sRGB, so a light's
// colour times its intensity in candela is its light in the scene's units

/** A chromaticity, CIE 1931 x and y */
export type Chromaticity = readonly [number, number];

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
 * A blackbody's chromaticity, from Kim et al.'s cubic fits to the Planckian
 * locus (US patent 7,024,034, 2006), good from 1667 K to 25000 K.
 * @param temperature_k The colour temperature, kelvin
 * @returns Its chromaticity
 */
export const planckian = (temperature_k: number): Chromaticity => {
  const t = Math.min(Math.max(temperature_k, 1667), 25000);
  const t1 = 1e3 / t;
  const t2 = t1 * t1;
  const t3 = t2 * t1;

  const x =
    t <= 4000
      ? -0.2661239 * t3 - 0.234358 * t2 + 0.8776956 * t1 + 0.17991
      : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t1 + 0.24039;

  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 -
          1.37418593 * x ** 2 +
          2.09137015 * x -
          0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;

  return [x, y];
};

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

/**
 * The linear sRGB colour of a chromaticity at a luminance of one.
 *
 * A spectral line is outside sRGB's gamut, and comes out with a negative
 * channel. It is desaturated towards white at the same luminance, just far
 * enough to bring it in: the nearest a display can show of it, as bright.
 * @param chromaticity x, y
 * @returns Linear sRGB whose luminance, 0.2126 R + 0.7152 G + 0.0722 B, is 1
 */
export const chromaticity_rgb = ([x, y]: Chromaticity): readonly [
  number,
  number,
  number,
] => {
  const safe_y = Math.max(y, 1e-6);
  const cx = x / safe_y;
  const cz = (1 - x - y) / safe_y;

  // XYZ to linear sRGB, IEC 61966-2-1's D65 matrix
  const r = 3.2404542 * cx - 1.5371385 - 0.4985314 * cz;
  const g = -0.969266 * cx + 1.8760108 + 0.041556 * cz;
  const b = 0.0556434 * cx - 0.2040259 + 1.0572252 * cz;

  // White of luminance one is (1, 1, 1): mixed in, and the sum renormalised
  // to keep the luminance
  const white = Math.max(-Math.min(r, g, b), 0);

  return [
    (r + white) / (1 + white),
    (g + white) / (1 + white),
    (b + white) / (1 + white),
  ];
};
