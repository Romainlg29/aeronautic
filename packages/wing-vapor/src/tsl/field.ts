import {
  abs,
  clamp,
  exp,
  float,
  length,
  log,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  vec2,
  vec3,
} from "three/tsl";
import type { Texture } from "three";
import type { Node } from "three/webgpu";
import { VORTEX_SPACING } from "../aerodynamics";
import { SHAPE_STATIONS } from "../wing-shape";
import {
  BURST_LENGTH,
  BURST_SWELL,
  CONE_POCKET_LENGTH,
  CONE_SHOCK_LEAN,
  NOSE_RADIUS,
  NOSE_REACH,
  ROLLUP_SPANS,
  ROOT_FADE,
  SHOCK_WIDTH,
  type VaporConstants,
  type VaporField,
} from "../vapor-field";
import type { VaporEffects } from "../types";

// The pressure field, as TSL
//
// Node for node what `vapor-field.ts` works out on the CPU, where it is tested.
// Every point is in the airframe's canonical frame, metres from its origin,
// x aft, y up and z out along a wing; z is folded here, so one evaluation
// covers both wings

type F = Node<"float">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

/**
 * The field's numbers, as float nodes: uniforms, in the material.
 */
export type VaporFieldNodes = { [K in keyof (VaporField & VaporConstants)]: F };

// The wing's tables, as one texture's rows: the stations along the span, their
// loading, and the leading-edge vortex's path. `create_shape_texture` makes it
export const SHAPE_ROWS = 3;

/**
 * One row of the shape texture, between its texels.
 * @param shape The texture
 * @param share How far along the row, 0 to 1
 * @param row Which row
 * @returns The four channels
 */
const shape_row = (shape: Texture, share: F, row: number): V4 =>
  texture(
    shape,
    vec2(
      clamp(share, 0, 1)
        .mul(SHAPE_STATIONS - 1)
        .add(0.5)
        .div(SHAPE_STATIONS),
      (row + 0.5) / SHAPE_ROWS,
    ),
  ).level(float(0)) as unknown as V4;

// Further than anything is from anything, for a part that is switched off
const FAR = 1e5;

// How far a bound may be trusted per metre it claims: the vortex paths bend,
// so their distances are not quite Euclidean
const BOUND_SAFETY = 0.85;

/**
 * A Scully vortex's pressure deficit.
 * @param f The field
 * @param circulation Its circulation
 * @param radius2 How far from its axis, squared
 * @param core2 Its core radius, squared
 * @returns The deficit
 */
const vortex_deficit = (
  f: VaporFieldNodes,
  circulation: F,
  radius2: F,
  core2: F,
): F =>
  f.vortex_k
    .mul(circulation)
    .mul(circulation)
    .div(max(radius2.add(core2), 1e-6));

/**
 * Hold a deficit to what a pocket can reach.
 * @param deficit The linear theory's deficit
 * @param cap The most it may be
 * @returns The deficit, eased into the cap
 */
const capped = (deficit: F, cap: F): F =>
  select(
    deficit.greaterThan(0),
    cap.mul(exp(deficit.negate().div(max(cap, 1e-4))).oneMinus()),
    deficit,
  );

/**
 * Kármán–Tsien, with its β and M²/2(1+β) worked out already.
 * @param incompressible The low speed pressure coefficient
 * @param beta β
 * @param kt M²/2(1+β)
 * @returns The compressible one
 */
const karman_tsien = (incompressible: F, beta: F, kt: F): F =>
  incompressible.div(max(beta.add(kt.mul(incompressible)), beta.mul(0.5)));

/**
 * A tip vortex at one point: its deficit, and how far the point is outside
 * the tube it can fog in, and how fine a step it needs there.
 * @param f The field
 * @param p The point, z folded
 * @returns The deficit, the distance and the step
 */
export const tip_vortex = (f: VaporFieldNodes, p: V3): V3 => {
  const tip_le = f.tip_leading_m;
  const tip_te = tip_le.add(f.tip_chord_m);
  const tip_y = f.tip_height_m;

  const along = p.x
    .sub(tip_te)
    .mul(f.cos_alpha)
    .add(p.y.sub(tip_y).mul(f.sin_alpha));

  const ahead = along.lessThan(0);
  const trailed = max(along, 0);

  const rolled = exp(
    trailed.negate().div(f.semispan_m.mul(2 * ROLLUP_SPANS)),
  ).oneMinus();

  const axis = vec3(
    select(
      ahead,
      clamp(p.x, tip_le, tip_te),
      tip_te.add(trailed.mul(f.cos_alpha)),
    ),
    tip_y.add(trailed.mul(f.sin_alpha.sub(f.tip_descent))),
    f.semispan_m.mul(rolled.mul(VORTEX_SPACING - 1).add(1)),
  );

  const offset = p.sub(axis);
  const radius2 = offset.dot(offset);

  const formed = select(
    ahead,
    clamp(p.x.sub(tip_le).div(f.tip_chord_m), 0, 1),
    float(1),
  );

  const core2 = f.tip_core2_m2.add(f.tip_growth_m.mul(trailed));

  const deficit = vortex_deficit(
    f,
    f.tip_circulation.mul(formed),
    radius2,
    core2,
  );

  const outside = sqrt(radius2)
    .sub(f.tip_bound_m)
    .add(max(along.sub(f.tip_reach_m), 0))
    .mul(BOUND_SAFETY);

  return vec3(
    deficit,
    select(f.tip_bound_m.greaterThan(0), outside, float(FAR)),
    clamp(sqrt(core2).mul(0.4), 0.03, 1.5),
  );
};

