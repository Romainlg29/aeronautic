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
import { Vector3 } from "three";
import { AIR_GAMMA, moist_air, type MoistAir } from "./atmosphere";
import { CONDENSATION_MIN_RATIO, condensate, moistest } from "./condensation";
import {
  nearest_along,
  straight_trails,
  trail_point,
  type TrailHistory,
  type TrailLayout,
  type TrailPaths,
} from "./trails";
import type { VaporAir, VaporAirframe, VaporFlight, VaporLook } from "./types";
import {
  SHAPE_STATIONS,
  shape_station,
  station_span,
  trapezoid_shape,
  type WingShape,
} from "./wing-shape";

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

// How hard a canard is loaded against the wing, area for area, and a
// tailplane: a canard lifts, and is usually set to stall before the wing; a
// tailplane trims, and carries a few per cent
export const CANARD_LOADING = 1.2;
export const TAIL_LOADING = 0.15;

// The least deficit the bounds follow the field out to
const BOUND_FLOOR = 0.003;

// The most of the lift a second surface is given
const MAX_SECOND_SHARE = 0.4;

// The tip vortex's eddy viscosity over its circulation (Squire, Owen). What
// spreads its core, and so what ends the trail
export const VORTEX_EDDY_VISCOSITY = 2e-4;

// How many spans behind the wing the sheet takes to roll up
export const ROLLUP_SPANS = 1;

// The longest a trail is drawn, in metres
export const MAX_TRAIL_M = 400;

// How high the leading-edge vortex rides over the wing, as a share of the
// local semispan, per unit sine of the angle of attack
export const LEADING_EDGE_VORTEX_HEIGHT = 1;

// The upper surface's height under the vortex, in thickness times chord: a
// biconvex section's at a quarter of its chord, where the core lies
export const EDGE_SURFACE = 0.375;

// How quickly a burst core swells, as a share of the edge's length, and by
// how much: a burst vortex is several times fatter and far weaker
export const BURST_LENGTH = 0.08;
export const BURST_SWELL = 2;

const DEGREE = Math.PI / 180;

// The fastest a transonic pocket runs locally, its shock separating the flow
// past it
export const MAX_LOCAL_MACH = 1.4;

// How far out from the body the wing's field builds up, as a share of the
// semispan: the body's own flow, not the wing's, is what the root sits in
export const ROOT_FADE = 0.12;

// The leading edge's radius, as a share of the chord: what keeps thin-airfoil
// theory's suction peak finite
export const NOSE_RADIUS = 0.03;

// How far back from the nose a wing's field reaches its full height, in chords
export const NOSE_REACH = 0.3;

// How high a wing's pressure field reaches, in chords, at low speed. The
// Prandtl–Glauert stretch carries it higher, 1/β, as Mach one nears
export const WING_FIELD_HEIGHT = 0.1;

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

// How long the pocket ahead of the cone's shock is, as a share of the body
export const CONE_POCKET_LENGTH = 0.45;

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

  // The wing's span, and where it leaves the body; the rest of its shape is
  // the table's
  semispan_m: number;
  root_span_m: number;

  // The tip: its leading edge, its chord and its height
  tip_leading_m: number;
  tip_chord_m: number;
  tip_height_m: number;

  // The attached flow's lift, as a mean section lift times a chord: the
  // table's loading spreads it along the span
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

  // How far along the air one trail point is from the next
  trail_spacing_m: number;

  // The same for a canard's or a tailplane's tips, if there are any: where
  // its tip is, and its vortex. A bound of zero means none fogs
  second_semispan_m: number;
  second_tip_leading_m: number;
  second_tip_chord_m: number;
  second_tip_height_m: number;
  second_circulation: number;
  second_core2_m2: number;
  second_growth_m: number;
  second_descent: number;
  second_reach_m: number;
  second_bound_m: number;
  second_spacing_m: number;

  // The leading-edge vortex: where it starts, its circulation per metre aft
  // of there, the edge's length, its core and height per metre of local
  // semispan, where it bursts, and how wide it can fog
  edge_apex_m: number;
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
 * The leading-edge vortex's path, from where it starts to the end of the
 * edge, at `SHAPE_STATIONS` points evenly along it. Fixed by the wing's shape,
 * not by the flight: the angle of attack only lifts it.
 */
export type EdgePath = {
  // How far out its core lies, metres from the centreline
  span_m: Float32Array;

  // How high the wing's upper surface is under it
  surface_m: Float32Array;

  // How far out the edge is from the root: the local semispan the conical
  // vortex scales with
  reach_m: Float32Array;
};

