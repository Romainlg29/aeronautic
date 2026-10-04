import {
  If,
  abs,
  clamp,
  exp,
  float,
  floor,
  int,
  ivec2,
  length,
  log,
  max,
  min,
  mix,
  pow,
  select,
  sign,
  sin,
  smoothstep,
  sqrt,
  texture,
  textureLoad,
  vec2,
  vec3,
} from "three/tsl";
import type { Texture } from "three";
import type { Node } from "three/webgpu";
import { TRAIL_POINTS } from "../trails";
import { SHAPE_STATIONS } from "../wing-shape";
import {
  BOUND_FLOOR,
  BURST_LENGTH,
  BURST_SWELL,
  CONE_POCKET_LENGTH,
  CONE_SHOCK_LEAN,
  CONE_SHOCK_THICKNESS,
  NOSE_RADIUS,
  NOSE_REACH,
  ROOT_BLUR,
  ROOT_FADE,
  SHOCK_WIDTH,
  TIP_START_SHARE,
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

// What one station's loading is held within, in a roll or a sideslip, as on
// the CPU
const SIDE_LOADING: [number, number] = [0.2, 1.8];

// And for the tips' trails, which bend. Each step onto the tangent cuts the
// error to its square over the bend's radius, hundreds of metres even in a
// hard pull: within the few tube widths a step is held to, two leave the
// nearest point centimetres out
const TRAIL_SAFETY = 0.85;

/**
 * One part of the field at one point: its deficit, how far the point is
 * outside where it can fog, and how fine a step it needs there. Apart, so a
 * march in clear air works out the distance alone.
 */
type Part = { deficit: F; outside: F; step: F };

/**
 * A part as one vector, as the exported parts give it.
 * @param part The part
 * @returns The deficit, the distance and the step
 */
const joined = (part: Part): V3 => vec3(part.deficit, part.outside, part.step);

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
  f.vortexK
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
 * A point along one trail, between its points.
 * @param trails The trails' texture, a row each
 * @param row Which trail
 * @param along How far along it, metres
 * @param spacing How far apart its points are
 * @returns The point
 */
const trail_at = (trails: Texture, row: number, along: F, spacing: F): V3 => {
  const position = clamp(along.div(max(spacing, 1e-6)), 0, TRAIL_POINTS - 1);
  const index = min(floor(position), TRAIL_POINTS - 2);
  const t = position.sub(index);

  const a = textureLoad(trails, ivec2(int(index), int(row))).xyz;
  const b = textureLoad(trails, ivec2(int(index).add(1), int(row))).xyz;

  return mix(a, b, t) as unknown as V3;
};

/**
 * A point along one trail and the point a spacing further on, as two
 * `trail_at`s would give them, from three texels rather than four: the two
 * share the middle one.
 * @param trails The trails' texture, a row each
 * @param row Which trail
 * @param along How far along it, metres, within its length
 * @param spacing How far apart its points are
 * @returns The point, and the one a spacing on, held at the trail's end
 */
const trail_span = (
  trails: Texture,
  row: number,
  along: F,
  spacing: F,
): [V3, V3] => {
  const position = clamp(along.div(max(spacing, 1e-6)), 0, TRAIL_POINTS - 1);
  const index = min(floor(position), TRAIL_POINTS - 2);
  const t = position.sub(index);

  // On the last segment the next point is the trail's end: the third texel
  // is the second again, and mixing it with itself gives it
  const a = textureLoad(trails, ivec2(int(index), int(row))).xyz;
  const b = textureLoad(trails, ivec2(int(index).add(1), int(row))).xyz;
  const c = textureLoad(
    trails,
    ivec2(int(min(index.add(2), TRAIL_POINTS - 1)), int(row)),
  ).xyz;

  return [mix(a, b, t) as unknown as V3, mix(b, c, t) as unknown as V3];
};

/**
 * How much more than the symmetric loading a station carries, in a roll or
 * a sideslip, as `side_loading` works it out.
 * @param f The field
 * @param span How far out, signed
 * @returns A multiplier on the loading
 */
const side_loading = (f: VaporFieldNodes, span: F): F =>
  clamp(
    f.rollBias
      .mul(span)
      .div(max(f.semispanM, 1e-3))
      .add(f.slipBias.mul(sign(span)))
      .add(1),
    SIDE_LOADING[0],
    SIDE_LOADING[1],
  );

/**
 * One lifting surface's tips, as nodes.
 */
type TipNodes = {
  leading: F;
  chord: F;
  height: F;
  semispan: F;
  circulation: F;
  core2: F;
  start2: F;
  rollup: F;
  growth: F;
  reach: F;
  bound: F;
  spacing: F;

  /** Its first row in the trails' texture: +z there, -z the next */
  row: number;
};

/**
 * The wing's tips, or a canard's or a tailplane's, from the uniforms.
 * @param f The field
 * @param which Which surface
 * @returns Its tips
 */
const tip_nodes = (f: VaporFieldNodes, which: "wing" | "second"): TipNodes =>
  which === "wing"
    ? {
        leading: f.tipLeadingM,
        chord: f.tipChordM,
        height: f.tipHeightM,
        semispan: f.semispanM,
        circulation: f.tipCirculation,
        core2: f.tipCore2M2,
        start2: f.tipStart2M2,
        rollup: f.tipRollupM,
        growth: f.tipGrowthM,
        reach: f.tipReachM,
        bound: f.tipBoundM,
        spacing: f.trailSpacingM,
        row: 0,
      }
    : {
        leading: f.secondTipLeadingM,
        chord: f.secondTipChordM,
        height: f.secondTipHeightM,
        semispan: f.secondSemispanM,
        circulation: f.secondCirculation,
        core2: f.secondCore2M2,
        start2: f.secondStart2M2,
        rollup: f.secondRollupM,
        growth: f.secondGrowthM,
        reach: f.secondReachM,
        bound: f.secondBoundM,
        spacing: f.secondSpacingM,
        row: 2,
      };

/**
 * One tip vortex at one point: its deficit, how far the point is outside the
 * tube it can fog in, and how fine a step it needs there.
 * @param f The field
 * @param trails The trails' texture
 * @param tip The surface whose tip it is
 * @param p The point, not folded
 * @param side +1 or -1, which tip
 * @returns The deficit, the distance and the step
 */
const tip_side = (
  f: VaporFieldNodes,
  trails: Texture,
  tip: TipNodes,
  p: V3,
  side: 1 | -1,
): V3 => {
  const row = tip.row + (side > 0 ? 0 : 1);

  const tip_le = tip.leading;
  const tip_te = tip_le.add(tip.chord);
  const tip_y = tip.height;
  const length_m = tip.spacing.mul(TRAIL_POINTS - 1);

  // Onto the straight trail, then twice onto the trail's own tangent, as
  // `nearest_along` does
  // From the trail's start, the tip's trailing edge, along the stream: the
  // first point itself, one texel
  const start = textureLoad(trails, ivec2(int(0), int(row))).xyz;
  const along = p
    .sub(start)
    .dot(vec3(f.cosAlpha, f.sinAlpha, f.flowZ))
    .toVar();

  const ahead = along.lessThan(0);

  // Ahead of the trailing edge the vortex is forming along the tip chord
  const axis = vec3(
    clamp(p.x, tip_le, tip_te),
    tip_y,
    tip.semispan.mul(side),
  ).toVar() as unknown as V3;

  // Behind it, along the trail: its lookups are the dearest part of the
  // field, and a point ahead, over the wing, has no need of them
  If(ahead.not(), () => {
    for (let step = 0; step < 2; step++) {
      const here = clamp(along, 0, length_m);
      const [at, next] = trail_span(trails, row, here, tip.spacing);
      const tangent = next.sub(at).normalize();

      along.assign(max(here.add(p.sub(at).dot(tangent)), 0));
    }

    axis.assign(trail_at(trails, row, along, tip.spacing));
  });

  const trailed = max(along, 0);

  const offset = p.sub(axis);
  const radius2 = offset.dot(offset);

  // Rolling up behind it: from a share of the circulation round a thin core
  // to all of it round the rolled-up one, as `side_deficit` does
  const rolled = float(1).sub(exp(trailed.negate().div(max(tip.rollup, 1e-3))));

  const formed = select(
    ahead,
    clamp(p.x.sub(tip_le).div(tip.chord), 0, 1).mul(TIP_START_SHARE),
    rolled.mul(1 - TIP_START_SHARE).add(TIP_START_SHARE),
  );

  const core2 = tip.start2
    .add(tip.core2.sub(tip.start2).mul(rolled))
    .add(tip.growth.mul(trailed));

  const circulation = tip.circulation
    .mul(formed)
    .mul(side_loading(f, tip.semispan.mul(side)));
  const deficit = vortex_deficit(f, circulation, radius2, core2);

  // How wide the tube is here, by the bounds' own rule: where this vortex
  // alone falls to what condenses, Γ²k/(r² + a²) = needed. The bound is the
  // widest anywhere, at the tip; down the trail the core has grown and the
  // tube thins, or closes, and the march need not step finely through the
  // clear air the widest one would hold. It changes slowly along the trail,
  // a fraction of a metre per metre, well inside the trust below
  const needed = max(f.saturationDeficit, BOUND_FLOOR);
  const wide2 = f.vortexK
    .mul(circulation)
    .mul(circulation)
    .div(needed)
    .sub(core2);
  const wide = min(sqrt(max(wide2, 0)).mul(1.15).add(0.1), tip.bound);

  // A curved trail's nearest point is found in two steps, which can land a
  // little past it, and the tube widens along it as the vortex rolls up: the
  // distance is not trusted in full, and never for more than a few tube
  // widths at once, where a point well off the curve would be
  const outside = min(
    sqrt(radius2)
      .sub(wide)
      .add(max(along.sub(tip.reach), 0))
      .mul(TRAIL_SAFETY),
    tip.bound.mul(4).add(1),
  );

  return vec3(
    deficit,
    select(tip.bound.greaterThan(0), outside, float(FAR)),
    clamp(sqrt(core2).mul(0.4), 0.03, 1.5),
  );
};

/**
 * Every tip vortex at one point, each along its own trail: the wing's, and a
 * canard's or a tailplane's.
 * @param f The field
 * @param trails The trails' texture
 * @param p The point, not folded
 * @returns The deficit, the distance outside the nearest tube and the step
 */
export const tip_vortex = (f: VaporFieldNodes, trails: Texture, p: V3): V3 => {
  const deficit = float(0).toVar();
  const outside = float(FAR).toVar();
  const step = float(FAR).toVar();

  const add = (which: "wing" | "second") => {
    const tip = tip_nodes(f, which);

    // Only tips that fog pay for their trails: the same for every pixel, so
    // the branch costs nothing
    If(tip.bound.greaterThan(0), () => {
      for (const side of [1, -1] as const) {
        const part = tip_side(f, trails, tip, p, side).toVar();

        deficit.addAssign(part.x);
        step.assign(select(part.y.lessThan(outside), part.z, step));
        outside.assign(min(outside, part.y));
      }
    });
  };

  add("wing");
  add("second");

  return vec3(deficit, outside, step);
};

/**
 * A leading-edge vortex at one point.
 * @param f The field
 * @param shape The wing's tables
 * @param p The point, z folded
 * @param side Which wing, +1 or -1: the point is folded
 * @returns Its part of the field
 */
const edge_part = (
  f: VaporFieldNodes,
  shape: Texture,
  p: V3,
  side: F,
): Part => {
  const along = p.x.sub(f.edgeApexM);
  const length_m = max(f.edgeLengthM, 1e-3);

  const on_wing = clamp(along, 0, f.edgeLengthM);
  const past = max(along.sub(f.edgeLengthM), 0);

  // Where along the edge's own path: its core, the surface under it, and how
  // far out the edge is there
  const path = shape_row(shape, on_wing.div(length_m), 2);
  const vz = path.x;
  const reach = path.z;

  const vy = path.y
    .add(f.edgeHeight.mul(reach))
    .add(past.mul(f.sinAlpha.div(max(f.cosAlpha, 0.1))));

  const across = vec2(p.y.sub(vy), p.z.sub(vz));
  const radius2 = across.dot(across);

  const burst = smoothstep(
    f.edgeBurstM,
    f.edgeBurstM.add(length_m.mul(BURST_LENGTH)),
    along,
  );

  const core = max(f.edgeCore.mul(reach), 0.02).mul(
    burst.mul(BURST_SWELL).add(1),
  );

  const leaving = exp(past.negate().div(length_m.mul(0.3)));

  const deficit = select(
    along.greaterThan(0),
    vortex_deficit(
      f,
      f.edgeGradient
        .mul(side_loading(f, vz.mul(side)))
        .mul(on_wing)
        .mul(burst.mul(-0.3).add(1))
        .mul(leaving),
      radius2,
      core.mul(core),
    ),
    float(0),
  );

  const outside = sqrt(radius2)
    .sub(f.edgeBoundM)
    .add(max(along.negate(), 0))
    .add(max(past.sub(length_m.mul(0.6)), 0))
    .mul(BOUND_SAFETY);

  return {
    deficit,
    outside: select(f.edgeBoundM.greaterThan(0), outside, float(FAR)),
    step: clamp(core.mul(0.4), 0.03, 1),
  };
};

/**
 * A leading-edge vortex at one point.
 * @param f The field
 * @param shape The wing's tables
 * @param p The point, z folded
 * @param side Which wing, +1 or -1: the point is folded
 * @returns The deficit, the distance outside its tube and the step
 */
export const edge_vortex = (
  f: VaporFieldNodes,
  shape: Texture,
  p: V3,
  side: F = float(1),
): V3 => joined(edge_part(f, shape, p, side));

/**
 * The wing's upper surface at one point.
 * @param f The field
 * @param shape The wing's tables
 * @param p The point, z folded
 * @param side Which wing, +1 or -1: the point is folded
 * @returns Its part of the field
 */
const wing_part = (
  f: VaporFieldNodes,
  shape: Texture,
  p: V3,
  side: F,
): Part => {
  const span = p.z;
  const eta = span.div(f.semispanM);

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

  const section = f.sectionLiftM
    .mul(loading)
    .mul(side_loading(f, span.mul(side)))
    .div(chord);

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
        .div(f.cos2Sweep),
      f.wingBeta,
      f.wingKt,
    );

  const here = normal(along);
  const peak = normal(float(0.1));

  // The shock: where the subsonic suction comes back through sonic, pushed
  // aft as Mach one nears. Thin-airfoil theory inverted, as `shock_station`
  const target = f.wingSonic
    .mul(f.wingBeta)
    .div(f.wingKt.mul(f.wingSonic).oneMinus())
    .mul(f.cos2Sweep);

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
    f.wingSupersonic.greaterThan(0.5).or(f.wingSonic.greaterThanEqual(0)),
    float(1),
    sonic_at.add(sonic_at.oneMinus().mul(f.wingTravel)),
  );

  // Behind it the droplets last a few milliseconds before they have
  // evaporated, a short tail on the hard edge
  const ahead = max(
    smoothstep(
      shock.sub(SHOCK_WIDTH),
      shock.add(SHOCK_WIDTH),
      along,
    ).oneMinus(),
    exp(
      max(along.sub(shock), 0)
        .mul(chord)
        .negate()
        .div(max(f.evaporationM, 1e-3)),
    ),
  );

  const pocket = mix(max(here, f.wingSonic), min(here, peak), ahead);

  const coefficient = select(peak.lessThan(f.wingSonic), pocket, here);

  const reach = f.wingReach
    .mul(min(chord, f.reachChordM))
    .mul(min(along.add(NOSE_RADIUS).div(NOSE_REACH), 1));

  const root = f.rootSpanM.div(f.semispanM);

  const blur = height.mul(ROOT_BLUR).div(f.semispanM);

  const fade = smoothstep(root.sub(blur), root.add(ROOT_FADE).add(blur), eta)
    .mul(smoothstep(0.9, 1, eta).oneMinus())
    .mul(smoothstep(-0.04, 0, xi))
    .mul(smoothstep(1, 1.06, xi).oneMinus());

  // What it would be at the surface, and so how high up it still fogs: it
  // falls off as exp(-height / reach)
  const at_surface = capped(
    coefficient.mul(f.wingScale).negate(),
    f.wingCap,
  ).mul(fade);
  const top = reach.mul(
    log(max(at_surface, 1e-6).div(max(f.saturationDeficit, 1e-6))),
  );

  const deficit = select(
    height.lessThan(0).or(eta.greaterThanEqual(1)),
    float(0),
    at_surface.mul(exp(height.negate().div(reach))),
  );

  // The layer over the planform, as far up as it can fog
  const outside = max(
    max(
      max(height.negate(), height.sub(f.wingBoundM)),
      max(xi.negate(), xi.sub(1.06)).mul(chord),
    ),
    max(f.rootSpanM.sub(span), span.sub(f.semispanM)),
  ).mul(BOUND_SAFETY);

  return {
    deficit,
    outside: select(f.wingBoundM.greaterThan(0), outside, float(FAR)),
    // Fine in the sheet, to resolve it, and coarser the further above where
    // it still fogs: in the clear air over the body, or over a lightly loaded
    // station, the sheet's own steps would refine the march through whatever
    // else is there, and the change in step would show as an edge
    step: clamp(max(reach.mul(0.25), height.sub(top).mul(0.5)), 0.04, 1),
  };
};

