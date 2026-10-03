import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  Vector3,
} from "three";
import {
  BackSide,
  CustomBlending,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
  type UniformNode,
} from "three/webgpu";
import {
  Break,
  Continue,
  Discard,
  Fn,
  If,
  Loop,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  clamp,
  dot,
  exp,
  float,
  fract,
  highpModelViewMatrix,
  int,
  logarithmicDepthToViewZ,
  max,
  min,
  mix,
  perspectiveDepthToViewZ,
  positionGeometry,
  pow,
  screenCoordinate,
  select,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
  viewportDepthTexture,
} from "three/tsl";
import { CONDENSATION_MIN_RATIO, CONDENSATION_TEXELS } from "./condensation";
import { SHAPE_ROWS, vapor_field, type VaporFieldNodes } from "./tsl/field";
import { patchiness } from "./tsl/noise";
import type { VaporEffects } from "./types";
import type { EdgePath, VaporConstants, VaporField } from "./vapor-field";
import { TRAIL_POINTS, type TrailPaths } from "./trails";
import { SHAPE_STATIONS, type WingShape } from "./wing-shape";

// The vapour, drawn as one box round everything that can fog
//
// The box is marched, skipping the clear air between the parts with the
// distances the field gives, and wherever the pressure is low enough the
// condensation table says how much water there is. The water scatters the
// sun's and the sky's light and dims what is behind it, and the blend is
// premultiplied, as a cloud's is: it covers what it is in front of

type F = Node<"float">;
type V3 = Node<"vec3">;

// Once every primary is down to this, nothing behind can show through
const OPAQUE_TRANSMITTANCE = 0.01;

// How much the scattering is boosted for the light that scatters more than
// once. A thick cloud's single scattering is about an eighth of what a white
// wall would send back; the rest is multiple scattering, which this stands in
// for, and the isotropic half of the phase function with it
const MULTIPLE_SCATTERING = 4;

// The share of the phase function that is isotropic: multiple scattering
// smears the droplets' forward peak
const ISOTROPIC_SHARE = 0.5;

// Where the sunlight's path through the vapour is sampled, metres towards
// the sun, and how much of the path each stands for: close, where the
// shading varies fastest, and out to a thick cloud's depth
const SHADOW_SAMPLES: [number, number][] = [
  [0.4, 0.8],
  [1.4, 1.6],
  [4, 4],
];

// How much less the multiply scattered light is dimmed than the direct beam
// by the same cloud: it goes round as much as through
const MULTIPLE_SHADE = 0.25;

// The least step, in metres per metre of distance from the camera: a pixel
const PIXEL_STEP = 0.0015;

/**
 * The names of every uniform the field reads, from the CPU's field and its
 * constants.
 */
const FIELD_KEYS: (keyof (VaporField & VaporConstants))[] = [
  "mach",
  "speed_m_s",
  "cos_alpha",
  "sin_alpha",
  "vortex_k",
  "saturation_deficit",
  "semispan_m",
  "root_span_m",
  "tip_leading_m",
  "tip_chord_m",
  "tip_height_m",
  "section_lift_m",
  "separation",
  "cos2_sweep",
  "normal_mach",
  "tip_circulation",
  "tip_core2_m2",
  "tip_growth_m",
  "tip_descent",
  "tip_reach_m",
  "tip_bound_m",
  "trail_spacing_m",
  "second_semispan_m",
  "second_tip_leading_m",
  "second_tip_chord_m",
  "second_tip_height_m",
  "second_circulation",
  "second_core2_m2",
  "second_growth_m",
  "second_descent",
  "second_reach_m",
  "second_bound_m",
  "second_spacing_m",
  "edge_apex_m",
  "edge_gradient",
  "edge_length_m",
  "edge_core",
  "edge_height",
  "edge_burst_m",
  "edge_bound_m",
  "wing_bound_m",
  "evaporation_m",
  "nose_m",
  "body_length_m",
  "body_radius_m",
  "body_height_m",
  "cone_strength",
  "cone_shock",
  "cone_fade",
  "cone_bound_m",
  "wing_scale",
  "wing_sonic",
  "wing_beta",
  "wing_kt",
  "wing_cap",
  "wing_reach",
  "wing_travel",
  "wing_supersonic",
  "cone_scale",
  "cone_beta",
  "cone_kt",
  "cone_cap",
  "cone_reach_m",
];

