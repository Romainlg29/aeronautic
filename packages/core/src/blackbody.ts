// A colour from its chromaticity
//
// A light's colour is a point of the CIE 1931 chromaticity diagram: a hot
// body's on the Planckian locus, a spectral line's near the spectral locus.
// From the point and a luminance of one candela per square metre the colour
// follows in linear sRGB, so a light's colour times its intensity in candela
// is its light in the scene's units

/** A chromaticity, CIE 1931 x and y */
export type Chromaticity = readonly [number, number];

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
