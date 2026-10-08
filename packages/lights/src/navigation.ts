// The position lights, as CS 25 and FAR Part 25 specify them
//
// Three lights say which way an aircraft is going: red on the left, green on
// the right, white astern. Each covers its own dihedral angle (25.1387) at no
// less than the minimum intensities of 25.1391 and 25.1393, and spills into
// its neighbours' by no more than the maxima of 25.1395. What a real light
// gives is the least the rule allows, so that is what is drawn: the minima,
// joined linearly from each band's edge to the next, never below any of them,
// and the spill the rule allows past each edge, falling geometrically between
// the overlap areas' limits
//
// Angles here are in the aircraft's own axes, in degrees: the azimuth from
// dead ahead, positive to the left, and the elevation above the horizontal
// plane through the longitudinal axis

/** Which of the three: the left (red), the right (green) or the aft (white) */
export type NavigationSide = "left" | "right" | "aft";

/**
 * The left and right lights' minimum horizontal intensity, in candela, from
 * dead ahead (25.1391): 40 to 10°, 30 to 20°, 5 to 110°. Joined at each
 * band's far edge at its own minimum, so the curve never dips below one.
 */
export const NAV_FORWARD_CD: readonly (readonly [number, number])[] = [
  [0, 40],
  [10, 40],
  [20, 30],
  [110, 5],
];

/** The aft light's minimum, 110° to 180° from dead ahead (25.1391) */
export const NAV_AFT_CD = 20;

/**
 * The share of the horizontal minimum a light must give above and below the
 * horizontal plane (25.1393): 1 in it, 0.9 to 5°, 0.8 to 10°, 0.7 to 15°, 0.5
 * to 20°, 0.3 to 30°, 0.1 to 40° and 0.05 to 90°. Joined as the horizontal.
 */
export const NAV_VERTICAL: readonly (readonly [number, number])[] = [
  [0, 1],
  [5, 0.9],
  [10, 0.8],
  [15, 0.7],
  [20, 0.5],
  [30, 0.3],
  [40, 0.1],
  [90, 0.05],
];

/** Each light's dihedral angle, as azimuths from dead ahead (25.1387) */
export const NAV_ARC_DEG: Readonly<
  Record<NavigationSide, readonly [number, number]>
> = {
  left: [0, 110],
  right: [-110, 0],
  aft: [110, 250],
};

/**
 * The most a light may give in its neighbours' dihedral angles, in candela
 * (25.1395): in area A, 10° to 20° past its own edge, and in area B, beyond.
 * Within 10° of the edge the rule leaves it free.
 */
export const NAV_OVERLAP_CD: Readonly<
  Record<
    NavigationSide,
    Partial<Record<NavigationSide, readonly [number, number]>>
  >
> = {
  left: { right: [10, 1], aft: [5, 1] },
  right: { left: [10, 1], aft: [5, 1] },
  aft: { left: [5, 1], right: [5, 1] },
};

/** Past this many degrees beyond its edge, area A starts; past twice, B */
export const NAV_AREA_A_DEG = 10;

/**
 * A curve through points, linearly between them, held flat past its ends.
 * @param points [x, y] pairs, x ascending
 * @param x Where to read it
 * @returns y
 */
export const piecewise = (
  points: readonly (readonly [number, number])[],
  x: number,
): number => {
  if (x <= points[0][0]) return points[0][1];

  for (let index = 1; index < points.length; index++) {
    const [x1, y1] = points[index];

    if (x <= x1) {
      const [x0, y0] = points[index - 1];

      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }

  return points[points.length - 1][1];
};

/**
 * An angle wrapped into (-180, 180].
 * @param degrees Any angle
 * @returns The same direction
 */
export const wrap_deg = (degrees: number): number => {
  const wrapped = degrees - 360 * Math.floor((degrees + 180) / 360);

  return wrapped === -180 ? 180 : wrapped;
};

/**
 * Which light's dihedral angle an azimuth is in.
 * @param azimuth_deg From dead ahead, positive to the left
 * @returns The side
 */
export const navigation_area = (azimuth_deg: number): NavigationSide => {
  const azimuth = wrap_deg(azimuth_deg);

  if (Math.abs(azimuth) > 110) return "aft";

  return azimuth >= 0 ? "left" : "right";
};

/**
 * How far an azimuth is outside a light's dihedral angle.
 * @param side The light
 * @param azimuth_deg From dead ahead, positive to the left
 * @returns Degrees past the nearest edge, zero inside, and that edge's azimuth
 */
const beyond = (
  side: NavigationSide,
  azimuth_deg: number,
): { degrees: number; edge: number } => {
  const [from, to] = NAV_ARC_DEG[side];
  const centre = (from + to) / 2;
  const half = (to - from) / 2;
  const off = wrap_deg(azimuth_deg - centre);

  return {
    degrees: Math.max(Math.abs(off) - half, 0),
    edge: wrap_deg(off >= 0 ? to : from),
  };
};

/**
 * A light's least horizontal intensity at an azimuth inside its own angle.
 * @param side The light
 * @param azimuth_deg From dead ahead, positive to the left
 * @returns Candela
 */
const horizontal_minimum = (side: NavigationSide, azimuth_deg: number) =>
  side === "aft"
    ? NAV_AFT_CD
    : piecewise(NAV_FORWARD_CD, Math.abs(wrap_deg(azimuth_deg)));

/**
 * The share of the horizontal intensity a light gives at an elevation.
 * @param elevation_deg Above or below the horizontal plane
 * @returns 0.05 to 1
 */
export const navigation_vertical = (elevation_deg: number): number =>
  piecewise(NAV_VERTICAL, Math.min(Math.abs(elevation_deg), 90));

/**
 * Between two values geometrically, or linearly if either is zero.
 * @param from At t = 0
 * @param to At t = 1
 * @param t 0 to 1
 * @returns The value
 */
const geometric = (from: number, to: number, t: number) =>
  from > 0 && to > 0 ? from * (to / from) ** t : from + (to - from) * t;

/**
 * A position light's intensity towards a direction: the rule's minimum
 * inside its dihedral angle, and past its edges the spill it allows.
 * @param side The light
 * @param azimuth_deg From dead ahead, positive to the left
 * @param elevation_deg Above the horizontal plane, negative below
 * @param scale How many times the minimum the light gives inside its angle
 * @param spill How much of the allowed spill it gives outside, 0 to 1
 * @returns Candela
 */
export const navigation_intensity = (
  side: NavigationSide,
  azimuth_deg: number,
  elevation_deg: number,
  scale = 1,
  spill = 1,
): number => {
  const vertical = navigation_vertical(elevation_deg);
  const { degrees, edge } = beyond(side, azimuth_deg);

  if (degrees <= 0) {
    return scale * horizontal_minimum(side, azimuth_deg) * vertical;
  }

  // Past an edge: from what the light gives there, down to area A's limit
  // 10° on and area B's at 20°, and held at B's beyond
  const area = navigation_area(azimuth_deg);
  const [limit_a, limit_b] = NAV_OVERLAP_CD[side][area] ?? [0, 0];
  const at_edge = scale * horizontal_minimum(side, edge);
  const a = Math.min(at_edge, Math.max(spill, 0) * limit_a);
  const b = Math.min(a, Math.max(spill, 0) * limit_b);

  const horizontal =
    degrees <= NAV_AREA_A_DEG
      ? geometric(at_edge, a, degrees / NAV_AREA_A_DEG)
      : degrees <= 2 * NAV_AREA_A_DEG
        ? geometric(a, b, degrees / NAV_AREA_A_DEG - 1)
        : b;

  return horizontal * vertical;
};
