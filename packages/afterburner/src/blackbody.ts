import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
} from "three";

// What colour, and how bright, a thing at one temperature glows
//
// Planck's law integrated against the CIE 1931 observer and taken into linear
// sRGB, which is the whole reason a plume reads as *fire*: the colour of soot
// at 1500 K and the colour of it at 2500 K are not two picks off a palette,
// they are one curve, and its brightness climbs about a hundredfold between
// the two. Nothing else in the shader decides what colour the flame is
//
// Normalised so a blackbody at REFERENCE_TEMPERATURE_K has a luminance of one,
// which is the unit every emission in the plume is measured in

/** The temperature whose blackbody has a luminance of exactly one */
export const REFERENCE_TEMPERATURE_K = 2000;

/** The coolest and hottest temperatures the lookup covers */
export const BLACKBODY_MIN_K = 500;
export const BLACKBODY_MAX_K = 6000;

/** How many texels the lookup has */
export const BLACKBODY_TEXELS = 256;

// The CIE 1931 2° observer as a sum of piecewise Gaussians (Wyman, Sloan and
// Shirley 2013), which is within a percent or two of the tabulated curves
const lobe = (nm: number, mean: number, below: number, above: number) => {
  const t = (nm - mean) / (nm < mean ? below : above);

  return Math.exp(-0.5 * t * t);
};

const cie_x = (nm: number) =>
  1.056 * lobe(nm, 599.8, 37.9, 31.0) +
  0.362 * lobe(nm, 442.0, 16.0, 26.7) -
  0.065 * lobe(nm, 501.1, 20.4, 26.2);

const cie_y = (nm: number) =>
  0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);

const cie_z = (nm: number) =>
  1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);

/**
 * Spectral radiance of a blackbody, in arbitrary but consistent units.
 * @param nm Wavelength, in nanometres
 * @param temperature_k Temperature, in kelvin
 * @returns The radiance
 */
const planck = (nm: number, temperature_k: number): number => {
  const metres = nm * 1e-9;

  return (
    3.7418e-16 /
    Math.pow(metres, 5) /
    Math.expm1(0.014388 / (metres * temperature_k))
  );
};

/**
 * A blackbody in linear sRGB, unnormalised.
 * @param temperature_k Temperature, in kelvin
 * @returns [r, g, b, luminance]
 */
const blackbody_raw = (
  temperature_k: number,
): [number, number, number, number] => {
  let x = 0;
  let y = 0;
  let z = 0;

  for (let nm = 380; nm <= 780; nm += 2) {
    const radiance = planck(nm, temperature_k);

    x += radiance * cie_x(nm);
    y += radiance * cie_y(nm);
    z += radiance * cie_z(nm);
  }

  // XYZ to linear sRGB, D65. Out of gamut is clipped rather than carried: a
  // deep red glow has a slightly negative blue, which no display can show
  return [
    Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z),
    Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z),
    Math.max(0, 0.0557 * x - 0.204 * y + 1.057 * z),
    y,
  ];
};

const REFERENCE_LUMINANCE = blackbody_raw(REFERENCE_TEMPERATURE_K)[3];

/**
 * What a blackbody at one temperature glows, in linear sRGB.
 * @param temperature_k Temperature, in kelvin
 * @returns [r, g, b], a luminance of one at the reference temperature
 */
export const blackbody_rgb = (
  temperature_k: number,
): [number, number, number] => {
  const [r, g, b] = blackbody_raw(temperature_k);

  return [
    r / REFERENCE_LUMINANCE,
    g / REFERENCE_LUMINANCE,
    b / REFERENCE_LUMINANCE,
  ];
};

/**
 * The luminance of a blackbody, relative to the reference temperature.
 * @param temperature_k Temperature, in kelvin
 * @returns The luminance, one at the reference temperature
 */
export const blackbody_luminance = (temperature_k: number): number =>
  blackbody_raw(temperature_k)[3] / REFERENCE_LUMINANCE;

let lut: DataTexture | null = null;

/**
 * The blackbody lookup the shader samples, built once and shared.
 *
 * rgb is the colour divided by its luminance, which is gentle, and alpha is
 * the luminance's base-two log, which is a nearly straight line in 1/T. So a
 * linear filter between texels interpolates both well, and a half float holds
 * all of it: the luminance runs over twenty orders of magnitude here.
 * @returns The texture
 */
export const get_blackbody_lut = (): DataTexture => {
  if (lut !== null) {
    return lut;
  }

  const data = new Uint16Array(BLACKBODY_TEXELS * 4);

  for (let texel = 0; texel < BLACKBODY_TEXELS; texel++) {
    const temperature_k =
      BLACKBODY_MIN_K +
      ((BLACKBODY_MAX_K - BLACKBODY_MIN_K) * texel) / (BLACKBODY_TEXELS - 1);

    const [r, g, b, y] = blackbody_raw(temperature_k);
    const luminance = Math.max(y, 1e-30);

    data[texel * 4] = DataUtils.toHalfFloat(r / luminance);
    data[texel * 4 + 1] = DataUtils.toHalfFloat(g / luminance);
    data[texel * 4 + 2] = DataUtils.toHalfFloat(b / luminance);
    data[texel * 4 + 3] = DataUtils.toHalfFloat(
      Math.log2(luminance / REFERENCE_LUMINANCE),
    );
  }

  lut = new DataTexture(data, BLACKBODY_TEXELS, 1, RGBAFormat, HalfFloatType);

  lut.name = "afterburner_blackbody";
  lut.magFilter = LinearFilter;
  lut.minFilter = LinearFilter;
  lut.wrapS = ClampToEdgeWrapping;
  lut.wrapT = ClampToEdgeWrapping;
  lut.generateMipmaps = false;
  lut.needsUpdate = true;

  return lut;
};
