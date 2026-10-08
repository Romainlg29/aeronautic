import { AEROSOL_ALBEDO, AEROSOL_ASYMMETRY, type Extinction } from "./haze";

// The landing and taxi lights' beams
//
// A lamp's catalogue gives its peak, its beam's spread across and up, and
// its colour. The spread is the full angle out to a tenth of the peak, as
// lamp catalogues mostly give it. A sealed-beam lamp's pattern falls off
// smoothly from its axis, so it is taken as an elliptical Gaussian through
// those points:
//
//   I = I₀ exp(-ln 10 ((θh / (Wh/2))² + (θv / (Wv/2))²)),
//
// θh and θv the angles off the axis across and up, Wh and Wv the spreads.
// The beam lights what it reaches, as I/r², and is seen in the air it
// crosses: the molecules and the haze scatter a little of it towards the
// eye, the haze mostly forward, which is why a beam is brightest looking
// back along it

/**
 * A lamp, as its catalogue gives it.
 */
export type Lamp = {
  /** On its axis, candela */
  peakCd: number;

  /** The beam's full width to a tenth of the peak, across and up, degrees */
  spreadDeg: readonly [number, number];

  /** Its colour temperature, kelvin */
  temperatureK: number;
};

/**
 * Lamps, by name.
 */
export const LAMP = {
  /**
   * A 600 W PAR-64 sealed-beam landing lamp: 600 000 cd, 11° across and 12°
   * up. Its tungsten filament is taken at CIE illuminant A's 2856 K
   */
  landing: { peakCd: 600_000, spreadDeg: [11, 12], temperatureK: 2856 },

  /**
   * A 250 W PAR-46 taxi floodlight: 75 000 cd over a wide, flat beam, 50°
   * across and 10° up, its filament taken at 2856 K too
   */
  taxi: { peakCd: 75_000, spreadDeg: [50, 10], temperatureK: 2856 },
} as const satisfies Record<string, Lamp>;

/** A lamp's name */
export type LampName = keyof typeof LAMP;

/** ln 10: the Gaussian's exponent at the spread's edge, a tenth */
const LN10 = Math.log(10);

/**
 * A lamp's intensity towards a direction in its own frame: z along its axis,
 * x across, y up.
 * @param lamp The lamp
 * @param x Across
 * @param y Up
 * @param z Along the axis
 * @returns Candela
 */
export const beam_intensity = (
  lamp: Lamp,
  x: number,
  y: number,
  z: number,
): number => {
  if (z <= 0) return 0;

  const across = Math.atan2(x, z) / ((lamp.spreadDeg[0] * Math.PI) / 360);
  const up = Math.atan2(y, z) / ((lamp.spreadDeg[1] * Math.PI) / 360);

  return lamp.peakCd * Math.exp(-LN10 * (across * across + up * up));
};

/**
 * The half-angles, across and up, at which a beam falls to a share of its
 * peak.
 * @param lamp The lamp
 * @param share 0 to 1
 * @returns Radians, across and up
 */
export const beam_half_angles = (
  lamp: Lamp,
  share: number,
): [number, number] => {
  const reach = Math.sqrt(Math.log10(1 / Math.min(Math.max(share, 1e-12), 1)));

  return [
    Math.min((lamp.spreadDeg[0] * Math.PI * reach) / 360, 1.5),
    Math.min((lamp.spreadDeg[1] * Math.PI * reach) / 360, 1.5),
  ];
};

/**
 * Rayleigh's phase function.
 * @param cos_theta The scattering angle's cosine
 * @returns Per steradian
 */
export const rayleigh_phase = (cos_theta: number): number =>
  (3 / (16 * Math.PI)) * (1 + cos_theta * cos_theta);

/**
 * Henyey and Greenstein's phase function.
 * @param cos_theta The scattering angle's cosine
 * @param g The asymmetry, -1 to 1
 * @returns Per steradian
 */
export const henyey_greenstein = (cos_theta: number, g: number): number =>
  (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * cos_theta) ** 1.5);

/**
 * How far along a beam its light in the air is worth drawing. Looking back
 * along it, the light scattered from beyond a range r is at most
 * ∫ I β p(0) / s² ds = I β p(0) / r: past where that falls below the
 * faintest luminance worth drawing, nothing shows.
 * @param lamp The lamp
 * @param air The air's extinction
 * @param floor_cd_m2 The faintest luminance worth drawing, cd/m²
 * @returns Metres
 */
export const beam_range = (
  lamp: Lamp,
  air: Extinction,
  floor_cd_m2: number,
): number => {
  let most = 0;

  for (let channel = 0; channel < 3; channel++) {
    most = Math.max(
      most,
      air.rayleigh[channel] * rayleigh_phase(1) +
        air.aerosol[channel] *
          AEROSOL_ALBEDO *
          henyey_greenstein(1, AEROSOL_ASYMMETRY),
    );
  }

  return (lamp.peakCd * most) / Math.max(floor_cd_m2, 1e-12);
};