/**
 * A leading-edge vortex at one point.
 * @param f The field
 * @param shape The wing's tables
 * @param p The point, z folded
 * @returns The deficit, the distance outside its tube and the step
 */
export const edge_vortex = (f: VaporFieldNodes, shape: Texture, p: V3): V3 => {
  const along = p.x.sub(f.edge_apex_m);
  const length_m = max(f.edge_length_m, 1e-3);

  const on_wing = clamp(along, 0, f.edge_length_m);
  const past = max(along.sub(f.edge_length_m), 0);

  // Where along the edge's own path: its core, the surface under it, and how
  // far out the edge is there
  const path = shape_row(shape, on_wing.div(length_m), 2);
  const vz = path.x;
  const reach = path.z;

  const vy = path.y
    .add(f.edge_height.mul(reach))
    .add(past.mul(f.sin_alpha.div(max(f.cos_alpha, 0.1))));

  const across = vec2(p.y.sub(vy), p.z.sub(vz));
  const radius2 = across.dot(across);

  const burst = smoothstep(
    f.edge_burst_m,
    f.edge_burst_m.add(length_m.mul(BURST_LENGTH)),
    along,
  );

  const core = max(f.edge_core.mul(reach), 0.02).mul(
    burst.mul(BURST_SWELL).add(1),
  );

  const leaving = exp(past.negate().div(length_m.mul(0.3)));

  const deficit = select(
    along.greaterThan(0),
    vortex_deficit(
      f,
      f.edge_gradient.mul(on_wing).mul(burst.mul(-0.3).add(1)).mul(leaving),
      radius2,
      core.mul(core),
    ),
    float(0),
  );

  const outside = sqrt(radius2)
    .sub(f.edge_bound_m)
    .add(max(along.negate(), 0))
    .add(max(past.sub(length_m.mul(0.6)), 0))
    .mul(BOUND_SAFETY);

  return vec3(
    deficit,
    select(f.edge_bound_m.greaterThan(0), outside, float(FAR)),
    clamp(core.mul(0.4), 0.03, 1),
  );
};

/**
 * The wing's upper surface at one point.
 * @param f The field
 * @param shape The wing's tables
 * @param p The point, z folded
 * @returns The deficit, the distance outside the layer it can fog in and the
 *   step
 */
export const wing_sheet = (f: VaporFieldNodes, shape: Texture, p: V3): V3 => {
  const span = p.z;
  const eta = span.div(f.semispan_m);

  // The station: leading edge, chord, mid-plane and thickness; and its loading
  const station = shape_row(shape, eta, 0);
  const loading = shape_row(shape, eta, 1).x;

  const leading = station.x;
  const chord = max(station.y, 0.05);
  const thickness = station.w;

  const xi = p.x.sub(leading).div(chord);
  const along = clamp(xi, 0, 1);

  const surface = station.z.add(
    thickness.mul(chord).mul(2).mul(along).mul(along.oneMinus()),
  );

  const height = p.y.sub(surface);

  const section = f.section_lift_m.mul(loading).div(chord);

  const lift_shape = (at: F): F =>
    mix(
      sqrt(at.oneMinus().div(at.add(NOSE_RADIUS))),
      at.oneMinus().mul(Math.PI),
      f.separation,
    );

  const normal = (at: F): F =>
    karman_tsien(
      section
        .div(-Math.PI)
        .mul(lift_shape(at))
        .sub(thickness.mul(1.3).mul(sin(at.mul(Math.PI))))
        .div(f.cos2_sweep),
      f.wing_beta,
      f.wing_kt,
    );

  const here = normal(along);
  const peak = normal(float(0.1));

  // The shock: where the subsonic suction comes back through sonic, pushed
  // aft as Mach one nears. Thin-airfoil theory inverted, as `shock_station`
  const target = f.wing_sonic
    .mul(f.wing_beta)
    .div(f.wing_kt.mul(f.wing_sonic).oneMinus())
    .mul(f.cos2_sweep);

  const q = target.mul(-Math.PI).div(max(section, 1e-6));
  const q2 = q.mul(q);

  const sonic_at = clamp(
    mix(
      q2.mul(-NOSE_RADIUS).add(1).div(q2.add(1)),
      q.div(-Math.PI).add(1),
      f.separation,
    ),
    0,
    1,
  );

  const shock = select(
    f.wing_supersonic.greaterThan(0.5).or(f.wing_sonic.greaterThanEqual(0)),
    float(1),
    sonic_at.add(sonic_at.oneMinus().mul(f.wing_travel)),
  );

  const ahead = smoothstep(
    shock.sub(SHOCK_WIDTH),
    shock.add(SHOCK_WIDTH),
    along,
  ).oneMinus();

  const pocket = mix(max(here, f.wing_sonic), min(here, peak), ahead);

  const coefficient = select(peak.lessThan(f.wing_sonic), pocket, here);

  const reach = f.wing_reach
    .mul(chord)
    .mul(min(along.add(NOSE_RADIUS).div(NOSE_REACH), 1));

  const root = f.root_span_m.div(f.semispan_m);

  const fade = smoothstep(root, root.add(ROOT_FADE), eta)
    .mul(smoothstep(0.9, 1, eta).oneMinus())
    .mul(smoothstep(-0.04, 0, xi))
    .mul(smoothstep(1, 1.06, xi).oneMinus());

  const deficit = select(
    height.lessThan(0).or(eta.greaterThanEqual(1)),
    float(0),
    capped(coefficient.mul(f.wing_scale).negate(), f.wing_cap)
      .mul(exp(height.negate().div(reach)))
      .mul(fade),
  );

  // The layer over the planform, as far up as it can fog
  const outside = max(
    max(
      max(height.negate(), height.sub(f.wing_bound_m)),
      max(xi.negate(), xi.sub(1.06)).mul(chord),
    ),
    max(f.root_span_m.sub(span), span.sub(f.semispan_m)),
  ).mul(BOUND_SAFETY);

  return vec3(
    deficit,
    select(f.wing_bound_m.greaterThan(0), outside, float(FAR)),
    clamp(reach.mul(0.25), 0.04, 1),
  );
};

