import { AIR_GAMMA, type MoistAir } from "./atmosphere";
import type { VaporAirframe, VaporFlight } from "./types";

// What the wing does to the air, in the handful of numbers the vapour needs
//
// The lift, from the planform: DATCOM's lift slope for the attached flow and
// Polhamus's suction analogy for what a swept leading edge's vortices add.
// Then the lift's circulation, which is what a vortex is, and where on the
// wing the leading-edge vortices burst. All of it textbook, none of it CFD:
// good to ten or twenty per cent, which is far better than the eye can tell
// in a cloud that appears or not on a degree of dew point

const G0 = 9.80665;

// Two-dimensional lift slope over 2π: a real section makes about 95 % of
// thin-airfoil theory's
const SECTION_EFFICIENCY = 0.95;

// DATCOM's lift slope is for subsonic flow; past here it is held, the
// compressible correction diverging at one
const LIFT_SLOPE_MAX_MACH = 0.9;

// How far apart the trailing vortices sit, as a share of the span, once the
// sheet has rolled up behind an elliptically loaded wing: π/4
export const VORTEX_SPACING = Math.PI / 4;

// Where along the semispan a leading-edge vortex lies, as a share of the
// local semispan, and so where its lift acts. About 0.6 to 0.7 on a delta
export const LEADING_EDGE_VORTEX_SPAN = 0.7;

/**
 * The derived shape of a trapezoidal wing.
 */
export type Planform = {
  // Including the part through the body, as lift is conventionally referred
  area_m2: number;
  aspect_ratio: number;
  taper: number;
  mean_chord_m: number;
};

/**
 * The derived shape of a wing.
 * @param airframe The airframe
 * @returns Its area, aspect ratio, taper and mean chord
 */
export const planform = (airframe: VaporAirframe): Planform => {
  const area_m2 =
    (airframe.span_m * (airframe.root_chord_m + airframe.tip_chord_m)) / 2;

  return {
    area_m2,
    aspect_ratio: (airframe.span_m * airframe.span_m) / Math.max(area_m2, 1e-6),
    taper: airframe.tip_chord_m / Math.max(airframe.root_chord_m, 1e-6),
    mean_chord_m: area_m2 / Math.max(airframe.span_m, 1e-6),
  };
};

/**
 * How far the line through one fraction of every chord is swept.
 * @param airframe The airframe
 * @param fraction 0 the leading edge, 1 the trailing edge
 * @returns The sweep, in radians
 */
export const sweep_at = (airframe: VaporAirframe, fraction: number): number => {
  const { aspect_ratio, taper } = planform(airframe);

  return Math.atan(
    Math.tan(airframe.leading_edge_sweep_rad) -
      (4 * fraction * (1 - taper)) / (aspect_ratio * (1 + taper)),
  );
};

/**
 * The attached flow's lift slope, per radian: DATCOM's (Helmbold's, swept).
 * @param airframe The airframe
 * @param mach The flight Mach number
 * @returns dC_L/dα
 */
export const lift_slope = (airframe: VaporAirframe, mach: number): number => {
  const { aspect_ratio: a } = planform(airframe);

  const m = Math.min(Math.max(mach, 0), LIFT_SLOPE_MAX_MACH);
  const beta = Math.sqrt(1 - m * m);
  const half_chord = Math.tan(sweep_at(airframe, 0.5));

  return (
    (2 * Math.PI * a) /
    (2 +
      Math.sqrt(
        ((a * a * beta * beta) / (SECTION_EFFICIENCY * SECTION_EFFICIENCY)) *
          (1 + (half_chord * half_chord) / (beta * beta)) +
          4,
      ))
  );
};

/**
 * Polhamus's two constants: the potential flow's lift and the vortices'.
 *
 * The suction a sharp leading edge would carry in attached flow is not lost
 * when the flow separates off it. It turns through ninety degrees and reappears
 * as the lift of the vortex lying over the wing.
 * @param airframe The airframe
 * @param mach The flight Mach number
 * @returns K_p and K_v
 */
export const polhamus = (
  airframe: VaporAirframe,
  mach: number,
): { potential: number; vortex: number } => {
  const { aspect_ratio } = planform(airframe);

  const potential = lift_slope(airframe, mach);

  const vortex =
    (Math.max(
      potential - (potential * potential) / (Math.PI * aspect_ratio),
      0,
    ) /
      Math.max(Math.cos(airframe.leading_edge_sweep_rad), 0.05)) *
    Math.min(Math.max(airframe.leading_edge_sharpness, 0), 1);

  return { potential, vortex };
};

