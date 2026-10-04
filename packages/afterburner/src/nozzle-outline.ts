// The shape of a nozzle's exit, for nozzles that aren't round
//
// The outline is a superellipse, |u / a|^n + |v / b|^n = 1: an ellipse at
// n = 2, a rounded rectangle as n climbs, a diamond at n = 1. Its width a runs
// along the nozzle frame's z and its height b along its y, before the roll
//
// `nozzleRadiusM` stays the nozzle's size, as the radius of the round exit of
// the same area: the same mass flow, so every length the jet works out from it
// holds, and a preset's radius fits any outline

/**
 * What the shader needs to draw one outline, worked out once per nozzle.
 */
export type NozzleOutlineFit = {
  /** The outline's mean semi-axis, √(ab), over the round radius of its area */
  areaScale: number;

  /**
   * Its furthest point from the axis, over that same radius: what the bounds
   * around the plume are widened by
   */
  reach: number;
};

// The least squareness drawn: a little under one is a four-pointed star, and
// under this the points are too thin to march
export const NOZZLE_SQUARENESS_MIN = 0.5;

// And the most: past this a superellipse is a rectangle to the pixel
export const NOZZLE_SQUARENESS_MAX = 24;

// Lanczos' coefficients, g = 7, good to fifteen digits
const LANCZOS = [
  0.999_999_999_999_809_9, 676.520_368_121_885_1, -1_259.139_216_722_402_8,
  771.323_428_777_653_1, -176.615_029_162_140_6, 12.507_343_278_686_905,
  -0.138_571_095_265_720_12, 9.984_369_578_019_572e-6,
  1.505_632_735_149_311_6e-7,
];

/**
 * The gamma function, for arguments at or above one.
 * @param z Where to take it
 * @returns Γ(z)
 */
const gamma = (z: number): number => {
  const x = z - 1;
  let sum = LANCZOS[0]!;

  for (let index = 1; index < LANCZOS.length; index += 1) {
    sum += LANCZOS[index]! / (x + index);
  }

  const t = x + LANCZOS.length - 1.5;

  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * sum;
};

/**
 * Clamp a squareness to what can be drawn.
 * @param squareness The superellipse's exponent
 * @returns It, held inside the drawable range
 */
export const clamp_nozzle_squareness = (squareness: number): number =>
  Math.min(Math.max(squareness, NOZZLE_SQUARENESS_MIN), NOZZLE_SQUARENESS_MAX);

/**
 * How big an outline is next to the round exit of the same area, and how far
 * it reaches from the axis.
 * @param aspect Its width over its height
 * @param squareness The superellipse's exponent: 2 an ellipse, more squarer
 * @returns The fit, in round radii
 */
export const nozzle_outline_fit = (
  aspect: number,
  squareness: number,
): NozzleOutlineFit => {
  const n = clamp_nozzle_squareness(squareness);
  const stretch = Math.sqrt(Math.max(aspect, 1e-3));

  // A superellipse's area is 4ab Γ(1 + 1/n)² / Γ(1 + 2/n), and it's to be πr²
  const area_scale = Math.sqrt(
    (Math.PI * gamma(1 + 2 / n)) / (4 * gamma(1 + 1 / n) ** 2),
  );

  // Inside the square superellipse on its longer axis, whose furthest point is
  // its tip below n = 2 and its corner, 2^(1/2 - 1/n) out, above
  const longer = area_scale * Math.max(stretch, 1 / stretch);
  const reach = longer * 2 ** Math.max(0, 0.5 - 1 / n);

  return { areaScale: area_scale, reach };
};
