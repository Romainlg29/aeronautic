// Angles. Every angle the libraries take is in radians; these are for
// writing them in degrees

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * Degrees, in radians: `rotation={[0, deg(90), 0]}`.
 * @param degrees The angle in degrees
 * @returns It in radians
 */
export const deg = (degrees: number): number => degrees * RADIANS_PER_DEGREE;

/**
 * Radians, in degrees, for a readout: `to_deg(flight.values.angleOfAttackRad)`.
 * @param radians The angle in radians
 * @returns It in degrees
 */
export const to_deg = (radians: number): number => radians / RADIANS_PER_DEGREE;