type FloatUniform = UniformNode<"float", number>;
type Vec3Uniform = UniformNode<"vec3", Vector3>;

/**
 * The uniforms one vapour material is driven by.
 */
export type VaporUniforms = {
  field: { [K in keyof (VaporField & VaporConstants)]: FloatUniform };

  // The box, in the canonical frame
  box_min: Vec3Uniform;
  box_max: Vec3Uniform;

  // The camera, in the canonical frame
  camera: Vec3Uniform;

  // Which way the sunlight comes from, in the canonical frame, and the
  // light's colour times its brightness
  sun_direction: Vec3Uniform;
  sun: Vec3Uniform;
  sky: Vec3Uniform;

  exposure: FloatUniform;

  // Extinction per metre per gram of water per cubic metre
  extinction: FloatUniform;

  anisotropy: FloatUniform;
  eddy_m: FloatUniform;
  shutter_s: FloatUniform;

  // Seconds
  time: FloatUniform;

  // Where in the moisture's noise this aircraft flies, so two do not fog in
  // lockstep
  seed: FloatUniform;

  // How much coarser than its parts ask the march may step, one or more: the
  // more of the screen the vapour covers, the more
  step_scale: FloatUniform;

  // Whether the moisture's patches are drawn: 1 near, 0 far
  detail: FloatUniform;

  // The most iterations the march may take
  max_steps: UniformNode<"int", number>;
};

/**
 * Make the uniforms a vapour material is driven by.
 * @returns Fresh uniforms, zeroed
 */
export const create_vapor_uniforms = (): VaporUniforms => {
  const field = {} as VaporUniforms["field"];

  for (const key of FIELD_KEYS) {
    field[key] = uniform(0).setName(`wing_vapor_${key}`) as FloatUniform;
  }

  const vector = (name: string) =>
    uniform(new Vector3()).setName(
      `wing_vapor_${name}`,
    ) as unknown as Vec3Uniform;

  return {
    field,
    box_min: vector("box_min"),
    box_max: vector("box_max"),
    camera: vector("camera"),
    sun_direction: vector("sun_direction"),
    sun: vector("sun"),
    sky: vector("sky"),
    exposure: uniform(1) as FloatUniform,
    extinction: uniform(1.5) as FloatUniform,
    anisotropy: uniform(0.75) as FloatUniform,
    eddy_m: uniform(0.6) as FloatUniform,
    shutter_s: uniform(1 / 60) as FloatUniform,
    time: uniform(0) as FloatUniform,
    seed: uniform(0) as FloatUniform,
    step_scale: uniform(1) as FloatUniform,
    detail: uniform(1) as FloatUniform,
    max_steps: uniform(160, "int") as UniformNode<"int", number>,
  };
};

/**
 * Write a field and its constants into the uniforms.
 * @param uniforms The uniforms
 * @param field The field
 * @param constants Its constants
 */
export const write_vapor_field = (
  uniforms: VaporUniforms,
  field: VaporField,
  constants: VaporConstants,
) => {
  const all = { ...field, ...constants };

  for (const key of FIELD_KEYS) {
    uniforms.field[key].value = all[key];
  }
};

/**
 * Make the condensation table's texture, to be filled with `write_vapor_table`.
 * Half floats, so it filters on every backend.
 * @returns The texture
 */
export const create_vapor_table = (): DataTexture => {
  const table = new DataTexture(
    new Uint16Array(CONDENSATION_TEXELS * 4),
    CONDENSATION_TEXELS,
    1,
    RGBAFormat,
    HalfFloatType,
  );

  table.magFilter = LinearFilter;
  table.minFilter = LinearFilter;
  table.wrapS = ClampToEdgeWrapping;
  table.wrapT = ClampToEdgeWrapping;
  table.generateMipmaps = false;
  table.name = "WingVaporCondensation";

  return table;
};

/**
 * Fill the condensation table's texture.
 * @param table The texture
 * @param values `condensation_table`'s floats
 */
export const write_vapor_table = (table: DataTexture, values: Float32Array) => {
  const data = table.image.data as Uint16Array;

  for (let index = 0; index < values.length; index++) {
    data[index] = DataUtils.toHalfFloat(values[index]);
  }

  table.needsUpdate = true;
};

/**
 * Make the texture the wing's tables ride in, to be filled with
 * `write_shape_texture`. Half floats, so it filters on every backend: a
 * millimetre's resolution on a ten metre chord.
 * @returns The texture
 */
