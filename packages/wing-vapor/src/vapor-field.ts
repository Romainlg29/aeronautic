import {
  compressibility_beta,
  critical_pressure,
  flight_state,
  karman_tsien,
  LEADING_EDGE_VORTEX_SPAN,
  planform,
  sweep_at,
  VORTEX_SPACING,
  type FlightState,
} from "./aerodynamics";
import { AIR_GAMMA, moist_air, type MoistAir } from "./atmosphere";
import { CONDENSATION_MIN_RATIO, condensate } from "./condensation";
import type { VaporAir, VaporAirframe, VaporFlight, VaporLook } from "./types";

// The pressure field round the aircraft, as four things the eye can tell apart
//
// Each is a pressure deficit: how far below the free stream's the pressure is,
// as a share of it. They are small perturbations of one flow and add. Where
// their sum expands the air past its dew point there is cloud, and nowhere
// else, so none of them is drawn to a shape: the shape is the isobar
//
// - The tip vortices. A Scully vortex trailing each tip along the free stream,
//   rolling inboard to π/4 of the span and sinking under its own downwash, its
//   core spreading by turbulent diffusion until the well is too shallow
// - The leading-edge vortices. Conical, from where the edge leaves the body,
//   lifting off the wing with the angle of attack, and bursting where the
//   breakdown has reached
// - The wing's upper surface. The suction of the attached flow, compressible,
//   and once it goes supersonic a rooftop ending in a shock, which ends the
//   cloud in a hard edge. It reaches higher as the flow nears the speed of
//   sound, as a transonic pocket does
// - The cone. The fuselage as a slender body of revolution: its expansion over
//   the shoulder, felt far out near Mach one, cut off by the shock behind it
//
// Everything is in the airframe's canonical frame: x aft, y up, z out along
// the right wing, metres from the component's origin. The field is symmetric
// left to right, so z is folded and one evaluation draws both wings

// The tip vortex's eddy viscosity over its circulation (Squire, Owen). What
// spreads its core, and so what ends the trail
export const VORTEX_EDDY_VISCOSITY = 2e-4;

// How many spans behind the wing the sheet takes to roll up
export const ROLLUP_SPANS = 1;

// The longest a trail is drawn, in metres
export const MAX_TRAIL_M = 400;

// How high the leading-edge vortex rides over the wing, as a share of the
// local semispan, per unit sine of the angle of attack
export const LEADING_EDGE_VORTEX_HEIGHT = 0.6;

// How quickly a burst core swells, as a share of the edge's length, and by
// how much: a burst vortex is several times fatter and far weaker
export const BURST_LENGTH = 0.08;
export const BURST_SWELL = 3;

const DEGREE = Math.PI / 180;

// The fastest a transonic pocket runs locally, its shock separating the flow
// past it
export const MAX_LOCAL_MACH = 1.4;

// The leading edge's radius, as a share of the chord: what keeps thin-airfoil
// theory's suction peak finite
export const NOSE_RADIUS = 0.03;

// How high a wing's pressure field reaches, in chords, at low speed. The
// Prandtl–Glauert stretch carries it higher, 1/β, as Mach one nears
export const WING_FIELD_HEIGHT = 0.15;

// The least β the wing's height stretch uses: a pocket stays a pocket
const WING_HEIGHT_MIN_BETA = 0.4;

// How far past the subsonic sonic point a shock is pushed back, at the
// most, as Mach one nears: transonic shocks march aft with speed
export const SHOCK_TRAVEL = 0.85;

// The shock's thickness, in chords, for the edge to be hard but not aliased
export const SHOCK_WIDTH = 0.015;

// How strong a slender body's suction is, against (R/L)² ln(L/R)
export const CONE_STRENGTH = 4;

// How far out a body's field reaches, in body lengths over β
export const CONE_REACH = 0.25;