/**
 * What the field is evaluated over: its numbers and the wing's tables.
 */
export type VaporGeometry = {
  field: VaporField;
  shape: WingShape;
  path: EdgePath;

  // The tip vortices' centrelines, laid along the flight path: the wing's,
  // and a canard's or a tailplane's
  trails: TrailPaths;
  second_trails: TrailPaths;
};

/**
 * Everything the vapour is drawn from, at one moment.
 */
export type VaporState = VaporGeometry & {
  air: MoistAir;
  flight: FlightState;

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
  // The same day asks the same question every frame
  const key = `${air.temperature_k},${air.pressure_pa},${air.mixing_ratio},${humidity_scale}`;

  if (key === condensing_memo.key) {
    return condensing_memo.deficit;
  }

  const deficit = solve_condensing_deficit(air, humidity_scale);

  condensing_memo.key = key;
  condensing_memo.deficit = deficit;

  return deficit;
};

const condensing_memo = { key: "", deficit: 1 };

/**
 * The bisection `condensing_deficit` remembers.
 * @param air The free stream
 * @param humidity_scale How much moister
 * @returns 1 - the pressure ratio, or 1 if nothing in reach condenses
 */
const solve_condensing_deficit = (
  air: MoistAir,
  humidity_scale: number,
): number => {
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
  { field, trails, second_trails }: VaporGeometry,
  x: number,
  y: number,
  z: number,
): number => {
  let deficit = 0;

  for (const which of ["wing", "second"] as const) {
    const tip = tip_source(field, which);
    const paths = which === "wing" ? trails : second_trails;

    if (tip.circulation <= 0) {
      continue;
    }

    deficit +=
      side_deficit(tip, paths.positive, paths.spacing_m, 1, x, y, z) +
      side_deficit(tip, paths.negative, paths.spacing_m, -1, x, y, z);
  }

  return deficit;
};

/**
 * One lifting surface's tips: where they are and what their vortices are.
 */
type TipSource = {
  leading_m: number;
  chord_m: number;
  height_m: number;
  semispan_m: number;
  circulation: number;
  core2_m2: number;
  growth_m: number;
  descent: number;
  reach_m: number;
  vortex_k: number;
  cos_alpha: number;
  sin_alpha: number;
};

/**
 * The wing's tips, or a canard's or a tailplane's, from a field.
 * @param field The field
 * @param which Which surface
 * @returns Its tips
 */
const tip_source = (field: VaporField, which: "wing" | "second"): TipSource =>
  which === "wing"
    ? {
        leading_m: field.tip_leading_m,
        chord_m: field.tip_chord_m,
        height_m: field.tip_height_m,
        semispan_m: field.semispan_m,
        circulation: field.tip_circulation,
        core2_m2: field.tip_core2_m2,
        growth_m: field.tip_growth_m,
        descent: field.tip_descent,
        reach_m: field.tip_reach_m,
        vortex_k: field.vortex_k,
        cos_alpha: field.cos_alpha,
        sin_alpha: field.sin_alpha,
      }
    : {
        leading_m: field.second_tip_leading_m,
        chord_m: field.second_tip_chord_m,
        height_m: field.second_tip_height_m,
        semispan_m: field.second_semispan_m,
        circulation: field.second_circulation,
        core2_m2: field.second_core2_m2,
        growth_m: field.second_growth_m,
        descent: field.second_descent,
        reach_m: field.second_reach_m,
        vortex_k: field.vortex_k,
        cos_alpha: field.cos_alpha,
        sin_alpha: field.sin_alpha,
      };

/**
 * One tip vortex's deficit at one point.
 * @param tip The surface whose tip it is
 * @param points Its trail's points
 * @param spacing_m How far apart they are
 * @param side +1 or -1, which tip
 * @param x Aft
 * @param y Up
 * @param z Out along the span
 * @returns The deficit
 */