/**
 * The slender body's field at one point: the vapour cone.
 * @param f The field
 * @param p The point
 * @returns The deficit, the distance outside the cylinder it can fog in and
 *   the step
 */
export const vapor_cone = (f: VaporFieldNodes, p: V3): V3 => {
  const xi = p.x.add(f.nose_m).div(f.body_length_m);
  const along = clamp(xi, 1e-3, 1 - 1e-3);

  const r = length(vec2(p.y.sub(f.body_height_m), p.z));

  const u = max(along.mul(along.oneMinus()).mul(4), 1e-3);
  const radius = f.body_radius_m.mul(pow(u, 0.75));

  const shock = f.cone_shock.add(r.mul(CONE_SHOCK_LEAN).div(f.body_length_m));
  const ahead = smoothstep(shock.sub(0.01), shock.add(0.01), xi).oneMinus();

  const pocket = smoothstep(shock.sub(CONE_POCKET_LENGTH), shock, xi);

  const reach = f.cone_reach_m.mul(pocket.mul(0.8).add(0.2));
  const lateral = log(reach.div(max(r, radius)).add(1)).div(
    log(reach.div(max(radius, 1e-3)).add(1)),
  );

  const coefficient = karman_tsien(
    f.cone_strength.mul(pocket).negate(),
    f.cone_beta,
    f.cone_kt,
  );

  const inside = xi.greaterThan(0).and(xi.lessThan(1));

  const deficit = select(
    inside,
    capped(coefficient.mul(f.cone_scale).negate(), f.cone_cap)
      .mul(lateral)
      .mul(lateral)
      .mul(ahead)
      .mul(f.cone_fade),
    float(0),
  );

  const shock_x = shock.add(0.02).mul(f.body_length_m).sub(f.nose_m);

  const outside = max(
    r.sub(f.cone_bound_m),
    max(f.nose_m.negate().sub(p.x), p.x.sub(shock_x)),
  ).mul(BOUND_SAFETY);

  return vec3(
    deficit,
    select(f.cone_bound_m.greaterThan(0), outside, float(FAR)),
    clamp(f.cone_bound_m.div(14), 0.1, 1.5),
  );
};

/**
 * The whole field at one point.
 * @param f The field
 * @param shape The wing's tables, as `create_shape_texture` makes them
 * @param point The point, z not folded
 * @param effects Which parts are compiled in
 * @returns The deficit, how far the point is from anything that can fog, and
 *   the step to take there if it is inside something
 */
export const vapor_field = (
  f: VaporFieldNodes,
  shape: Texture,
  point: V3,
  effects: VaporEffects,
): V3 => {
  const folded = vec3(point.x, point.y, abs(point.z));

  const parts: V3[] = [];

  if (effects.tip_vortices) {
    parts.push(tip_vortex(f, folded));
  }

  if (effects.leading_edge_vortices) {
    parts.push(edge_vortex(f, shape, folded));
  }

  if (effects.wing) {
    parts.push(wing_sheet(f, shape, folded));
  }

  if (effects.cone) {
    parts.push(vapor_cone(f, point));
  }

  if (parts.length === 0) {
    return vec3(0, FAR, 1);
  }

  let deficit: F = parts[0].x;
  let outside: F = parts[0].y;
  let step: F = select(parts[0].y.lessThanEqual(0), parts[0].z, float(FAR));

  for (const part of parts.slice(1)) {
    deficit = deficit.add(part.x);
    outside = min(outside, part.y);
    step = min(step, select(part.y.lessThanEqual(0), part.z, float(FAR)));
  }

  return vec3(deficit, outside, step);
};