/**
 * The angles of attack at which the leading-edge vortex bursts at the trailing
 * edge, and at the apex.
 *
 * A vortex with too little axial flow for its swirl stagnates and bursts into
 * a fat, turbulent wake: vortex breakdown. It reaches the trailing edge first,
 * then marches up the wing as the angle grows, and a more swept edge holds it
 * off longer. A fit to the classic delta-wing data, Wentz and Kohlman's among
 * them: about 30 degrees at the trailing edge for a 70 degree delta, 10 for a
 * 55, and fifteen more to reach the apex.
 * @param sweep_rad The leading edge's sweep
 * @returns The two angles, in radians
 */
export const breakdown_angles = (
  sweep_rad: number,
): { trailing_edge: number; apex: number } => {
  const sweep_deg = (sweep_rad * 180) / Math.PI;
  const trailing_edge = Math.max(1.3 * (sweep_deg - 47), 3);

  return {
    trailing_edge: (trailing_edge * Math.PI) / 180,
    apex: ((trailing_edge + 15) * Math.PI) / 180,
  };
};

/**
 * How much of a leading-edge vortex is still whole, from its apex.
 * @param airframe The airframe
 * @param angle_of_attack_rad The angle of attack
 * @returns 1 whole over the wing, 0 burst at the apex
 */
export const breakdown_fraction = (
  airframe: VaporAirframe,
  angle_of_attack_rad: number,
): number => {
  const { trailing_edge, apex } = breakdown_angles(
    airframe.leading_edge_sweep_rad,
  );

  return Math.min(
    Math.max((apex - angle_of_attack_rad) / (apex - trailing_edge), 0),
    1,
  );
};

/**
 * The lift coefficient, attached and vortex parts.
 *
 * Once the vortices burst over the wing they stop lifting, so the vortex part
 * goes with how much of them is whole: the delta's stall.
 * @param airframe The airframe
 * @param angle_of_attack_rad The angle of attack
 * @param mach The flight Mach number
 * @returns The two parts and their sum
 */
export const lift_coefficient = (
  airframe: VaporAirframe,
  angle_of_attack_rad: number,
  mach: number,
): { potential: number; vortex: number; total: number } => {
  const { potential: k_p, vortex: k_v } = polhamus(airframe, mach);

  const alpha = angle_of_attack_rad;
  const sin = Math.sin(alpha);
  const cos = Math.cos(alpha);

  const potential = k_p * sin * cos * cos;

  // Signed, so a negative pull sheds its vortices under the wing, which this
  // draws no vapour for, but lifts the right way
  const whole = 0.4 + 0.6 * breakdown_fraction(airframe, Math.abs(alpha));
  const vortex = k_v * sin * Math.abs(sin) * cos * whole;

  return { potential, vortex, total: potential + vortex };
};

/**
 * Everything about one moment of flight the vapour is drawn from.
 */
export type FlightState = {
  mach: number;
  dynamic_pressure_pa: number;

  lift_coefficient: number;
  potential_lift_coefficient: number;
  vortex_lift_coefficient: number;

  lift_n: number;

  // Lift over weight, for the mass the airframe gives
  load_factor: number;

  // The bound circulation, the strength of the pair of trailing vortices
  // once the sheet behind the wing has rolled up, square metres per second
  tip_circulation: number;

  // What each leading-edge vortex has gathered by the end of the edge
  leading_edge_circulation: number;

  // How much of the leading-edge vortex is whole, 1 to 0
  breakdown: number;
};

/**
 * The lift, its circulation and its vortices, at one moment of flight.
 * @param airframe The airframe
 * @param flight Its speed and angle of attack
 * @param air The air it flies through
 * @returns The state
 */