/**
 * The wing's upper surface at one point.
 * @param f The field
 * @param shape The wing's tables
 * @param p The point, z folded
 * @param side Which wing, +1 or -1: the point is folded
 * @returns The deficit, the distance outside the layer it can fog in and the
 *   step
 */
export const wing_sheet = (
  f: VaporFieldNodes,
  shape: Texture,
  p: V3,
  side: F = float(1),
): V3 => joined(wing_part(f, shape, p, side));

/**
 * The slender body's field at one point: the vapour cone.
 * @param f The field
 * @param p The point
 * @returns Its part of the field
 */
const cone_part = (f: VaporFieldNodes, p: V3): Part => {
  const xi = p.x.add(f.noseM).div(f.bodyLengthM);
  const along = clamp(xi, 1e-3, 1 - 1e-3);

  const r = length(vec2(p.y.sub(f.bodyHeightM), p.z));

  const u = max(along.mul(along.oneMinus()).mul(4), 1e-3);
  const radius = f.bodyRadiusM.mul(pow(u, 0.75));

  const shock = f.coneShock.add(r.mul(CONE_SHOCK_LEAN).div(f.bodyLengthM));
  const ahead = max(
    smoothstep(
      shock.sub(CONE_SHOCK_THICKNESS),
      shock.add(f.coneShockWidth),
      xi,
    ).oneMinus(),
    exp(
      max(xi.sub(shock), 0)
        .mul(f.bodyLengthM)
        .negate()
        .div(max(f.evaporationM, 1e-3)),
    ),
  );

  const pocket = smoothstep(shock.sub(CONE_POCKET_LENGTH), shock, xi);

  const reach = f.coneReachM.mul(pocket.mul(0.8).add(0.2));
  const lateral = log(reach.div(max(r, radius)).add(1)).div(
    log(reach.div(max(radius, 1e-3)).add(1)),
  );

  const coefficient = karman_tsien(
    f.coneStrength.mul(pocket).negate(),
    f.coneBeta,
    f.coneKt,
  );

  const inside = xi.greaterThan(0).and(xi.lessThan(1));

  const deficit = select(
    inside,
    capped(coefficient.mul(f.coneScale).negate(), f.coneCap)
      .mul(lateral)
      .mul(lateral)
      .mul(ahead)
      .mul(f.coneFade),
    float(0),
  );

  const shock_x = shock
    .add(f.coneShockWidth)
    .add(0.02)
    .mul(f.bodyLengthM)
    .sub(f.noseM);

  const outside = max(
    r.sub(f.coneBoundM),
    max(f.noseM.negate().sub(p.x), p.x.sub(shock_x)),
  ).mul(BOUND_SAFETY);

  return {
    deficit,
    outside: select(f.coneBoundM.greaterThan(0), outside, float(FAR)),
    step: clamp(f.coneBoundM.div(14), 0.1, 1.5),
  };
};