const side_deficit = (
  tip: TipSource,
  points: Float32Array,
  spacing_m: number,
  side: number,
  x: number,
  y: number,
  z: number,
): number => {
  const tip_le = tip.leading_m;
  const tip_te = tip_le + tip.chord_m;

  const along = nearest_along(points, spacing_m, source_layout(tip), x, y, z);

  const deficit = (circulation: number, r2: number, core2: number) =>
    (tip.vortex_k * circulation * circulation) / Math.max(r2 + core2, 1e-6);

  if (along < 0) {
    // Forming along the tip chord, from nothing at the leading edge
    const formed = Math.min(
      Math.max((x - tip_le) / Math.max(tip.chord_m, 1e-3), 0),
      1,
    );
    const ax = Math.min(Math.max(x, tip_le), tip_te);
    const r2 =
      (x - ax) ** 2 +
      (y - tip.height_m) ** 2 +
      (z - side * tip.semispan_m) ** 2;

    return deficit(tip.circulation * formed, r2, tip.core2_m2);
  }

  const at = trail_point(points, spacing_m, along, scratch_trail);
  const r2 = (x - at.x) ** 2 + (y - at.y) ** 2 + (z - at.z) ** 2;

  return deficit(tip.circulation, r2, tip.core2_m2 + tip.growth_m * along);
};

/**
 * How one surface's tip vortices are laid.
 * @param tip The surface's tips
 * @returns The layout
 */
const source_layout = (tip: TipSource): TrailLayout => ({
  tip_x: tip.leading_m + tip.chord_m,
  tip_y: tip.height_m,
  semispan_m: tip.semispan_m,
  cos_alpha: tip.cos_alpha,
  sin_alpha: tip.sin_alpha,
  descent: tip.descent,
  rollup_m: ROLLUP_SPANS * 2 * tip.semispan_m,
  length_m: Math.max(tip.reach_m, 1),
});

/**
 * How the tip vortices are laid, from a field.
 * @param field The field
 * @param which The wing's, or a canard's or a tailplane's
 * @returns The layout
 */
export const trail_layout = (
  field: VaporField,
  which: "wing" | "second" = "wing",
): TrailLayout => source_layout(tip_source(field, which));

const scratch_trail = new Vector3();

/**
 * The leading-edge vortex's deficit at one point.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span; folded
 * @returns The deficit
 */
export const edge_deficit = (
  { field, path }: VaporGeometry,
  x: number,
  y: number,
  z: number,
): number => {
  const along = x - field.edge_apex_m;

  if (along <= 0 || field.edge_gradient <= 0) {
    return 0;
  }

  const on_wing = Math.min(along, field.edge_length_m);
  const past = along - on_wing;

  const at = edge_at(path, on_wing / Math.max(field.edge_length_m, 1e-3));

  const vy =
    at.surface_m +
    field.edge_height * at.reach_m +
    past * (field.sin_alpha / Math.max(field.cos_alpha, 0.1));

  const r2 = (y - vy) ** 2 + (Math.abs(z) - at.span_m) ** 2;

  const burst = smoothstep(
    field.edge_burst_m,
    field.edge_burst_m + BURST_LENGTH * field.edge_length_m,
    along,
  );

  const core =
    Math.max(field.edge_core * at.reach_m, 0.02) * (1 + BURST_SWELL * burst);

  // Off the edge it trails away into the tip vortex's sheet
  const leaving = Math.exp(-past / (0.3 * field.edge_length_m));

  return vortex_deficit(
    field,
    field.edge_gradient * on_wing * (1 - 0.3 * burst) * leaving,
    r2,
    core * core,
  );
};

/**
 * The leading-edge vortex's path at one point along it.
 * @param path The path
 * @param share How far along it, 0 to 1
 * @returns Where its core is, the surface under it and the local semispan
 */
export const edge_at = (
  path: EdgePath,
  share: number,
): { span_m: number; surface_m: number; reach_m: number } => {
  const position = Math.min(Math.max(share, 0), 1) * (SHAPE_STATIONS - 1);
  const index = Math.min(Math.floor(position), SHAPE_STATIONS - 2);
  const t = position - index;

  const lerp = (values: Float32Array) =>
    values[index] + (values[index + 1] - values[index]) * t;

  return {
    span_m: lerp(path.span_m),
    surface_m: lerp(path.surface_m),
    reach_m: lerp(path.reach_m),
  };
};

// Where along the chord the wing's strongest suction is looked for: crowded
// at the nose, where the peak is, and where a shock's rooftop starts
const BOUND_CHORD = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9];

// The path is the shape's alone, and the shape changes far less often than
// the flight: worked out once per shape
const edge_paths = new WeakMap<
  WingShape,
  { apex_m: number; length_m: number; path: EdgePath }
>();

/**
 * `edge_path`, remembered per shape.
 * @param shape The wing
 * @param apex_m Where the edge leaves the body
 * @param length_m How far aft it runs
 * @returns The path
 */