export const create_shape_texture = (): DataTexture => {
  const shape = new DataTexture(
    new Uint16Array(SHAPE_STATIONS * SHAPE_ROWS * 4),
    SHAPE_STATIONS,
    SHAPE_ROWS,
    RGBAFormat,
    HalfFloatType,
  );

  shape.magFilter = LinearFilter;
  shape.minFilter = LinearFilter;
  shape.wrapS = ClampToEdgeWrapping;
  shape.wrapT = ClampToEdgeWrapping;
  shape.generateMipmaps = false;
  shape.name = "WingVaporShape";

  return shape;
};

/**
 * Write a wing's tables into its texture: a row of stations (leading edge,
 * chord, mid-plane, thickness), a row of loading, and a row of the
 * leading-edge vortex's path (its span, the surface under it, its reach).
 * @param texture The texture
 * @param shape The wing
 * @param path The leading-edge vortex's path along it
 */
export const write_shape_texture = (
  texture: DataTexture,
  shape: WingShape,
  path: EdgePath,
) => {
  const data = texture.image.data as Uint16Array;

  const put = (row: number, station: number, values: number[]) => {
    const offset = (row * SHAPE_STATIONS + station) * 4;

    for (let channel = 0; channel < 4; channel++) {
      data[offset + channel] = DataUtils.toHalfFloat(values[channel] ?? 0);
    }
  };

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    put(0, station, [
      shape.leading_m[station],
      shape.chord_m[station],
      shape.mid_m[station],
      shape.thickness[station],
    ]);
    put(1, station, [shape.loading[station]]);
    put(2, station, [
      path.span_m[station],
      path.surface_m[station],
      path.reach_m[station],
    ]);
  }

  texture.needsUpdate = true;
};

/**
 * Make the texture the tip vortices' trails ride in, a row each, the wing's
 * then a canard's or a tailplane's, to be filled
 * every frame with `write_trail_texture`. Full floats, read texel by texel:
 * a trail runs hundreds of metres, and half floats would put its points a
 * quarter of a metre apart from where they are.
 * @returns The texture
 */
export const create_trail_texture = (): DataTexture => {
  const trails = new DataTexture(
    new Float32Array(TRAIL_POINTS * 4 * 4),
    TRAIL_POINTS,
    4,
    RGBAFormat,
    FloatType,
  );

  trails.magFilter = NearestFilter;
  trails.minFilter = NearestFilter;
  trails.generateMipmaps = false;
  trails.name = "WingVaporTrails";

  return trails;
};

/**
 * Write every trail into their texture: the wing's two, then a canard's or a
 * tailplane's.
 * @param texture The texture
 * @param trails The wing's trails
 * @param second The second surface's
 */
export const write_trail_texture = (
  texture: DataTexture,
  trails: TrailPaths,
  second: TrailPaths,
) => {
  const data = texture.image.data as Float32Array;

  [trails.positive, trails.negative, second.positive, second.negative].forEach(
    (points, row) => {
      for (let index = 0; index < TRAIL_POINTS; index++) {
        const offset = (row * TRAIL_POINTS + index) * 4;

        data[offset] = points[index * 3];
        data[offset + 1] = points[index * 3 + 1];
        data[offset + 2] = points[index * 3 + 2];
      }
    },
  );

  texture.needsUpdate = true;
};

/**
 * What is compiled into one vapour material.
 */
export type VaporMaterialOptions = {
  uniforms: VaporUniforms;
  table: DataTexture;

  // The wing's tables, from `create_shape_texture`
  shape: DataTexture;

  // The tip vortices' trails, from `create_trail_texture`
  trails: DataTexture;

  effects: VaporEffects;
};

/**
 * How far in front of the camera the opaque scene sits, in view space.
 * @returns The view space depth, negative
 */
const scene_view_z = (): F =>
  (
    Fn((builder: { renderer: { logarithmicDepthBuffer: boolean } }) => {
      const depth = viewportDepthTexture().x;

      return builder.renderer.logarithmicDepthBuffer
        ? logarithmicDepthToViewZ(depth, cameraNear, cameraFar)
        : perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    }) as unknown as () => F
  )();

/**
 * Henyey and Greenstein's phase function.
 * @param cosine The cosine of the scattering angle
 * @param g The anisotropy
 * @returns The phase, per steradian
 */
