import {
  BackSide,
  CustomBlending,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
  type TextureNode,
  type UniformNode,
} from "three/webgpu";
import {
  Break,
  Continue,
  Discard,
  Fn,
  If,
  Loop,
  abs,
  attribute,
  ceil,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  clamp,
  cos,
  cross,
  dot,
  exp,
  float,
  floor,
  fract,
  highpModelViewMatrix,
  int,
  length,
  logarithmicDepthToViewZ,
  max,
  min,
  mix,
  perspectiveDepthToViewZ,
  positionGeometry,
  screenSize,
  screenCoordinate,
  screenUV,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  transpose,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
  viewportDepthTexture,
  viewportSharedTexture,
} from "three/tsl";
import { atmosphere } from "./atmosphere";
import { blackbody } from "./tsl/blackbody";
import { hash_cell } from "./tsl/noise";
import {
  PLUME_EPSILON,
  plume_bound,
  plume_closest,
  plume_field,
  plume_frame,
  plume_half_width,
  plume_jet,
  plume_span,
  plume_station,
  type PlumeContext,
  type PlumeEngineNodes,
  type PlumeFieldHooks,
  type PlumeJetNodes,
  type PlumeAirNodes,
  type PlumeOutlineRadius,
  type PlumeProfileNodes,
} from "./tsl/plume";
import {
  default_afterburner_profile,
  default_afterburner_quality,
  type AfterburnerProfile,
} from "./types";

// The plumes, drawn as proxy hulls in one instanced draw call
//
// Every plume is one instance of a hull, so a pixel only runs the maths for the
// plumes whose hull covers it, and everything camera-dependent comes from the
// camera three is actually drawing with. Inside the hull the fragment marches
// the ray through the plume and solves the radiative transfer along it: what
// the hot gas and its soot emit, less what the soot in front absorbs, and how
// much of what is behind still gets through
//
// That last part is why the blend is premultiplied rather than additive. A
// sooty plume hides what is behind it, and a clean one lets it through; the
// colour of both comes out of Planck's law at the local temperature

type V2 = Node<"vec2">;
type F = Node<"float">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

// The largest displacement the haze may make, in screen heights
// Past about this it stops reading as heat and starts reading as the aircraft
// coming apart, so it is clamped rather than trusted
const HAZE_LIMIT = 0.006;

// Once every primary is down to this, nothing behind can show through
const OPAQUE_TRANSMITTANCE = 0.01;

// The equivalent depth of a Gaussian profile, in half-widths: what one sample
// through its middle stands in for, ∫ 2^-(r/r½)² dr over r½
const GAUSSIAN_DEPTH = 2.13;

// How much of the screen a near plume may cover, in screen heights squared,
// before its steps are shared out over the area. A frame filled by one plume
// marches about as many samples as one this big
const PLUME_STEP_AREA = 0.3;

// Samples per shock cell along the axis, inside the train: enough that a cell
// is never stepped over, whatever the step budget the view leaves
const SAMPLES_PER_CELL = 5;

// And across the core, for the lozenge's taper
const SAMPLES_ACROSS_CORE = 4;

// The most the train may add, in near budgets. Only rays near the axis come
// close, and a ray down it crosses every cell, so it is given room for them
const FINE_STEP_CAP = 2;

// How far past the first disk the train is marched finely, in shock lengths:
// its swing has fallen to a twentieth by then
const SHOCK_TRAIN_LENGTHS = 3;

// Rec. 709 luminance, for the one alpha a colour transmittance is blended with
const LUMINANCE: [number, number, number] = [0.2126, 0.7152, 0.0722];

// How far up the jet pipe the last turbine stage stands, in nozzle radii
// A fighter's pipe is long, the burner's duct being most of it, so the
// turbine only shows to a camera nearly astern
const TURBINE_DEPTH = 3;

// How brightly the pipe's wall glows, against the turbine at its end
const PIPE_GLOW = 0.3;

/**
 * The names of the per instance attributes the material reads.
 * The batch writes these; a custom geometry can too.
 */
export const AFTERBURNER_ATTRIBUTES = {
  // xyz: the nozzle exit, from the mesh's own origin, w: the throttle
  place: "afterburner_place",

  // The nozzle's frame into the mesh's, the plume running along +X
  rotation: "afterburner_rotation",

  // nozzle radius in metres, exit Mach, pressure ratio, seed
  shape: "afterburner_shape",

  // exit temperature, dry temperature, gamma, molar mass
  thermo: "afterburner_thermo",

  // soot per metre, soot survival, particles per metre, particle albedo
  optics: "afterburner_optics",

  // rgb: the band emission's colour, a: its strength
  band: "afterburner_band",

  // turbulence, meander, refraction in metres, afterburning in kelvin
  motion: "afterburner_motion",

  // The exit's outline: aspect, squareness, roll in radians, and how long it
  // lasts in potential core lengths
  outline: "afterburner_outline",

  // What `nozzle_outline_fit` makes of it: its area scale and its reach
  outline_fit: "afterburner_outline_fit",
} as const;