/**
 * The slender body's field at one point: the vapour cone.
 * @param f The field
 * @param p The point
 * @returns The deficit, the distance outside the cylinder it can fog in and
 *   the step
 */
export const vapor_cone = (f: VaporFieldNodes, p: V3): V3 =>
  joined(cone_part(f, p));

/**
 * The whole field at one point, apart: a march in clear air needs the
 * distance alone, and need not work out the rest.
 * @param f The field
 * @param shape The wing's tables, as `create_shape_texture` makes them
 * @param trails The tip vortices' trails, as `create_trail_texture` makes them
 * @param point The point, z not folded
 * @param effects Which parts are compiled in
 * @returns The deficit; how far the point is from anything that can fog; the
 *   step to take there if it is inside something; and how far it is from
 *   anything but the tips that can fog
 */
export const vapor_field_parts = (
  f: VaporFieldNodes,
  shape: Texture,
  trails: Texture,
  point: V3,
  effects: Pick<
    VaporEffects,
    "tipVortices" | "leadingEdgeVortices" | "wing" | "cone"
  >,
): Part & { untipped: F } => {
  const folded = vec3(point.x, point.y, abs(point.z));

  // Which wing: the field is folded, but a roll or a sideslip loads one more
  const side = select(point.z.lessThan(0), float(-1), float(1));

  const tips: Part[] = [];
  const rest: Part[] = [];

  if (effects.tipVortices) {
    const tip = tip_vortex(f, trails, point);

    tips.push({ deficit: tip.x, outside: tip.y, step: tip.z });
  }

  if (effects.leadingEdgeVortices) {
    rest.push(edge_part(f, shape, folded, side));
  }

  if (effects.wing) {
    rest.push(wing_part(f, shape, folded, side));
  }

  if (effects.cone) {
    rest.push(cone_part(f, point));
  }

  const parts = [...tips, ...rest];

  const nearest = (from: Part[]) =>
    from.reduce<F>((closest, part) => min(closest, part.outside), float(FAR));

  return {
    deficit: parts.reduce<F>((sum, part) => sum.add(part.deficit), float(0)),
    outside: nearest(parts),
    step: parts.reduce<F>(
      (finest, part) =>
        min(
          finest,
          select(part.outside.lessThanEqual(0), part.step, float(FAR)),
        ),
      float(FAR),
    ),
    untipped: nearest(rest),
  };
};

/**
 * The whole field at one point.
 * @param f The field
 * @param shape The wing's tables, as `create_shape_texture` makes them
 * @param trails The tip vortices' trails, as `create_trail_texture` makes them
 * @param point The point, z not folded
 * @param effects Which parts are compiled in
 * @returns The deficit, how far the point is from anything that can fog, and
 *   the step to take there if it is inside something
 */
export const vapor_field = (
  f: VaporFieldNodes,
  shape: Texture,
  trails: Texture,
  point: V3,
  effects: Pick<
    VaporEffects,
    "tipVortices" | "leadingEdgeVortices" | "wing" | "cone"
  >,
): V3 => joined(vapor_field_parts(f, shape, trails, point, effects));