const cached_edge_path = (
  shape: WingShape,
  apex_m: number,
  length_m: number,
): EdgePath => {
  const held = edge_paths.get(shape);

  if (held && held.apex_m === apex_m && held.length_m === length_m) {
    return held.path;
  }

  const path = edge_path(shape, apex_m, length_m);

  edge_paths.set(shape, { apex_m, length_m, path });

  return path;
};

/**
 * Lay the leading-edge vortex's path along a wing's leading edge.
 *
 * At each station aft of where the edge leaves the body, the core lies a set
 * share of the way out to the edge, and the vortex scales with how far out
 * the edge is: a delta's flow is conical, a cranked edge's piecewise so.
 * @param shape The wing
 * @param apex_m Where the edge leaves the body, how far aft
 * @param length_m How far aft it runs to the tip
 * @returns The path
 */
export const edge_path = (
  shape: WingShape,
  apex_m: number,
  length_m: number,
): EdgePath => {
  const path: EdgePath = {
    span_m: new Float32Array(SHAPE_STATIONS),
    surface_m: new Float32Array(SHAPE_STATIONS),
    reach_m: new Float32Array(SHAPE_STATIONS),
  };

  const out = Math.max(shape.semispan_m - shape.root_span_m, 1e-3);

  for (let index = 0; index < SHAPE_STATIONS; index++) {
    const share = index / (SHAPE_STATIONS - 1);
    const x = apex_m + share * length_m;

    // Where the leading edge reaches this far aft, walking out from the root
    let reach = share * out;

    if (length_m > 1e-3) {
      reach = out;

      for (let station = 1; station < SHAPE_STATIONS; station++) {
        const inner = station_span(shape, station - 1);
        const outer = station_span(shape, station);

        if (outer <= shape.root_span_m) {
          continue;
        }

        const from = Math.max(inner, shape.root_span_m);
        const x0 = shape_station(shape, from).leading_m;
        const x1 = shape.leading_m[station];

        if (x <= x1) {
          const t =
            x1 > x0 ? Math.min(Math.max((x - x0) / (x1 - x0), 0), 1) : 0;

          reach = from + (outer - from) * t - shape.root_span_m;
          break;
        }
      }
    }

    const span = shape.root_span_m + LEADING_EDGE_VORTEX_SPAN * reach;
    const station = shape_station(shape, span);

    path.span_m[index] = span;
    path.surface_m[index] =
      station.mid_m + EDGE_SURFACE * station.thickness * station.chord_m;
    path.reach_m[index] = Math.max(reach, 0);
  }

  return path;
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
  { field, shape }: VaporGeometry,
  x: number,
  y: number,
  z: number,
): number => {
  const span = Math.abs(z);
  const eta = span / field.semispan_m;

  if (eta >= 1) {
    return 0;
  }

  const station = shape_station(shape, span);
  const chord = Math.max(station.chord_m, 0.05);

  const xi = (x - station.leading_m) / chord;
  const along = Math.min(Math.max(xi, 0), 1);

  const surface =
    station.mid_m + 2 * station.thickness * chord * along * (1 - along);

  const height = y - surface;

  if (height < 0) {
    return 0;
  }

  // The section's lift, attached flow only: the vortex lift is the
  // leading-edge vortex's
  const section = (field.section_lift_m * station.loading) / chord;

  const incompressible = (at: number) =>
    -(section / Math.PI) * lift_shape(at, field.separation) -
    1.3 * station.thickness * Math.sin(Math.PI * at);

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
    const ahead =
      1 - smoothstep(shock - SHOCK_WIDTH, shock + SHOCK_WIDTH, along);

    // Ahead of it the supersonic plateau holds the peak's suction; behind
    // it the flow is subsonic again, at no less than sonic pressure
    coefficient =
      Math.min(coefficient, peak) * ahead +
      Math.max(coefficient, sonic) * (1 - ahead);
  }

  // Up from the surface it decays, reaching further as Mach one nears. A
  // disturbance is felt about as far off the surface as it is long, so near
  // the nose, where the suction is a narrow peak, it reaches less high
  const reach =
    ((WING_FIELD_HEIGHT * chord) /
      Math.max(compressibility_beta(mach), WING_HEIGHT_MIN_BETA)) *
    nose_reach(along);

  const fade =
    smoothstep(
      field.root_span_m / field.semispan_m,
      field.root_span_m / field.semispan_m + ROOT_FADE,
      eta,
    ) *
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
 * How high a wing's field reaches at one station, against its reach mid-chord.
 * @param xi Along the chord, 0 to 1
 * @returns The share
 */