/**
 * What one pixel of the plume knows, handed to the `radiance` hook.
 */
export type AfterburnerPixel = {
  context: PlumeContext;

  // The ray, in the nozzle's frame, and where it enters and leaves the plume
  origin: V3;
  direction: V3;
  span: Node<"vec2">;

  // 0 near, 1 mid, 2 far
  lod: F;

  // What the march found: the radiance the plume adds, exposed, and how much of
  // what is behind it still shows through, per primary
  transmittance: V3;
};

/**
 * Ways to change the plume without rewriting it.
 *
 * Every hook is TSL and is called once, when the material is built, so a hook
 * costs exactly what the nodes it returns cost. Changing the hooks builds a new
 * material; keep the object stable.
 */
export type AfterburnerHooks = PlumeFieldHooks & {
  /** What the pixel adds to the scene, in linear radiance, after exposure */
  radiance?: (rgb: V3, pixel: AfterburnerPixel) => V3;

  /**
   * Any nozzle outline, in place of the superellipse the params describe.
   * Every plume in the batch takes it, each turned by its own `nozzle_roll`
   * and relaxing to round over its own `nozzle_outline_length`.
   */
  outline?: AfterburnerOutline;
};

/**
 * A nozzle exit's outline, as a radius in every direction across the plume.
 */
export type AfterburnerOutline = {
  /**
   * How far out the outline is in one direction, in nozzle radii.
   * Keep its area near a unit circle's, π, and the jet's flow is unchanged.
   */
  radius: PlumeOutlineRadius;

  /**
   * The most `radius` ever returns. The bounds around the plume are widened
   * by it, so anything past it is cut off, and much more than it costs steps.
   */
  reach: number;
};

/**
 * What is compiled into one afterburner material.
 */
export type AfterburnerMaterialOptions = {
  // The air and the camera to start with, changeable later through uniforms
  profile?: AfterburnerProfile;

  // Octaves of eddy noise, 1 to 3
  octaves?: number;

  // Whether to bend what is behind the plume at all
  // Off is one fewer copy of the frame and a little less per pixel
  haze?: boolean;

  hooks?: AfterburnerHooks;

  // Uniforms to share with another material, so variants stay in step
  uniforms?: AfterburnerUniforms;

  // The opaque scene, drawn in a pass of its own, for a plume drawn in
  // another: at a lower resolution, say. Left out, the plume reads the frame
  // it is drawn into
  backdrop?: AfterburnerBackdrop;
};

/**
 * The opaque scene behind the plumes, as a separate pass leaves it.
 */
export type AfterburnerBackdrop = {
  // Its colour, for the haze to bend
  color: TextureNode;

  // Its depth, for the flame to stop at
  depth: TextureNode;
};

/**
 * The uniforms an afterburner material is driven by.
 */
export type AfterburnerUniforms = {
  profile: { [K in keyof AfterburnerProfile]: UniformNode<"float", number> };

  // The air the profile works out to, written with it
  air: { [K in keyof PlumeAirNodes]: UniformNode<"float", number> };

  // Seconds, the plume's own clock
  time: UniformNode<"float", number>;

  // Most march iterations near, and once the eddies are dropped
  near_steps: UniformNode<"int", number>;
  mid_steps: UniformNode<"int", number>;

  // Length over distance below which a plume is not drawn
  min_screen_span: UniformNode<"float", number>;

  // Metres one screen height covers at one metre out
  screen_scale: UniformNode<"float", number>;

  detail_distance: UniformNode<"float", number>;
  cheap_distance: UniformNode<"float", number>;
};

/**
 * An afterburner material and the handles to drive it.
 */
export type AfterburnerMaterial = {
  material: MeshBasicNodeMaterial;
  uniforms: AfterburnerUniforms;

  /** Write a profile into the uniforms. Live, no rebuild. */
  set_profile: (profile: AfterburnerProfile) => void;
};

/**
 * Make the uniforms an afterburner material is driven by.
 * @param profile The air and the camera to start with
 * @returns Fresh uniforms
 */