// Where the cone's shock stands, as a share of the body's length, at the
// bottom and top of the transonic range; and how far back it leans per body
// length out
export const CONE_SHOCK_SUBSONIC = 0.55;
export const CONE_SHOCK_SONIC = 0.92;
export const CONE_SHOCK_LEAN = 0.08;

/**
 * Every number the shader needs to rebuild the field, worked out on the CPU.
 */
export type VaporField = {
  // The flight
  mach: number;
  speed_m_s: number;
  cos_alpha: number;
  sin_alpha: number;

  // ρ / (8π² p): a vortex's pressure deficit per Γ² over (r² + r_c²)
  vortex_k: number;

  // The least deficit that condenses anything, in the moistest air the
  // humidity spread allows. One means nothing will
  saturation_deficit: number;

  // The wing's planform
  apex_m: number;
  wing_height_m: number;
  tan_dihedral: number;
  tan_sweep: number;
  root_chord_m: number;
  tip_chord_m: number;
  semispan_m: number;
  root_span_m: number;
  thickness: number;

  // The attached flow's lift, as a section lift times a chord: c_l c at the
  // centreline of an elliptic loading
  section_lift_m: number;

  // How much of the leading edge's suction peak has separated into the
  // leading-edge vortex, 0 to 1: a sharp edge past a few degrees sheds it all
  separation: number;

  // cos² of the mid-chord sweep, and the Mach number normal to it
  cos2_sweep: number;
  normal_mach: number;

  // The tip vortex: its core's circulation, its core radius squared just
  // behind the wing and how fast that grows per metre, how fast it sinks per
  // metre, and how far and how wide it can fog
  tip_circulation: number;
  tip_core2_m2: number;
  tip_growth_m: number;
  tip_descent: number;
  tip_reach_m: number;
  tip_bound_m: number;

  // The leading-edge vortex: its circulation per metre aft of its apex, the
  // edge's length, its core and height per metre of local semispan, where it
  // bursts, and how wide it can fog
  edge_gradient: number;
  edge_length_m: number;
  edge_core: number;
  edge_height: number;
  edge_burst_m: number;
  edge_bound_m: number;

  // How high above the wing its field can fog
  wing_bound_m: number;

  // The body: its nose, length, radius, axis height; the strength of its
  // suction, where the shock stands, how much of it supersonic flight leaves,
  // and how far out it can fog
  nose_m: number;
  body_length_m: number;
  body_radius_m: number;
  body_height_m: number;
  cone_strength: number;
  cone_shock: number;
  cone_fade: number;
  cone_bound_m: number;
};

/**
 * Everything the vapour is drawn from, at one moment.
 */
export type VaporState = {
  air: MoistAir;
  flight: FlightState;
  field: VaporField;

  // The box the field fits in, in the canonical frame
  bounds: { min: [number, number, number]; max: [number, number, number] };

  // Whether any of it can show at all
  visible: boolean;
};

const smoothstep = (low: number, high: number, value: number): number => {
  const t = Math.min(Math.max((value - low) / (high - low), 0), 1);

  return t * t * (3 - 2 * t);
};

/**
 * The deficit at which the free air, made a little moister, just condenses.
 * @param air The free stream
 * @param humidity_scale How much moister
 * @returns 1 - the pressure ratio, or 1 if nothing in reach condenses
 */