export const nose_reach = (xi: number): number =>
  Math.min((xi + NOSE_RADIUS) / NOSE_REACH, 1);

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
  { field }: VaporGeometry,
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

  const shock = field.cone_shock + (CONE_SHOCK_LEAN * r) / field.body_length_m;
  const ahead = 1 - smoothstep(shock - 0.01, shock + 0.01, xi);

  // A transonic pocket keeps expanding until the shock that ends it: the
  // suction, and how far out it is felt, build towards the shock. Hence a
  // cone opening aft, soft at its front and hard at its back
  const pocket = cone_pocket(xi, shock);

  // Out past the body, felt further the nearer Mach one
  const beta = compressibility_beta(field.mach);
  const reach =
    ((CONE_REACH * field.body_length_m) / beta) * (0.2 + 0.8 * pocket);
  const lateral =
    Math.log(1 + reach / Math.max(r, radius)) /
    Math.log(1 + reach / Math.max(radius, 1e-3));

  const coefficient = karman_tsien(-field.cone_strength * pocket, field.mach);

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
 * How far the flow round the body has expanded, from the shoulder to the
 * shock.
 * @param xi Along the body, 0 to 1
 * @param shock Where the shock stands, as a share of the body
 * @returns 0 at the start of the pocket, 1 at the shock
 */
export const cone_pocket = (xi: number, shock: number): number =>
  smoothstep(shock - CONE_POCKET_LENGTH, shock, xi);

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
 * The whole field's deficit at one point.
 * @param field The field
 * @param x Aft
 * @param y Up
 * @param z Out along the span
 * @returns The deficit
 */
export const vapor_deficit = (
  geometry: VaporGeometry,
  x: number,
  y: number,
  z: number,
): number =>
  tip_deficit(geometry, x, y, z) +
  edge_deficit(geometry, x, y, z) +
  wing_deficit(geometry, x, y, z) +
  cone_deficit(geometry, x, y, z);

/**
 * Work out the field and its bounds for one moment of flight.
 * @param airframe The airframe
 * @param flight Its speed and angle of attack
 * @param conditions The day
 * @param look How uneven the moisture is
 * @param shape The wing as a table, if it was captured; by default the
 *   airframe's trapezoid
 * @param history The aircraft's path through the air, for the trails to
 *   follow; without one they run straight back along the free stream
 * @returns The state
 */