export const create_afterburner_uniforms = (
  profile: AfterburnerProfile = default_afterburner_profile(),
): AfterburnerUniforms => {
  const quality = default_afterburner_quality();

  const shape = {} as AfterburnerUniforms["profile"];

  for (const key of Object.keys(profile) as (keyof AfterburnerProfile)[]) {
    shape[key] = uniform(profile[key]).setName(
      `afterburner_${key}`,
    ) as UniformNode<"float", number>;
  }

  const air = {} as AfterburnerUniforms["air"];

  for (const key of AIR_KEYS) {
    air[key] = uniform(1).setName(`afterburner_air_${key}`) as UniformNode<
      "float",
      number
    >;
  }

  const uniforms: AfterburnerUniforms = {
    profile: shape,
    air,
    time: uniform(0).setName("afterburner_time") as UniformNode<
      "float",
      number
    >,
    near_steps: uniform(quality.near_steps, "int") as UniformNode<
      "int",
      number
    >,
    mid_steps: uniform(quality.mid_steps, "int") as UniformNode<"int", number>,
    min_screen_span: uniform(0) as UniformNode<"float", number>,
    screen_scale: uniform(1) as UniformNode<"float", number>,
    detail_distance: uniform(900) as UniformNode<"float", number>,
    cheap_distance: uniform(3000) as UniformNode<"float", number>,
  };

  write_afterburner_profile(uniforms, profile);

  return uniforms;
};

/**
 * Write a profile into a material's uniforms. Live, nothing rebuilds.
 * @param uniforms The uniforms
 * @param profile The air and the camera
 */
export const write_afterburner_profile = (
  uniforms: AfterburnerUniforms,
  profile: AfterburnerProfile,
) => {
  for (const key of Object.keys(
    uniforms.profile,
  ) as (keyof AfterburnerProfile)[]) {
    uniforms.profile[key].value = profile[key];
  }

  const air = atmosphere(profile);

  uniforms.air.temperature_k.value = air.temperature_k;
  uniforms.air.pressure.value = air.pressure;
  uniforms.air.density.value = air.density;
  uniforms.air.sound.value = air.sound_m_s;
  uniforms.air.ram.value = air.ram;
};

const AIR_KEYS: (keyof PlumeAirNodes)[] = [
  "temperature_k",
  "pressure",
  "density",
  "sound",
  "ram",
];

/**
 * Rotate a vector by a unit quaternion.
 * @param q The quaternion
 * @param v The vector
 * @returns The vector, rotated
 */
const rotate = (q: V4, v: V3): V3 => {
  const axis = q.xyz;

  return v.add(cross(axis, cross(axis, v).add(v.mul(q.w))).mul(2));
};

/**
 * How far in front of the camera the opaque scene sits, in view space.
 * Negative, as view space depth is; reads the sky as the far plane.
 * @param backdrop The scene drawn in a pass of its own, if it was
 * @returns The view space depth
 */
const scene_view_z = (backdrop: AfterburnerBackdrop | undefined): F =>
  (
    Fn((builder: { renderer: { logarithmicDepthBuffer: boolean } }) => {
      const depth = backdrop
        ? (backdrop.depth.sample(screenUV).x as unknown as F)
        : viewportDepthTexture().x;

      return builder.renderer.logarithmicDepthBuffer
        ? logarithmicDepthToViewZ(depth, cameraNear, cameraFar)
        : perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    }) as unknown as () => F
  )();

/**
 * Build the material every plume in one batch is drawn with.
 * @param options What is compiled in
 * @returns The material, and its uniforms
 */