const condensing_deficit = (air: MoistAir, humidity_scale: number): number => {
  let low = CONDENSATION_MIN_RATIO;
  let high = 1;

  if (condensate(low, air, humidity_scale).liquid <= 0) {
    return 1;
  }

  for (let iteration = 0; iteration < 32; iteration++) {
    const middle = (low + high) / 2;

    if (condensate(middle, air, humidity_scale).liquid > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return 1 - low;
};

/**
 * The pressure deficit of a Scully vortex.
 * @param field The field
 * @param circulation Its circulation
 * @param radius2 How far from its axis, squared
 * @param core2 Its core radius, squared
 * @returns The deficit, as a share of the free stream's pressure
 */
const vortex_deficit = (
  field: VaporField,
  circulation: number,
  radius2: number,
  core2: number,
): number =>
  (field.vortex_k * circulation * circulation) /
  Math.max(radius2 + core2, 1e-6);

/**
 * The tip vortex's deficit at one point.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span; folded
 * @returns The deficit
 */
export const tip_deficit = (
  field: VaporField,
  x: number,
  y: number,
  z: number,
): number => {
  const span = Math.abs(z);
  const tip_le = field.apex_m + field.semispan_m * field.tan_sweep;
  const tip_te = tip_le + field.tip_chord_m;
  const tip_y = field.wing_height_m + field.semispan_m * field.tan_dihedral;

  const along = (x - tip_te) * field.cos_alpha + (y - tip_y) * field.sin_alpha;

  if (along < 0) {
    // Forming along the tip chord, from nothing at the leading edge
    const formed = Math.min(
      Math.max((x - tip_le) / field.tip_chord_m, 0),
      1,
    );
    const ax = Math.min(Math.max(x, tip_le), tip_te);
    const r2 = (x - ax) ** 2 + (y - tip_y) ** 2 + (span - field.semispan_m) ** 2;

    return vortex_deficit(
      field,
      field.tip_circulation * formed,
      r2,
      field.tip_core2_m2,
    );
  }

  const rolled = 1 - Math.exp(-along / (ROLLUP_SPANS * 2 * field.semispan_m));

  const ax = tip_te + along * field.cos_alpha;
  const ay = tip_y + along * (field.sin_alpha - field.tip_descent);
  const az = field.semispan_m * (1 - (1 - VORTEX_SPACING) * rolled);

  const r2 = (x - ax) ** 2 + (y - ay) ** 2 + (span - az) ** 2;

  return vortex_deficit(
    field,
    field.tip_circulation,
    r2,
    field.tip_core2_m2 + field.tip_growth_m * along,
  );
};

/**
 * The leading-edge vortex's deficit at one point.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span; folded
 * @returns The deficit
 */
export const edge_deficit = (
  field: VaporField,
  x: number,
  y: number,
  z: number,
): number => {
  const apex_x = field.apex_m + field.root_span_m * field.tan_sweep;
  const along = x - apex_x;

  if (along <= 0 || field.edge_gradient <= 0) {
    return 0;
  }

  const on_wing = Math.min(along, field.edge_length_m);
  const past = along - on_wing;

  // How far out the edge is here, from the root
  const reach = on_wing / field.tan_sweep;

  const vz = field.root_span_m + LEADING_EDGE_VORTEX_SPAN * reach;
  const chord =
    field.root_chord_m +
    ((field.tip_chord_m - field.root_chord_m) * vz) / field.semispan_m;

  const vy =
    field.wing_height_m +
    vz * field.tan_dihedral +
    0.3 * field.thickness * chord +
    field.edge_height * reach +
    past * (field.sin_alpha / Math.max(field.cos_alpha, 0.1));

  const r2 = (y - vy) ** 2 + (Math.abs(z) - vz) ** 2;

  const burst = smoothstep(
    field.edge_burst_m,
    field.edge_burst_m + BURST_LENGTH * field.edge_length_m,
    along,
  );

  const core = Math.max(field.edge_core * reach, 0.02) * (1 + BURST_SWELL * burst);

  // Off the edge it trails away into the tip vortex's sheet
  const leaving = Math.exp(-past / (0.3 * field.edge_length_m));

  return (
    vortex_deficit(
      field,
      field.edge_gradient * on_wing * (1 - 0.3 * burst) * leaving,
      r2,
      core * core,
    )
  );
};

/**
 * The wing's upper-surface deficit at one point.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span; folded
 * @returns The deficit
 */
export const wing_deficit = (
  field: VaporField,
  x: number,
  y: number,
  z: number,
): number => {
  const span = Math.abs(z);
  const eta = span / field.semispan_m;

  const leading = field.apex_m + span * field.tan_sweep;
  const chord =
    field.root_chord_m + (field.tip_chord_m - field.root_chord_m) * eta;

  const xi = (x - leading) / chord;
  const along = Math.min(Math.max(xi, 0), 1);

  const surface =
    field.wing_height_m +
    span * field.tan_dihedral +
    2 * field.thickness * chord * along * (1 - along);

  const height = y - surface;

  if (height < 0 || eta >= 1) {
    return 0;
  }

  // An elliptic loading's section lift, attached flow only: the vortex lift
  // is the leading-edge vortex's
  const section = (field.section_lift_m * Math.sqrt(1 - eta * eta)) / chord;

  const incompressible = (at: number) =>
    -(section / Math.PI) * lift_shape(at, field.separation) -
    1.3 * field.thickness * Math.sin(Math.PI * at);

  // Simple sweep theory: what the flow normal to the sweep makes of it
  const mach = field.normal_mach;
  const normal = (at: number) =>
    karman_tsien(incompressible(at) / field.cos2_sweep, mach);

  let coefficient = normal(along);

  // The supersonic pocket, if there is one: a rooftop at about the suction
  // the peak reaches, ended by a shock that stands further aft the faster
  // the flight
  const sonic = critical_pressure(mach);
  const peak = normal(0.1);

  if (peak < sonic) {
    const shock = shock_station(field, section, sonic, mach);
    const ahead = 1 - smoothstep(shock - SHOCK_WIDTH, shock + SHOCK_WIDTH, along);

    // Ahead of it the supersonic plateau holds the peak's suction; behind
    // it the flow is subsonic again, at no less than sonic pressure
    coefficient =
      Math.min(coefficient, peak) * ahead +
      Math.max(coefficient, sonic) * (1 - ahead);
  }

  // Up from the surface it decays, reaching further as Mach one nears
  const reach =
    (WING_FIELD_HEIGHT * chord) /
    Math.max(compressibility_beta(mach), WING_HEIGHT_MIN_BETA);

  const fade =
    smoothstep(field.root_span_m / field.semispan_m, field.root_span_m / field.semispan_m + 0.04, eta) *
    (1 - smoothstep(0.9, 1, eta)) *
    smoothstep(-0.04, 0, xi) *
    (1 - smoothstep(1, 1.06, xi));

  return (
    capped_deficit(-(AIR_GAMMA / 2) * mach * mach * coefficient, mach) *
    Math.exp(-height / reach) *
    fade
  );
};

/**
 * Hold a linear theory's deficit to what the flow can reach.
 *
 * Linear theory's suction diverges as Mach one nears; a real pocket's local
 * Mach number rarely passes about 1.4 before the shock ending it separates the
 * flow. So the deficit is eased into the one isentropic expansion to that
 * Mach number makes, unchanged while it is well short of it.
 * @param deficit The linear theory's deficit
 * @param mach The Mach number the flow meets the body at
 * @returns The deficit, held
 */
export const capped_deficit = (deficit: number, mach: number): number => {
  const cap = most_deficit(mach);

  return deficit > 0 ? cap * (1 - Math.exp(-deficit / cap)) : deficit;
};

/**
 * The deficit an isentropic expansion to `MAX_LOCAL_MACH` makes.
 * @param mach The Mach number it expands from
 * @returns The deficit
 */
export const most_deficit = (mach: number): number => {
  const g = AIR_GAMMA;
  const half = (g - 1) / 2;

  return (
    1 -
    Math.pow(
      (1 + half * mach * mach) / (1 + half * MAX_LOCAL_MACH * MAX_LOCAL_MACH),
      g / (g - 1),
    )
  );
};

/**
 * How a section's lift is spread along its upper surface, over c_l / π.
 *
 * Attached, thin-airfoil theory's: a suction peak at the leading edge, held
 * finite by its radius. Once the flow separates off a sharp edge that peak is
 * the leading-edge vortex's, and what the attached flow still carries falls
 * off linearly to the trailing edge, the same lift spread differently.
 * @param xi Along the chord, 0 to 1
 * @param separation How much has separated, 0 to 1
 * @returns The shape
 */
export const lift_shape = (xi: number, separation: number): number =>
  Math.sqrt((1 - xi) / (xi + NOSE_RADIUS)) * (1 - separation) +
  Math.PI * (1 - xi) * separation;

/**
 * Where a wing section's shock stands, as a share of its chord.
 * @param field The field
 * @param section The section's lift coefficient
 * @param sonic The critical pressure coefficient
 * @param mach The normal Mach number
 * @returns The chordwise station
 */
export const shock_station = (
  field: VaporField,
  section: number,
  sonic: number,
  mach: number,
): number => {
  if (mach >= 1 || sonic >= 0) {
    return 1;
  }

  // Where the subsonic suction rises back through sonic: Kármán–Tsien
  // inverted to the incompressible coefficient, then thin-airfoil theory
  // inverted to the station, the thickness left out
  const beta = compressibility_beta(mach);
  const k = (mach * mach) / (2 * (1 + beta));
  const target = ((sonic * beta) / (1 - k * sonic)) * field.cos2_sweep;

  // Attached, √((1-ξ)/ξ) inverts in closed form; separated, the load is
  // carried as π(1-ξ), which does too. Between, the stations are blended
  const q = (-target * Math.PI) / Math.max(section, 1e-6);
  const q2 = q * q;
  const attached = (1 - q2 * NOSE_RADIUS) / (1 + q2);
  const separated = 1 - q / Math.PI;
  const station = Math.min(
    Math.max(attached + (separated - attached) * field.separation, 0),
    1,
  );

  return station + (1 - station) * SHOCK_TRAVEL * smoothstep(0.75, 1, mach);
};

/**
 * The slender body's deficit at one point: the vapour cone.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span
 * @returns The deficit
 */
export const cone_deficit = (
  field: VaporField,
  x: number,
  y: number,
  z: number,
): number => {
  if (field.cone_strength <= 0) {
    return 0;
  }

  const xi = (x + field.nose_m) / field.body_length_m;

  if (xi <= 0 || xi >= 1) {
    return 0;
  }

  const r = Math.hypot(y - field.body_height_m, z);
  const radius = body_radius(field, xi);

  // Out past the body, felt further the nearer Mach one
  const beta = compressibility_beta(field.mach);
  const reach = (CONE_REACH * field.body_length_m) / beta;
  const lateral =
    Math.log(1 + reach / Math.max(r, radius)) /
    Math.log(1 + reach / Math.max(radius, 1e-3));

  const shock =
    field.cone_shock + (CONE_SHOCK_LEAN * r) / field.body_length_m;
  const ahead = 1 - smoothstep(shock - 0.01, shock + 0.01, xi);

  const coefficient = karman_tsien(
    -field.cone_strength * area_curvature(xi),
    field.mach,
  );

  return (
    capped_deficit(
      -(AIR_GAMMA / 2) * field.mach * field.mach * coefficient,
      field.mach,
    ) *
    lateral *
    lateral *
    ahead *
    field.cone_fade
  );
};

/**
 * A Sears–Haack body's radius: the least drag for its volume, and close to
 * what an area-ruled fighter's cross-sections add up to.
 * @param field The field
 * @param xi Along the body, 0 to 1
 * @returns The radius, in metres
 */
const body_radius = (field: VaporField, xi: number): number =>
  field.body_radius_m * Math.pow(Math.max(4 * xi * (1 - xi), 0), 0.75);

/**
 * How sharply the body's cross-section shrinks, minus A″, at one in the middle.
 * Slender-body theory's surface pressure goes as A″: suction where the area
 * curves over the shoulder, compression at the nose and the tail.
 * @param xi Along the body, 0 to 1
 * @returns -A″ over its value at the middle
 */
export const area_curvature = (xi: number): number => {
  const u = Math.max(4 * xi * (1 - xi), 1e-3);
  const du = 4 - 8 * xi;

  return (12 * Math.sqrt(u) - (0.75 * du * du) / Math.sqrt(u)) / 12;
};

/**
 * The whole field's deficit at one point.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span
 * @returns The deficit
 */
export const vapor_deficit = (
  field: VaporField,
  x: number,
  y: number,
  z: number,
): number =>
  tip_deficit(field, x, y, z) +
  edge_deficit(field, x, y, z) +
  wing_deficit(field, x, y, z) +
  cone_deficit(field, x, y, z);

/**
 * Work out the field and its bounds for one moment of flight.
 * @param airframe The airframe
 * @param flight Its speed and angle of attack
 * @param conditions The day
 * @param look How uneven the moisture is
 * @returns The state
 */
export const vapor_state = (
  airframe: VaporAirframe,
  flight: VaporFlight,
  conditions: VaporAir,
  look: Pick<VaporLook, "humidity_spread">,
): VaporState => {
  const air = moist_air(
    conditions.altitude_m,
    conditions.relative_humidity,
    conditions.temperature_offset_k,
  );

  const state = flight_state(airframe, flight, air);

  const speed = Math.max(flight.airspeed_m_s, 1e-3);
  const alpha = flight.angle_of_attack_rad;
  const semispan = Math.max(airframe.span_m / 2, 1e-3);
  const tan_sweep = Math.max(Math.tan(airframe.leading_edge_sweep_rad), 0.05);
  // Simple sweep theory credits a swept wing with all of its sweep. A wing of
  // low aspect ratio keeps only part of it, its root and its tip being where
  // the isobars unsweep, so it is given half: cos Λₑ = √cos Λ½
  const effective_cos = Math.sqrt(Math.cos(sweep_at(airframe, 0.5)));
  const { area_m2 } = planform(airframe);

  const vortex_k =
    air.density_kg_m3 / (8 * Math.PI * Math.PI * air.pressure_pa);

  const saturation_deficit = condensing_deficit(
    air,
    1 + Math.max(look.humidity_spread, 0),
  );

  const tip_core = airframe.tip_core_radius * airframe.span_m;
  const tip_circulation = airframe.tip_core_share * state.tip_circulation;

  const tip_growth_m =
    (4 * VORTEX_EDDY_VISCOSITY * state.tip_circulation) / speed;

  // A pair of vortices sinks each other at Γ / 2πb'
  const tip_descent =
    state.tip_circulation /
    (2 * Math.PI * VORTEX_SPACING * airframe.span_m) /
    speed;

  const edge_length_m = Math.max(semispan - airframe.root_span_m, 0) * tan_sweep;

  const field: VaporField = {
    mach: state.mach,
    speed_m_s: speed,
    cos_alpha: Math.cos(alpha),
    sin_alpha: Math.sin(alpha),
    vortex_k,
    saturation_deficit,

    apex_m: airframe.apex_m,
    wing_height_m: airframe.wing_height_m,
    tan_dihedral: Math.tan(airframe.dihedral_rad),
    tan_sweep,
    root_chord_m: airframe.root_chord_m,
    tip_chord_m: airframe.tip_chord_m,
    semispan_m: semispan,
    root_span_m: airframe.root_span_m,
    thickness: airframe.thickness,

    separation:
      Math.min(Math.max(airframe.leading_edge_sharpness, 0), 1) *
      smoothstep(3 * DEGREE, 8 * DEGREE, Math.abs(alpha)),
    section_lift_m:
      Math.max(state.potential_lift_coefficient, 0) *
      (area_m2 / airframe.span_m) *
      (4 / Math.PI),
    cos2_sweep: Math.max(effective_cos, 0.05),
    normal_mach: state.mach * Math.sqrt(effective_cos),

    tip_circulation,
    tip_core2_m2: tip_core * tip_core,
    tip_growth_m,
    tip_descent,
    tip_reach_m: 0,
    tip_bound_m: 0,

    edge_gradient:
      alpha > 0 && edge_length_m > 0
        ? state.leading_edge_circulation / edge_length_m
        : 0,
    edge_length_m,
    edge_core: airframe.leading_edge_core_radius,
    edge_height: LEADING_EDGE_VORTEX_HEIGHT * Math.max(Math.sin(alpha), 0),
    edge_burst_m: state.breakdown * edge_length_m,
    edge_bound_m: 0,

    wing_bound_m: 0,

    nose_m: airframe.nose_m,
    body_length_m: Math.max(airframe.fuselage_length_m, 1e-3),
    body_radius_m: airframe.fuselage_radius_m,
    body_height_m: airframe.fuselage_height_m,
    cone_strength: 0,
    cone_shock: 0,
    cone_fade: 1 - smoothstep(1.05, 1.2, state.mach),
    cone_bound_m: 0,
  };

  // Each part's reach, where its deficit falls to what condenses: past that
  // it is clear air, and the march need not look
  const needed = saturation_deficit;

  const mins: [number, number, number][] = [];
  const maxs: [number, number, number][] = [];

  // Tip vortices
  {
    const well = vortex_k * tip_circulation * tip_circulation;
    const widest = well / needed - field.tip_core2_m2;

    if (needed < 1 && widest > 0) {
      field.tip_bound_m = Math.sqrt(widest) * 1.15 + 0.1;
      field.tip_reach_m = Math.min(
        widest / Math.max(tip_growth_m, 1e-9),
        MAX_TRAIL_M,
      );

      const tip_le = field.apex_m + semispan * tan_sweep;
      const tip_y = field.wing_height_m + semispan * field.tan_dihedral;
      const end_x = tip_le + field.tip_chord_m + field.tip_reach_m * field.cos_alpha;
      const end_y =
        tip_y + field.tip_reach_m * (field.sin_alpha - field.tip_descent);
      const b = field.tip_bound_m;

      mins.push([tip_le - b, Math.min(tip_y, end_y) - b, -semispan - b]);
      maxs.push([end_x + b, Math.max(tip_y, end_y) + b, semispan + b]);
    }
  }

  // Leading-edge vortices: conical, so one deficit all along the unburst core
  {
    const ratio = field.edge_gradient * tan_sweep / Math.max(field.edge_core, 1e-3);
    const well = vortex_k * ratio * ratio;

    if (needed < 1 && well > needed && field.edge_gradient > 0) {
      const end_reach = edge_length_m / tan_sweep;
      const end_core = field.edge_core * end_reach;
      const circulation = field.edge_gradient * edge_length_m;
      const widest = Math.sqrt(
        Math.max(vortex_k * circulation * circulation / needed - end_core * end_core, 0),
      );

      field.edge_bound_m = Math.max(widest, (1 + BURST_SWELL) * end_core) * 1.15 + 0.1;

      const apex_x = field.apex_m + airframe.root_span_m * tan_sweep;
      const b = field.edge_bound_m;
      const trailing = edge_length_m * 0.6;
      const top =
        field.wing_height_m +
        field.edge_height * end_reach +
        field.thickness * field.root_chord_m +
        trailing * (field.sin_alpha / Math.max(field.cos_alpha, 0.1));

      mins.push([
        apex_x - b,
        field.wing_height_m + Math.min(semispan * field.tan_dihedral, 0) - b,
        -semispan - b,
      ]);
      maxs.push([apex_x + edge_length_m + trailing + b, top + b, semispan + b]);
    }
  }

  // The wing's upper surface: the strongest suction it makes, and how high
  // that reaches before it no longer condenses
  {
    let strongest = 0;

    for (let i = 0; i <= 24; i++) {
      for (let j = 0; j <= 12; j++) {
        const span = airframe.root_span_m + ((semispan - airframe.root_span_m) * j) / 12;
        const chord =
          airframe.root_chord_m +
          ((airframe.tip_chord_m - airframe.root_chord_m) * span) / semispan;
        const x = field.apex_m + span * tan_sweep + (chord * i) / 24;
        const y =
          field.wing_height_m +
          span * field.tan_dihedral +
          2 * field.thickness * chord * (i / 24) * (1 - i / 24) +
          1e-3;

        strongest = Math.max(strongest, wing_deficit(field, x, y, span));
      }
    }

    if (needed < 1 && strongest > needed) {
      const reach =
        (WING_FIELD_HEIGHT * airframe.root_chord_m) /
        Math.max(compressibility_beta(field.normal_mach), WING_HEIGHT_MIN_BETA);

      field.wing_bound_m = reach * Math.log(strongest / needed) * 1.1 + 0.05;

      const root_x = field.apex_m + airframe.root_span_m * tan_sweep;
      const trailing = Math.max(
        root_x + airframe.root_chord_m,
        field.apex_m + semispan * tan_sweep + airframe.tip_chord_m,
      );
      const low = field.wing_height_m + Math.min(semispan * field.tan_dihedral, 0);
      const high =
        field.wing_height_m +
        Math.max(semispan * field.tan_dihedral, 0) +
        field.thickness * airframe.root_chord_m;

      mins.push([root_x - 0.05 * airframe.root_chord_m, low - 0.05, -semispan]);
      maxs.push([trailing + 0.1 * airframe.tip_chord_m, high + field.wing_bound_m, semispan]);
    }
  }

  // The cone
  {
    const ratio = airframe.fuselage_radius_m / field.body_length_m;

    field.cone_strength =
      ratio > 0 ? CONE_STRENGTH * ratio * ratio * Math.log(1 / ratio) : 0;
    field.cone_shock =
      CONE_SHOCK_SUBSONIC +
      (CONE_SHOCK_SONIC - CONE_SHOCK_SUBSONIC) * smoothstep(0.85, 1.02, state.mach);

    let strongest = 0;

    for (let i = 1; i < 40; i++) {
      const xi = i / 40;

      if (xi < field.cone_shock) {
        strongest = Math.max(
          strongest,
          cone_deficit(
            field,
            xi * field.body_length_m - field.nose_m,
            field.body_height_m + body_radius(field, xi),
            0,
          ),
        );
      }
    }

    if (needed < 1 && strongest > needed && field.cone_fade > 0) {
      // Out from the body's widest part until it no longer condenses
      const xi = Math.min(0.5, field.cone_shock - 0.02);
      const x = xi * field.body_length_m - field.nose_m;

      let low = body_radius(field, xi);
      let high = 80;

      if (cone_deficit(field, x, field.body_height_m + high, 0) > needed) {
        low = high;
      }

      for (let iteration = 0; iteration < 32 && low < high; iteration++) {
        const middle = (low + high) / 2;

        if (cone_deficit(field, x, field.body_height_m + middle, 0) > needed) {
          low = middle;
        } else {
          high = middle;
        }
      }

      field.cone_bound_m = low * 1.15 + 0.2;

      const b = field.cone_bound_m;
      const shock_x =
        (field.cone_shock + (CONE_SHOCK_LEAN * b) / field.body_length_m + 0.02) *
          field.body_length_m -
        field.nose_m;

      mins.push([-field.nose_m, field.body_height_m - b, -b]);
      maxs.push([shock_x, field.body_height_m + b, b]);
    } else {
      field.cone_strength = 0;
    }
  }

  const visible = mins.length > 0;

  const bounds = {
    min: [0, 0, 0] as [number, number, number],
    max: [0, 0, 0] as [number, number, number],
  };

  if (visible) {
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(...mins.map((m) => m[axis]));
      bounds.max[axis] = Math.max(...maxs.map((m) => m[axis]));
    }
  }

  return { air, flight: state, field, bounds, visible };
};