export const flight_state = (
  airframe: VaporAirframe,
  flight: VaporFlight,
  air: MoistAir,
): FlightState => {
  const speed = Math.max(flight.airspeed_m_s, 0);
  const mach = speed / air.sound_m_s;
  const q = 0.5 * air.density_kg_m3 * speed * speed;

  const { area_m2 } = planform(airframe);

  const lift = lift_coefficient(airframe, flight.angle_of_attack_rad, mach);
  const lift_n = q * area_m2 * lift.total;

  const span = Math.max(airframe.span_m, 1e-3);

  // Kutta–Joukowski over the rolled-up pair: L = ρ V Γ b'
  const tip_circulation =
    speed > 0
      ? Math.abs(lift_n) / (air.density_kg_m3 * speed * VORTEX_SPACING * span)
      : 0;

  // In slender-wing theory the lift is the rate the crossflow's impulse grows
  // at, ρ V Γ times the pair's spacing: so the vortex lift fixes how strong
  // the leading-edge vortices are by the time they leave the edge
  const leading_edge_circulation =
    (speed * area_m2 * Math.max(lift.vortex, 0)) /
    (2 * LEADING_EDGE_VORTEX_SPAN * span);

  return {
    mach,
    dynamic_pressure_pa: q,
    lift_coefficient: lift.total,
    potential_lift_coefficient: lift.potential,
    vortex_lift_coefficient: lift.vortex,
    lift_n,
    load_factor: lift_n / (Math.max(airframe.mass_kg, 1) * G0),
    tip_circulation,
    leading_edge_circulation,
    breakdown: breakdown_fraction(
      airframe,
      Math.abs(flight.angle_of_attack_rad),
    ),
  };
};

/**
 * The angle of attack that pulls a given load factor.
 *
 * What a flight model usually knows is the g, not the angle; this inverts the
 * lift curve for it. Past the most the wing can lift it returns the angle of
 * that maximum: the wing is stalled, and pulls no harder.
 * @param airframe The airframe, its mass included
 * @param load_factor Lift over weight
 * @param airspeed_m_s True airspeed
 * @param air The air
 * @returns The angle of attack, in radians
 */
export const angle_of_attack_for_load = (
  airframe: VaporAirframe,
  load_factor: number,
  airspeed_m_s: number,
  air: MoistAir,
): number => {
  const lift_of = (alpha: number) =>
    flight_state(airframe, { airspeed_m_s, angle_of_attack_rad: alpha }, air)
      .load_factor;

  const sign = Math.sign(load_factor) || 1;
  const wanted = Math.abs(load_factor);

  // Find the stall first: the lift curve rises to it and no further
  let top = 0;
  let best = 0;

  for (let degrees = 1; degrees <= 50; degrees++) {
    const alpha = (degrees * Math.PI) / 180;
    const load = lift_of(alpha);

    if (load > best) {
      best = load;
      top = alpha;
    }
  }

  if (wanted >= best) {
    return sign * top;
  }

  let low = 0;
  let high = top;

  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) / 2;

    if (lift_of(middle) < wanted) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (sign * (low + high)) / 2;
};

/**
 * The Kármán–Tsien compressibility correction.
 *
 * Better than Prandtl–Glauert's where it matters here, at strong suction
 * near the speed of sound. Its β is held off zero, where any linear theory
 * diverges and the real flow does not.
 * @param incompressible The pressure coefficient at low speed
 * @param mach The Mach number the flow meets it at
 * @returns The pressure coefficient at that Mach number
 */
export const karman_tsien = (incompressible: number, mach: number): number => {
  const beta = compressibility_beta(mach);

  const denominator =
    beta + ((mach * mach) / (1 + beta)) * (incompressible / 2);

  return incompressible / Math.max(denominator, beta * 0.5);
};

// The least β any compressible correction is allowed, transonic flow being
// nonlinear and finite where linear theory has a pole
export const MIN_BETA = 0.15;

/**
 * √|1 - M²|, held off zero.
 * @param mach The Mach number
 * @returns β
 */
export const compressibility_beta = (mach: number): number =>
  Math.max(Math.sqrt(Math.abs(1 - mach * mach)), MIN_BETA);

/**
 * The pressure coefficient at which the flow is locally sonic.
 * @param mach The free stream's Mach number
 * @returns C_p*
 */
export const critical_pressure = (mach: number): number => {
  const m2 = Math.max(mach * mach, 1e-6);
  const g = AIR_GAMMA;

  return (
    (2 / (g * m2)) * (Math.pow((2 + (g - 1) * m2) / (g + 1), g / (g - 1)) - 1)
  );
};

/**
 * A pressure coefficient as a pressure ratio.
 * @param coefficient C_p
 * @param mach The free stream's Mach number
 * @returns p over the free stream's
 */
export const pressure_ratio = (coefficient: number, mach: number): number =>
  1 + (AIR_GAMMA / 2) * mach * mach * coefficient;