export const create_afterburner_material = (
  options: AfterburnerMaterialOptions = {},
): AfterburnerMaterial => {
  const {
    profile: initial = default_afterburner_profile(),
    octaves = default_afterburner_quality().turbulence_octaves,
    haze = true,
    hooks,
    backdrop,
  } = options;

  const uniforms = options.uniforms ?? create_afterburner_uniforms(initial);

  const set_profile = (profile: AfterburnerProfile) =>
    write_afterburner_profile(uniforms, profile);

  if (options.uniforms === undefined) {
    set_profile(initial);
  }

  const p = {
    ...uniforms.profile,
    air: uniforms.air,
  } as unknown as PlumeProfileNodes;
  const time = uniforms.time as unknown as F;

  // The instance, straight off the geometry
  const a = AFTERBURNER_ATTRIBUTES;

  const place = attribute(a.place, "vec4") as unknown as V4;
  const rotation = attribute(a.rotation, "vec4") as unknown as V4;
  const shape = attribute(a.shape, "vec4") as unknown as V4;
  const thermo = attribute(a.thermo, "vec4") as unknown as V4;
  const optics = attribute(a.optics, "vec4") as unknown as V4;
  const band = attribute(a.band, "vec4") as unknown as V4;
  const motion = attribute(a.motion, "vec4") as unknown as V4;
  const outline = attribute(a.outline, "vec4") as unknown as V4;
  const outline_fit = attribute(a.outline_fit, "vec4") as unknown as V4;

  // How far past a round plume the outline may reach. A custom one says
  const reach = hooks?.outline
    ? float(Math.max(hooks.outline.reach, 1))
    : max(outline_fit.y, 1);

  // Vertex stage
  //
  // The nozzle in view space through three's own high precision model-view
  // matrix, which is composed on the CPU from the camera actually being drawn
  // with. There is no second copy of the camera to disagree with
  const exit = highpModelViewMatrix.mul(vec4(place.xyz, 1))
    .xyz as unknown as V3;

  const distance_m = length(exit);

  const engine: PlumeEngineNodes = {
    nozzle_radius: shape.x,
    exit_mach: shape.y,
    pressure_ratio: shape.z,
    exit_temperature: thermo.x,
    dry_temperature: thermo.y,
    gamma: thermo.z,
    molar_mass: thermo.w,
    soot: optics.x,
    soot_survival: optics.y,
    particles: optics.z,
    afterburning: motion.w,
    turbulence: motion.x,
    meander: motion.y,
    throttle: place.w,
  };

  // The whole jet, once per vertex: it is constant along the plume
  const jet = plume_jet(engine, p);

  const lod = select(
    distance_m.greaterThan(uniforms.cheap_distance),
    float(2),
    select(
      distance_m.greaterThan(uniforms.detail_distance),
      float(1),
      float(0),
    ),
  );

  // The view space ray origin, carried into the nozzle's frame: out of view
  // space by the model-view's rotation, then out of the mesh by the nozzle's
  const inverse = vec4(rotation.xyz.negate(), rotation.w);

  const camera_from_nozzle = rotate(
    inverse,
    transpose(highpModelViewMatrix).mul(vec4(exit.negate(), 0))
      .xyz as unknown as V3,
  );

  // How much of the screen the plume covers, as a share of a screen height
  // squared. Up close a near plume fills the frame and every pixel of it marches,
  // so the steps are shared out by area: a frame costs about the same however
  // close the camera comes, and at that range the features a step resolves
  // are many pixels across anyway
  //
  // Measured from the nearest point of the axis, not the nozzle: a camera in the
  // tail of a long plume is far from the nozzle and still inside the gas
  const along_axis = clamp(camera_from_nozzle.x, 0, jet.reach);

  const nearest = length(
    vec3(camera_from_nozzle.x.sub(along_axis), camera_from_nozzle.yz),
  );

  const view_height = max(nearest, 1e-3).mul(uniforms.screen_scale);

  const covered = jet.reach
    .mul(jet.outer_near.add(jet.outer_far))
    .div(view_height.mul(view_height));

  const budget = clamp(
    sqrt(float(PLUME_STEP_AREA).div(max(covered, 1e-6))),
    0,
    1,
  );

  // The unit hull runs from x = 0 to 1 and is one unit across. Its rings are
  // opened to the field's extent at each end: the half-width is convex, so the
  // straight line between the two bounds it all the way along. And by the
  // outline's reach, which no point of it passes
  const outer_near = jet.outer_near.mul(reach);
  const outer_far = jet.outer_far.mul(reach);

  const local = vec3(
    positionGeometry.x.mul(jet.reach),
    positionGeometry.yz.mul(mix(outer_near, outer_far, positionGeometry.x)),
  ) as unknown as V3;

  const view = exit.add(
    highpModelViewMatrix.mul(vec4(rotate(rotation, local), 0)).xyz,
  );

  // Not drawn: an engine with no nozzle, or one too small on screen
  // Collapsed outside the clip volume, an instance not being droppable
  const culled = shape.x
    .lessThanEqual(0)
    .or(jet.reach.lessThan(distance_m.mul(uniforms.min_screen_span)));

  const vertex = select(
    culled,
    vec4(2, 2, 2, 1),
    cameraProjectionMatrix.mul(vec4(view, 1)),
  );

  // Varyings
  //
  // The ray direction is the hull point minus the origin in the nozzle frame,
  // which is linear across a triangle and so interpolates exactly
  const v_origin = varying(
    vec4(camera_from_nozzle, lod),
    "v_origin",
  ) as unknown as V4;
  const v_dir = varying(
    vec4(local.sub(camera_from_nozzle), view.z),
    "v_dir",
  ) as unknown as V4;

  const v_jet = varying(
    vec4(jet.radius, jet.core_length, jet.reach, jet.velocity),
    "v_jet",
  ) as unknown as V4;
  const v_heat = varying(
    vec4(jet.temperature, jet.afterburning, jet.shock_heat, jet.shock_length),
    "v_heat",
  ) as unknown as V4;
  const v_cell = varying(
    vec4(jet.shock_spacing, jet.first_disk, jet.spread_near, jet.spread_far),
    "v_cell",
  ) as unknown as V4;
  // The soot as this engine makes it in this air
  const v_optics = varying(
    vec4(optics.x.mul(jet.soot_formed), optics.y, optics.z, optics.w),
    "v_optics",
  ) as unknown as V4;
  const v_exit = varying(
    vec4(
      jet.exit_temperature,
      jet.compression,
      jet.soot_survival,
      jet.adaptation,
    ),
    "v_exit",
  ) as unknown as V4;
  // The radicals are the reheat's flame: a dry turbine has burnt its fuel out
  // long before the nozzle, and leaves none. A rocket's is always burning
  const v_band = varying(
    vec4(band.rgb, band.a.mul(mix(float(1), jet.burner, jet.breathes))),
    "v_band",
  ) as unknown as V4;
  const v_misc = varying(
    vec4(motion.x, motion.y, motion.z, shape.w),
    "v_misc",
  ) as unknown as V4;
  const v_outer = varying(
    vec4(outer_far, jet.reheat, budget, jet.thinning),
    "v_outer",
  ) as unknown as V4;
  const v_outline = varying(
    vec4(cos(outline.z), sin(outline.z), outline.x, outline.y),
    "v_outline",
  ) as unknown as V4;
  const v_outline_fit = varying(
    vec3(outline_fit.x, reach, outline.w),
    "v_outline_fit",
  ) as unknown as V3;
  const v_glow = varying(vec2(jet.glow, shape.x), "v_glow") as unknown as V2;

  // Fragment stage
  const radiance = Fn(() => {
    const instance: PlumeJetNodes = {
      radius: v_jet.x,
      core_length: v_jet.y,
      reach: v_jet.z,
      velocity: v_jet.w,

      temperature: v_heat.x,
      afterburning: v_heat.y,
      reheat: v_outer.y,
      thinning: v_outer.w,
      exit_temperature: v_exit.x,
      compression: v_exit.y,
      shock_heat: v_heat.z,
      shock_length: v_heat.w,

      shock_spacing: v_cell.x,
      first_disk: v_cell.y,
      spread_near: v_cell.z,
      spread_far: v_cell.w,

      soot: v_optics.x,
      soot_survival: v_exit.z,
      particles: v_optics.z,
      albedo: v_optics.w,

      band_color: v_band.rgb,
      band_strength: v_band.a,

      glow: v_glow.x,

      turbulence: v_misc.x,
      meander: v_misc.y,
      refraction: v_misc.z,
      seed: v_misc.w,

      outer_radius: v_outer.x,

      outline: {
        roll: v_outline.xy,
        aspect: v_outline.z,
        squareness: v_outline.w,
        area_scale: v_outline_fit.x,
        reach: v_outline_fit.y,
        length: v_outline_fit.z,
        radius: hooks?.outline?.radius,
      },
    };

    const context: PlumeContext = {
      jet: instance,
      profile: p,
      time,
      blackbody: (temperature_k) => blackbody(temperature_k),
    };

    const origin = v_origin.xyz;
    const tier = v_origin.w;

    // Unit length, so t comes out in metres
    const along_ray = length(v_dir.xyz);
    const direction = v_dir.xyz.div(along_ray).toVar();

    // How far along this ray the opaque scene sits
    const scene_t = scene_view_z(backdrop).mul(along_ray).div(v_dir.w);

    const span = plume_span(
      origin,
      direction,
      instance.outer_radius,
      instance.reach,
      scene_t,
    ).toVar();

    If(span.y.lessThanEqual(span.x), () => {
      Discard();
    });

    const near_tier = tier.lessThan(0.5);
    const far_tier = tier.greaterThan(1.5);

    const crossed = span.y.sub(span.x);

    const closest = plume_closest(origin, direction, span).toVar();

    // How far across the axis the ray runs, per metre along it
    const lateral = max(length(direction.yz), PLUME_EPSILON);

    // The far tier is one sample through the thickest part, standing in for
    // the whole span: a Gaussian's equivalent depth, crossed obliquely
    const far_depth = min(
      plume_half_width(origin.x.add(direction.x.mul(closest)), instance)
        .mul(GAUSSIAN_DEPTH)
        .div(lateral),
      crossed,
    );

    const steps = select(
      far_tier,
      int(1),
      select(
        near_tier,
        int(
          max(
            float(uniforms.near_steps).mul(v_outer.z),
            float(uniforms.mid_steps),
          ),
        ),
        uniforms.mid_steps,
      ),
    );

    const stride = select(
      far_tier,
      far_depth,
      crossed.div(float(steps)),
    ).toVar();

    // The shock train is the one thing in the field finer than the budget's
    // stride, and the budget follows how much screen the plume covers. Marched
    // at that stride, a cell is hit or missed by where the camera stands, and
    // the diamonds slide and fade as it moves. So the stretch of ray inside
    // the train is marched at a set number of samples per cell, tied to the
    // plume and not to the view
    const spacing = max(instance.shock_spacing, PLUME_EPSILON);
    const axial = abs(direction.x);

    const train_end = min(
      instance.reach,
      instance.first_disk
        .add(1)
        .mul(spacing)
        .add(instance.shock_length.mul(SHOCK_TRAIN_LENGTHS)),
    );

    // The cells live in the inviscid core, inside the nozzle's radius, and the
    // hull is many times wider. Only the stretch of ray inside a cylinder about
    // the axis, as far as the meander may carry it, is in the train
    const cylinder = instance.radius
      .mul(1.05)
      .mul(v_outline_fit.y)
      .add(instance.meander.mul(plume_half_width(train_end, instance)));

    const across_o = origin.yz;
    const across_d = direction.yz;

    const qa = max(dot(across_d, across_d), PLUME_EPSILON);
    const qb = dot(across_o, across_d);
    const qc = dot(across_o, across_o).sub(cylinder.mul(cylinder));
    const discriminant = qb.mul(qb).sub(qa.mul(qc));
    const root = sqrt(max(discriminant, 0));

    // Down the axis, x bounds it; across it, the cylinder does
    const x_lo = float(0)
      .sub(origin.x)
      .div(
        select(axial.greaterThan(PLUME_EPSILON), direction.x, PLUME_EPSILON),
      );
    const x_hi = train_end
      .sub(origin.x)
      .div(
        select(axial.greaterThan(PLUME_EPSILON), direction.x, PLUME_EPSILON),
      );

    const seg_in = max(
      max(span.x, qb.negate().sub(root).div(qa)),
      min(x_lo, x_hi),
    ).toVar();
    const seg_out = min(
      min(span.y, qb.negate().add(root).div(qa)),
      max(x_lo, x_hi),
    ).toVar();

    const seg_length = select(
      discriminant.greaterThan(0),
      max(seg_out.sub(seg_in), 0),
      float(0),
    );

    // Enough samples along the axis for every cell, and across the core for
    // its lozenge, held to twice the near budget so a ray down the axis stays bounded
    const fine_steps = select(
      far_tier,
      float(0),
      min(
        ceil(
          max(
            seg_length.mul(axial).div(spacing).mul(SAMPLES_PER_CELL),
            seg_length.div(cylinder).mul(SAMPLES_ACROSS_CORE * 0.5),
          ),
        ),
        float(uniforms.near_steps).mul(FINE_STEP_CAP),
      ),
    ).toVar();

    const has_fine = fine_steps.greaterThan(0);

    const fine_stride = min(stride, seg_length.div(max(fine_steps, 1))).toVar();

    // One more for the step cut short at the train's start
    const budget_steps = steps.add(int(fine_steps)).add(2);

    // A per sample offset so the steps do not band. Seeded in whole cells of
    // the plume's own frame, so it holds still on the plume as the camera
    // moves, and split per pixel by interleaved gradient noise: neighbouring
    // pixels mostly enter in the same cell, and offset alike they march in
    // lockstep and the bands come back as ripples round the plume. The pixel's
    // share would make the root shimmer with the camera, had the root not
    // been marched finely in the train, where the step error it moves is small
    const entry_cell = floor(
      origin.add(direction.mul(span.x)).mul(p.dither_scale),
    );

    const pixel = screenCoordinate.xy;

    const interleaved = fract(
      fract(dot(pixel, vec2(0.06711056, 0.00583715))).mul(52.9829189),
    );

    const jitter = fract(hash_cell(entry_cell).add(interleaved));

    // Where the fine march starts, dithered by the same offset
    const seg_start = seg_in.add(jitter.mul(fine_stride)).toVar();

    const first_stride = select(
      has_fine.and(seg_in.lessThanEqual(span.x)),
      fine_stride,
      stride,
    );

    const t = select(
      far_tier,
      closest,
      span.x.add(jitter.mul(first_stride)),
    ).toVar();

    // The eddies are the dear part of a sample: only near, and only if any
    const turbulent = near_tier.and(instance.turbulence.greaterThan(0));

    // What reaches the camera from the plume, and what is left of the light
    // behind it, per primary
    const light = vec3(0).toVar();
    const transmittance = vec3(1).toVar();

    // How much hot gas the ray went through, for the haze
    const column = float(0).toVar();

    Loop(
      { start: int(0), end: budget_steps, type: "int", condition: "<" },
      () => {
        If(t.greaterThan(span.y), () => {
          Break();
        });

        const frame = plume_frame(origin.add(direction.mul(t)), context);

        const before_train = has_fine.and(t.lessThan(seg_start));

        const in_train = has_fine
          .and(t.greaterThanEqual(seg_start))
          .and(t.lessThan(seg_out));

        // A coarse step never runs past the train's start, but stops on it
        const to_train = max(seg_start.sub(t), 1e-4);

        const here = select(
          in_train,
          fine_stride,
          select(before_train, min(stride, to_train), stride),
        ).toVar();

        // Its own length for the eddies, and how much plume axis it crosses for
        // the cells, which only vary along it and are what aliases down the axis
        const footprint = vec2(here, here.mul(axial));

        const gap = plume_bound(frame, context);

        // Empty space: skip at least a stride, so the loop never covers less
        // than an even march would, and spends almost nothing on the gap
        If(gap.greaterThan(0).and(far_tier.not()), () => {
          const leap = max(gap.mul(p.step_safety), here);

          t.addAssign(select(before_train, min(leap, to_train), leap));

          Continue();
        });

        const sample = plume_field(frame, footprint, turbulent, context, {
          octaves,
          hooks,
        });

        // One step of the transfer equation, exact for a constant source over
        // the step: the source is attenuated by the medium it is in, not only
        // by the medium in front of it, and a thick step saturates instead of
        // overshooting
        const depth = sample.extinction.mul(here);
        const through = exp(depth.negate());

        // (1 - e^-τ) / τ, which loses every digit as τ goes to zero
        const share = mix(
          depth.mul(-0.5).add(1),
          float(1).sub(through).div(max(depth, 1e-3)),
          step(1e-3, depth),
        );

        light.addAssign(
          transmittance.mul(sample.emission).mul(share).mul(here),
        );
        transmittance.mulAssign(through);

        column.addAssign(
          sample.mixture
            .mul(
              float(1).sub(p.air.temperature_k.div(max(sample.temperature, 1))),
            )
            .mul(here),
        );

        // Opaque already, and nothing behind can show through
        If(
          max(max(transmittance.x, transmittance.y), transmittance.z).lessThan(
            OPAQUE_TRANSMITTANCE,
          ),
          () => {
            Break();
          },
        );

        t.addAssign(here);
      },
    );

    // A dry engine's gas is too cool to see: a thousand kelvin is a shimmer
    // and nothing more. What glows is the hardware, the last turbine stage and
    // the pipe behind it a dull red, and only up the nozzle from astern
    If(
      v_glow.x.greaterThan(0).and(direction.x.lessThan(-PLUME_EPSILON)),
      () => {
        const exit_radius = max(v_glow.y, PLUME_EPSILON);

        // Where the ray crosses the exit plane, and where it would meet the
        // turbine deep behind it
        const to_exit = origin.x.div(direction.x.negate());
        const to_turbine = origin.x
          .add(exit_radius.mul(TURBINE_DEPTH))
          .div(direction.x.negate());

        const at_exit = length(origin.yz.add(direction.yz.mul(to_exit))).div(
          exit_radius,
        );
        const at_turbine = length(
          origin.yz.add(direction.yz.mul(to_turbine)),
        ).div(exit_radius);

        // Through the lip, and nothing opaque in the way
        const through_lip = float(1)
          .sub(smoothstep(0.9, 1, at_exit))
          .mul(step(0, to_exit))
          .mul(step(to_exit, scene_t));

        // The blades glow, the hub less, and as the view tilts the disc slides
        // behind the lip until only the pipe's wall is left
        const blades = smoothstep(0.25, 0.5, at_turbine).mul(0.5).add(0.5);
        const turbine = float(1)
          .sub(smoothstep(0.85, 1, at_turbine))
          .mul(blades);

        // A ray that misses the turbine meets the pipe's wall, cool by the lip
        // and hotter the deeper it goes. How deep, from where it crosses the
        // radius between the exit plane and the turbine
        const deep = clamp(
          float(1)
            .sub(at_exit)
            .div(max(at_turbine.sub(at_exit), PLUME_EPSILON)),
          0,
          1,
        );

        const wall = deep.mul(deep).mul(PIPE_GLOW);

        const seen = mix(wall, float(1), turbine).mul(through_lip);

        // The hardware runs at about the gas's own temperature, and its colour
        // is that blackbody's, held at a luminance of one
        const hue = blackbody(v_exit.x);
        const tint = hue.div(max(dot(hue, vec3(...LUMINANCE)), 1e-6));

        light.addAssign(transmittance.mul(tint).mul(v_glow.x).mul(seen));
      },
    );

    // Opened up for a dim plume, as a camera metering it would be
    const exposed = light.mul(p.exposure).mul(v_exit.w).toVar();

    const coverage = float(1).sub(dot(transmittance, vec3(...LUMINANCE)));

    If(
      coverage
        .lessThan(1e-4)
        .and(max(max(exposed.x, exposed.y), exposed.z).lessThan(1e-5))
        .and(column.lessThan(PLUME_EPSILON)),
      () => {
        Discard();
      },
    );

    const lit = hooks?.radiance
      ? hooks.radiance(exposed, {
          context,
          origin,
          direction,
          span,
          lod: tier,
          transmittance,
        })
      : exposed;

    const out = vec3(lit).toVar();

    if (haze) {
      // Heat haze: hot exhaust is thinner than the air, so what is behind it
      // swims, and the soot in it tints and dims what swims
      //
      // The blend keeps (1 - coverage) of what is there. Adding what is
      // behind the plume, displaced and filtered, less that much of it straight,
      // replaces the one with the other exactly
      If(far_tier.not(), () => {
        // Seeded where the ray passes closest to the axis, a property of the
        // ray and the plume that varies smoothly with both. The hull entry
        // jumps at the silhouette and boils
        const point = origin.add(direction.mul(closest));

        const width = max(plume_half_width(point.x, instance), PLUME_EPSILON);

        const eddy = width.mul(0.5);

        const swim_x = plume_station(point.x, instance)
          .sub(time.mul(instance.velocity).mul(0.6))
          .div(
            eddy
              .mul(p.eddy_stretch)
              .add(instance.velocity.mul(0.6).mul(p.shutter_s)),
          );

        const swim_y = point.y.div(eddy);
        const swim_z = point.z.div(eddy);

        const phase = instance.seed;

        // Sines rather than value noise: a displacement of a lattice slides
        // whole cells rigidly and tears at the seams between them
        const bend = vec2(
          sin(swim_x.mul(1.7).add(swim_y.mul(2.3)).add(phase)).add(
            sin(swim_x.mul(3.9).sub(swim_z.mul(2.7)).add(phase.mul(1.7))).mul(
              0.5,
            ),
          ),
          cos(swim_y.mul(2.1).sub(swim_z.mul(1.9)).add(phase)).add(
            cos(swim_x.mul(3.1).add(swim_y.mul(4.3)).add(phase.mul(2.3))).mul(
              0.5,
            ),
          ),
        ).div(3);

        // How much hot gas the ray crossed, against one diameter of the core
        const heat = clamp(column.div(width.mul(GAUSSIAN_DEPTH)), 0, 1);

        // Gladstone and Dale: the index of air departs from one in
        // proportion to its density, so thin air bends little however hot
        const metres = instance.refraction.mul(heat).mul(p.air.density);

        const offset = clamp(
          bend
            .mul(metres)
            .div(max(length(origin).mul(uniforms.screen_scale), PLUME_EPSILON)),
          -HAZE_LIMIT,
          HAZE_LIMIT,
        );

        // A screen height is not a screen width
        const uv_offset = vec2(
          offset.x.mul(screenSize.y).div(screenSize.x),
          offset.y,
        );

        const backdrop_at = (uv: V2) =>
          backdrop
            ? backdrop.color.sample(uv).rgb
            : viewportSharedTexture(uv).rgb;

        const behind = backdrop_at(screenUV as unknown as V2);
        const displaced = backdrop_at(screenUV.add(uv_offset) as unknown as V2);

        out.addAssign(
          displaced.mul(transmittance).sub(behind.mul(coverage.oneMinus())),
        );
      });
    }

    return vec4(out, coverage);
  });

  // Premultiplied: what the plume emits, over what it lets through
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    // The radiance is premultiplied already. Three's own flag would multiply it
    // by the coverage again, and a clean plume, emitting but covering nothing,
    // would vanish
    premultipliedAlpha: false,
    depthTest: false,
    depthWrite: false,
    side: BackSide,
    fog: false,
  });

  material.name = "AfterburnerMaterial";
  material.vertexNode = vertex;
  material.colorNode = radiance();

  return { material, uniforms, set_profile };
};