const henyey_greenstein = (cosine: F, g: F): F => {
  const g2 = g.mul(g);

  return g2
    .oneMinus()
    .div(pow(max(g2.add(1).sub(g.mul(cosine).mul(2)), 1e-4), 1.5))
    .div(4 * Math.PI);
};

/**
 * Build the material one aircraft's vapour is drawn with.
 * @param options Its uniforms, its table and which parts it draws
 * @returns The material
 */
export const create_vapor_material = (
  options: VaporMaterialOptions,
): MeshBasicNodeMaterial => {
  const { uniforms: u, table, shape, trails, effects } = options;
  const f = u.field as unknown as VaporFieldNodes;

  const box_min = u.box_min as unknown as V3;
  const box_max = u.box_max as unknown as V3;
  const camera = u.camera as unknown as V3;

  // Vertex stage: the unit box opened to the field's bounds. The mesh's own
  // matrix is the airframe's frame, rigid and in metres
  const local = box_min.add(
    positionGeometry.add(0.5).mul(box_max.sub(box_min)),
  ) as unknown as V3;

  const view = highpModelViewMatrix.mul(vec4(local, 1)).xyz as unknown as V3;

  const v_local = varying(local, "v_vapor_local") as unknown as V3;
  const v_view = varying(view, "v_vapor_view") as unknown as V3;

  const radiance = Fn(() => {
    const ray = v_local.sub(camera);
    const along_ray = ray.length();
    const direction = ray.div(along_ray).toVar();

    // Where the opaque scene is along this ray, in metres: view space and the
    // canonical frame differ by a rotation only
    const view_direction = v_view.normalize();
    const scene_t = scene_view_z().div(min(view_direction.z, -1e-6));

    // The box's slab test
    const safe = (component: F) =>
      select(component.abs().lessThan(1e-6), float(1e-6), component);
    const inverse = vec3(1).div(
      vec3(safe(direction.x), safe(direction.y), safe(direction.z)),
    );
    const t_low = box_min.sub(camera).mul(inverse);
    const t_high = box_max.sub(camera).mul(inverse);
    const t_near = min(t_low, t_high);
    const t_far = max(t_low, t_high);

    const enter = max(max(max(t_near.x, t_near.y), t_near.z), 0);
    const leave = min(min(min(t_far.x, t_far.y), t_far.z), scene_t);

    If(leave.lessThanEqual(enter), () => {
      Discard();
    });

    // A per pixel offset, so the steps do not band
    const pixel = screenCoordinate.xy;
    const jitter = fract(
      fract(dot(pixel, vec2(0.06711056, 0.00583715))).mul(52.9829189),
    );

    // The light, the same for every sample: sun and sky, per unit of scattering
    const cosine = dot(direction, u.sun_direction as unknown as V3);
    // The sun's light, split as clouds' is: the droplets' forward peak, which
    // a cloud in the way blocks, and what has scattered many times, which
    // diffuses round it and is dimmed far less
    const sun = (u.sun as unknown as V3).mul(MULTIPLE_SCATTERING);
    const sun_single = sun
      .mul(henyey_greenstein(cosine, u.anisotropy as unknown as F))
      .mul(1 - ISOTROPIC_SHARE)
      .toVar();
    const sun_multiple = sun.mul(ISOTROPIC_SHARE / (4 * Math.PI)).toVar();
    const sky = (u.sky as unknown as V3).toVar();
    const sun_ray = (u.sun_direction as unknown as V3).toVar();

    // The air moves aft past the aircraft at the airspeed, along the free
    // stream, and the patches move with it. The shutter streaks them
    const flow = vec3(f.cos_alpha, f.sin_alpha, 0);
    const drift = f.speed_m_s.mul(u.time as unknown as F);
    const streak = (u.eddy_m as unknown as F).add(
      f.speed_m_s.mul(u.shutter_s as unknown as F),
    );

    // The condensation table at one deficit: grams per cubic metre in the
    // drier, the day's and the moister parcel
    const water_at = (deficit: F) => {
      const ratio = float(1).sub(clamp(deficit, 0, 1 - CONDENSATION_MIN_RATIO));

      const u_table = clamp(
        ratio.sub(CONDENSATION_MIN_RATIO).div(1 - CONDENSATION_MIN_RATIO),
        0,
        1,
      )
        .mul(CONDENSATION_TEXELS - 1)
        .add(0.5)
        .div(CONDENSATION_TEXELS);

      return texture(table, vec2(u_table, 0.5)).level(float(0));
    };

    const light = vec3(0).toVar();
    const transmittance = float(1).toVar();

    const t = enter.toVar();

    // Whether the march is inside something that can fog. Every time it comes
    // in from clear air it is offset by a share of the step it will take,
    // which turns the bands a sharp edge would leave into fine noise
    const inside = float(0).toVar();

    Loop(
      { start: int(0), end: u.max_steps, type: "int", condition: "<" },
      () => {
        If(t.greaterThan(leave), () => {
          Break();
        });

        const point = camera.add(direction.mul(t)).toVar();
        const sample = vapor_field(f, shape, trails, point, effects).toVar();

        const footprint = t.mul(PIXEL_STEP).toVar();

        // Clear air: skip to the nearest part that could fog
        If(sample.y.greaterThan(0), () => {
          t.addAssign(max(sample.y, max(footprint, 0.05)));
          inside.assign(0);
          Continue();
        });

        // The part's own step, coarsened by what the view can spare, and never
        // finer than a pixel
        const here = min(
          max(sample.z.mul(u.step_scale as unknown as F), footprint),
          leave.sub(t).add(1e-3),
        ).toVar();

        If(inside.lessThan(0.5), () => {
          inside.assign(1);
          t.addAssign(jitter.mul(here));
          Continue();
        });

        // Only below the dew point's deficit is there anything to look up
        If(sample.x.greaterThan(f.saturation_deficit), () => {
          const water = water_at(sample.x);

          // The moisture's patches, in the air's own frame
          const air = point
            .sub(flow.mul(drift))
            .add(vec3(37.1, 11.3, 23.7).mul(u.seed as unknown as F));
          const downstream = dot(air, flow);
          const across = air.sub(flow.mul(downstream));

          // Far off, the patches are smaller than a pixel: the day's own
          // humidity, and none of the noise's hashes
          const patch = float(0).toVar();

          If((u.detail as unknown as F).greaterThan(0.5), () => {
            patch.assign(
              clamp(
                patchiness(
                  vec3(downstream.div(streak), across.yz.div(u.eddy_m)),
                ),
                -1,
                1,
              ),
            );
          });

          const grams = select(
            patch.lessThan(0),
            mix(water.y, water.x, patch.negate()),
            mix(water.y, water.z, patch),
          );

          const extinction = max(grams, 0).mul(u.extinction as unknown as F);
          const through = exp(extinction.mul(here).negate());

          // How much cloud the sunlight crossed to get here
          const shade = float(0).toVar();

          if (effects.self_shadow) {
            If((u.detail as unknown as F).greaterThan(0.5), () => {
              for (const [distance, length] of SHADOW_SAMPLES) {
                // Without the tips: a tube a metre across shades almost
                // nothing, and its trail is the dearest part to look up
                const toward = vapor_field(
                  f,
                  shape,
                  trails,
                  point.add(sun_ray.mul(distance)),
                  { ...effects, tip_vortices: false },
                ).x;

                shade.addAssign(
                  water_at(toward)
                    .y.mul(u.extinction as unknown as F)
                    .mul(length),
                );
              }
            });
          }

          const source = sun_single
            .mul(exp(shade.negate()))
            .add(sun_multiple.mul(exp(shade.mul(-MULTIPLE_SHADE))))
            .add(sky);

          // Every droplet scatters what it stops: an albedo of one
          light.addAssign(source.mul(transmittance.mul(through.oneMinus())));
          transmittance.mulAssign(through);
        });

        If(transmittance.lessThan(OPAQUE_TRANSMITTANCE), () => {
          Break();
        });

        t.addAssign(here);
      },
    );

    const coverage = transmittance.oneMinus();

    If(coverage.lessThan(1e-4), () => {
      Discard();
    });

    return vec4(light.mul(u.exposure as unknown as F), coverage);
  });

  // Premultiplied: what the vapour scatters, over what it lets through
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    premultipliedAlpha: false,
    depthTest: false,
    depthWrite: false,
    side: BackSide,
    fog: false,
  });

  material.name = "WingVaporMaterial";
  material.vertexNode = cameraProjectionMatrix.mul(vec4(view, 1));
  material.colorNode = radiance();

  return material;
};