export const vapor_state = (
  airframe: VaporAirframe,
  flight: VaporFlight,
  conditions: VaporAir,
  look: Pick<VaporLook, "humidity_spread">,
  shape: WingShape = trapezoid_shape(airframe),
  history?: TrailHistory,
): VaporState => {
  const air = moist_air(
    conditions.altitude_m,
    conditions.relative_humidity,
    conditions.temperature_offset_k,
  );

  const state = flight_state(airframe, flight, air);

  const speed = Math.max(flight.airspeed_m_s, 1e-3);
  const alpha = flight.angle_of_attack_rad;
  const semispan = shape.semispan_m;
  const span = semispan * 2;
  const tip = SHAPE_STATIONS - 1;

  // Simple sweep theory credits a swept wing with all of its sweep. A wing of
  // low aspect ratio keeps only part of it, its root and its tip being where
  // the isobars unsweep, so it is given half: cos Λₑ = √cos Λ½
  const effective_cos = Math.sqrt(Math.cos(sweep_at(airframe, 0.5)));
  const { area_m2 } = planform(airframe);

  const vortex_k =
    air.density_kg_m3 / (8 * Math.PI * Math.PI * air.pressure_pa);

  const saturation_deficit = condensing_deficit(
    air,
    moistest(air, look.humidity_spread),
  );

  // A canard carries a real share of the lift, near its area's share and
  // more, being loaded harder; a tailplane trims, and carries little. The
  // wing carries what a canard does not
  const secondary = shape.secondary ?? null;

  const share = secondary
    ? Math.min(
        (secondary.area_m2 / Math.max(area_m2, 1e-3)) *
          (secondary.kind === "canard" ? CANARD_LOADING : TAIL_LOADING),
        MAX_SECOND_SHARE,
      )
    : 0;

  const wing_share = secondary && secondary.kind === "canard" ? 1 - share : 1;

  // Each surface's rolled-up circulation: its lift over ρ V π/4 of its span
  const wing_circulation = state.tip_circulation * wing_share;
  const second_span = secondary ? secondary.semispan_m * 2 : 1;
  const second_circulation = secondary
    ? (state.tip_circulation * share * span) / second_span
    : 0;

  const tip_core = airframe.tip_core_radius * span;
  const tip_circulation = airframe.tip_core_share * wing_circulation;

  const tip_growth_m = (4 * VORTEX_EDDY_VISCOSITY * wing_circulation) / speed;

  // A pair of vortices sinks each other at Γ / 2πb'
  const tip_descent =
    wing_circulation / (2 * Math.PI * VORTEX_SPACING * span) / speed;

  const second_core = airframe.tip_core_radius * second_span;

  // The leading edge from where it leaves the body to the tip
  const edge_apex_m = shape_station(shape, shape.root_span_m).leading_m;
  const edge_length_m = Math.max(shape.leading_m[tip] - edge_apex_m, 0);
  const path = cached_edge_path(shape, edge_apex_m, edge_length_m);

  const field: VaporField = {
    mach: state.mach,
    speed_m_s: speed,
    cos_alpha: Math.cos(alpha),
    sin_alpha: Math.sin(alpha),
    vortex_k,
    saturation_deficit,

    semispan_m: semispan,
    root_span_m: shape.root_span_m,
    tip_leading_m: shape.leading_m[tip],
    tip_chord_m: Math.max(shape.chord_m[tip], 1e-3),
    tip_height_m: shape.mid_m[tip],

    separation:
      Math.min(Math.max(airframe.leading_edge_sharpness, 0), 1) *
      smoothstep(3 * DEGREE, 8 * DEGREE, Math.abs(alpha)),
    section_lift_m:
      Math.max(state.potential_lift_coefficient, 0) * (area_m2 / span),
    cos2_sweep: Math.max(effective_cos, 0.05),
    normal_mach: state.mach * Math.sqrt(effective_cos),

    tip_circulation,
    tip_core2_m2: tip_core * tip_core,
    tip_growth_m,
    tip_descent,
    tip_reach_m: 0,
    tip_bound_m: 0,
    trail_spacing_m: 1,

    second_semispan_m: secondary?.semispan_m ?? 1,
    second_tip_leading_m: secondary?.tip_leading_m ?? 0,
    second_tip_chord_m: secondary?.tip_chord_m ?? 1,
    second_tip_height_m: secondary?.tip_height_m ?? 0,
    second_circulation: airframe.tip_core_share * second_circulation,
    second_core2_m2: second_core * second_core,
    second_growth_m: (4 * VORTEX_EDDY_VISCOSITY * second_circulation) / speed,
    second_descent:
      second_circulation / (2 * Math.PI * VORTEX_SPACING * second_span) / speed,
    second_reach_m: 0,
    second_bound_m: 0,
    second_spacing_m: 1,

    edge_apex_m,
    edge_gradient:
      alpha > 0 && edge_length_m > 1e-3
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

  // Straight for now: the tips' bounds below set how long they are, and they
  // are laid along the history once that is known
  const geometry: VaporGeometry = {
    field,
    shape,
    path,
    trails: straight_trails(trail_layout(field)),
    second_trails: straight_trails(trail_layout(field, "second")),
  };

  // The wing's extent outboard of the body, for the boxes
  let wing_front = Infinity;
  let wing_back = -Infinity;
  let wing_low = Infinity;
  let wing_high = -Infinity;
  let deepest = 0;

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    if (station_span(shape, station + 1) < shape.root_span_m) {
      continue;
    }

    const chord = shape.chord_m[station];
    const half = shape.thickness[station] * chord * 0.5;

    wing_front = Math.min(wing_front, shape.leading_m[station]);
    wing_back = Math.max(wing_back, shape.leading_m[station] + chord);
    wing_low = Math.min(wing_low, shape.mid_m[station] - half);
    wing_high = Math.max(wing_high, shape.mid_m[station] + half);
    deepest = Math.max(deepest, chord);
  }

  // Each part's reach, where its deficit falls to what condenses: past that
  // it is clear air, and the march need not look
  // Floored for the bounds alone: on a day within a hair of saturation the
  // last few thousandths only make a haze too thin to see, and following it
  // out would make the boxes enormous
  const needed = Math.max(saturation_deficit, BOUND_FLOOR);

  const mins: [number, number, number][] = [];
  const maxs: [number, number, number][] = [];

  // Tip vortices: the wing's, and a canard's or a tailplane's
  for (const which of ["wing", "second"] as const) {
    const tip = tip_source(field, which);
    const well = vortex_k * tip.circulation * tip.circulation;
    const widest = well / needed - tip.core2_m2;

    if (!(needed < 1 && widest > 0 && tip.circulation > 0)) {
      continue;
    }

    const bound = Math.sqrt(widest) * 1.15 + 0.1;
    const reach = Math.min(widest / Math.max(tip.growth_m, 1e-9), MAX_TRAIL_M);

    if (which === "wing") {
      field.tip_bound_m = bound;
      field.tip_reach_m = reach;
    } else {
      field.second_bound_m = bound;
      field.second_reach_m = reach;
    }

    const layout = trail_layout(field, which);
    const trails = history ? history.paths(layout) : straight_trails(layout);

    if (which === "wing") {
      geometry.trails = trails;
    } else {
      geometry.second_trails = trails;
    }

    // Round the tips, and every point of both trails
    const low: [number, number, number] = [
      tip.leading_m - bound,
      tip.height_m - bound,
      -tip.semispan_m - bound,
    ];
    const high: [number, number, number] = [
      tip.leading_m + tip.chord_m + bound,
      tip.height_m + bound,
      tip.semispan_m + bound,
    ];

    for (const points of [trails.positive, trails.negative]) {
      for (let index = 0; index < points.length; index += 3) {
        for (let axis = 0; axis < 3; axis++) {
          low[axis] = Math.min(low[axis], points[index + axis] - bound);
          high[axis] = Math.max(high[axis], points[index + axis] + bound);
        }
      }
    }

    mins.push(low);
    maxs.push(high);
  }

  // Leading-edge vortices: the deepest well anywhere along the unburst core.
  // Conical flow holds it constant; a cranked edge does not
  {
    let steepest = 0;

    for (let index = 1; index < SHAPE_STATIONS; index++) {
      const along = (index / (SHAPE_STATIONS - 1)) * edge_length_m;

      steepest = Math.max(
        steepest,
        along / Math.max(path.reach_m[index], 1e-3),
      );
    }

    const ratio =
      (field.edge_gradient * steepest) / Math.max(field.edge_core, 1e-3);
    const well = vortex_k * ratio * ratio;

    if (needed < 1 && well > needed && field.edge_gradient > 0) {
      const end_reach = path.reach_m[tip];
      const end_core = field.edge_core * end_reach;
      const circulation = field.edge_gradient * edge_length_m;
      const widest = Math.sqrt(
        Math.max(
          (vortex_k * circulation * circulation) / needed - end_core * end_core,
          0,
        ),
      );

      field.edge_bound_m =
        Math.max(widest, (1 + BURST_SWELL) * end_core) * 1.15 + 0.1;

      const b = field.edge_bound_m;
      const trailing = edge_length_m * 0.6;
      const top =
        Math.max(...path.surface_m) +
        field.edge_height * end_reach +
        trailing * (field.sin_alpha / Math.max(field.cos_alpha, 0.1));

      mins.push([edge_apex_m - b, wing_low - b, -semispan - b]);
      maxs.push([
        edge_apex_m + edge_length_m + trailing + b,
        top + b,
        semispan + b,
      ]);
    }
  }

  // The wing's upper surface: the strongest suction it makes, and how high
  // that reaches before it no longer condenses
  {
    let strongest = 0;

    for (const xi of BOUND_CHORD) {
      for (let j = 0; j <= 6; j++) {
        const span_at =
          shape.root_span_m + ((semispan - shape.root_span_m) * j) / 6;
        const station = shape_station(shape, span_at);
        const x = station.leading_m + station.chord_m * xi;
        const y =
          station.mid_m +
          2 * station.thickness * station.chord_m * xi * (1 - xi) +
          1e-3;

        strongest = Math.max(
          strongest,
          wing_deficit(geometry, x, y, Math.min(span_at, semispan * 0.999)),
        );
      }
    }

    if (needed < 1 && strongest > needed && Number.isFinite(wing_front)) {
      const reach =
        (WING_FIELD_HEIGHT * deepest) /
        Math.max(compressibility_beta(field.normal_mach), WING_HEIGHT_MIN_BETA);

      field.wing_bound_m = reach * Math.log(strongest / needed) * 1.1 + 0.05;

      mins.push([wing_front - 0.05 * deepest, wing_low - 0.05, -semispan]);
      maxs.push([
        wing_back + 0.1 * field.tip_chord_m,
        wing_high + field.wing_bound_m,
        semispan,
      ]);
    }
  }

  // The cone
  {
    const ratio = airframe.fuselage_radius_m / field.body_length_m;

    field.cone_strength =
      ratio > 0 ? CONE_STRENGTH * ratio * ratio * Math.log(1 / ratio) : 0;
    field.cone_shock =
      CONE_SHOCK_SUBSONIC +
      (CONE_SHOCK_SONIC - CONE_SHOCK_SUBSONIC) *
        smoothstep(0.85, 1.02, state.mach);

    let strongest = 0;

    for (let i = 1; i < 40; i++) {
      const xi = i / 40;

      if (xi < field.cone_shock) {
        strongest = Math.max(
          strongest,
          cone_deficit(
            geometry,
            xi * field.body_length_m - field.nose_m,
            field.body_height_m + body_radius(field, xi),
            0,
          ),
        );
      }
    }

    if (needed < 1 && strongest > needed && field.cone_fade > 0) {
      // Out from the body's widest part until it no longer condenses
      const xi = field.cone_shock - 0.02;
      const x = xi * field.body_length_m - field.nose_m;

      let low = body_radius(field, xi);
      let high = 80;

      if (cone_deficit(geometry, x, field.body_height_m + high, 0) > needed) {
        low = high;
      }

      for (let iteration = 0; iteration < 32 && low < high; iteration++) {
        const middle = (low + high) / 2;

        if (
          cone_deficit(geometry, x, field.body_height_m + middle, 0) > needed
        ) {
          low = middle;
        } else {
          high = middle;
        }
      }

      field.cone_bound_m = low * 1.15 + 0.2;

      const b = field.cone_bound_m;
      const shock_x =
        (field.cone_shock +
          (CONE_SHOCK_LEAN * b) / field.body_length_m +
          0.02) *
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

  field.trail_spacing_m = geometry.trails.spacing_m;
  field.second_spacing_m = geometry.second_trails.spacing_m;

  return {
    air,
    flight: state,
    field,
    shape,
    path,
    trails: geometry.trails,
    second_trails: geometry.second_trails,
    bounds,
    visible,
  };
};

/**
 * What the shader would otherwise work out at every sample: everything in the
 * wing's and the cone's compressible corrections that only the Mach number
 * sets.
 */
export type VaporConstants = {
  // (γ/2) M², turning a pressure coefficient into a deficit
  wing_scale: number;

  // The normal flow's critical pressure, β and Kármán–Tsien's M²/2(1+β)
  wing_sonic: number;
  wing_beta: number;
  wing_kt: number;

  // The most deficit its pocket can reach
  wing_cap: number;

  // How high its field reaches, in chords
  wing_reach: number;

  // How far aft of its sonic point the shock has been pushed, as a share of
  // what is left of the chord; and 1 once the normal flow is supersonic
  wing_travel: number;
  wing_supersonic: number;

  // The same for the body
  cone_scale: number;
  cone_beta: number;
  cone_kt: number;
  cone_cap: number;

  // How far out its field reaches, in metres
  cone_reach_m: number;
};

/**
 * Work out the shader's per-frame constants from a field.
 * @param field The field
 * @returns The constants
 */
export const vapor_constants = (field: VaporField): VaporConstants => {
  const wing_mach = field.normal_mach;
  const wing_beta = compressibility_beta(wing_mach);
  const cone_beta = compressibility_beta(field.mach);

  return {
    wing_scale: (AIR_GAMMA / 2) * wing_mach * wing_mach,
    wing_sonic: critical_pressure(wing_mach),
    wing_beta,
    wing_kt: (wing_mach * wing_mach) / (2 * (1 + wing_beta)),
    wing_cap: most_deficit(wing_mach),
    wing_reach: WING_FIELD_HEIGHT / Math.max(wing_beta, WING_HEIGHT_MIN_BETA),
    wing_travel: SHOCK_TRAVEL * smoothstep(0.75, 1, wing_mach),
    wing_supersonic: wing_mach >= 1 ? 1 : 0,

    cone_scale: (AIR_GAMMA / 2) * field.mach * field.mach,
    cone_beta,
    cone_kt: (field.mach * field.mach) / (2 * (1 + cone_beta)),
    cone_cap: most_deficit(field.mach),
    cone_reach_m: (CONE_REACH * field.body_length_m) / cone_beta,
  };
};
