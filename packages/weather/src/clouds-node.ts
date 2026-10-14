import {
  type Camera,
  Color,
  HalfFloatType,
  Matrix4,
  type Object3D,
  type PerspectiveCamera,
  RenderTarget,
  RGBAFormat,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import {
  Break,
  dot,
  exp,
  exp2,
  float,
  floor,
  fract,
  Fn,
  getViewPosition,
  hash,
  If,
  int,
  ivec2,
  Loop,
  max,
  min,
  mix,
  outputStruct,
  passTexture,
  perspectiveDepthToViewZ,
  pow,
  screenCoordinate,
  screenUV,
  select,
  sqrt,
  struct,
  texture,
  textureLoad,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type Node,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type TextureNode,
} from "three/webgpu";
import {
  KOSCHMIEDER,
  set_scene_medium,
  set_scene_path,
  type SceneMedium,
  type ScenePath,
} from "@aeronautic/core";
import {
  EARTH_RADIUS_M,
  TABLE_ROW_COUNT,
  TABLE_ROWS,
  TABLE_SIZE,
  table_at,
} from "./density";
import { overshoot } from "./convection";
import { LIGHTNING_EFFICACY } from "./lightning";
import {
  ALBEDO,
  DIFFUSE_ASYMMETRY,
  LIGHT_FIRST_M,
  LIGHT_STEPS,
  weather_medium,
  weather_path,
} from "./medium";
import {
  droplet_coefficient,
  effective_radius,
  ICE_ASYMMETRY,
  mie_phase,
  RAIN_ASYMMETRY,
  type AirMass,
} from "./physics";
import {
  create_half_texture,
  create_noise_textures,
  type NoiseTextures,
} from "./textures";
import { DETAIL_SALT, SHAPE_SALT } from "./noise";
import {
  cloud_at,
  create_field_nodes,
  map_column,
  update_field_nodes,
  type FieldNodes,
} from "./tsl/density";
import {
  look_lux,
  resolve_weather_quality,
  STEPS_FROM_M,
  type WeatherQuality,
  type WeatherQualityName,
} from "./types";
import type { Weather } from "./weather";

// The haze's scale height: the aerosols are mixed through the boundary layer
// and thin out above it, their extinction falling as e^(−h / H) with H about
// 1.2 km (Bruneton & Neyret 2008, Hillaire 2020)
const AEROSOL_SCALE_M = 1200;

// The clouds, raymarched at a reduced resolution and resolved over the frames
//
// Each frame, a ray a texel: through the shell of air the clouds fill, round
// the earth's curve, from where it enters to where it leaves, the scene, or
// the range. It walks it in steps that grow with the distance as a pixel's
// footprint does, each just long enough that the steps it has left reach the
// end, and it never goes back: there is one walk, the same for clear air and
// cloud, so nothing in it can switch from frame to frame and show as a line.
// Each step's light is integrated over its whole length as Hillaire has it,
// so a long step dims the ray as much as the short ones it stands for, and
// is sampled somewhere different along it every frame.
//
// At each step in cloud: the droplets', the ice's and the rain's extinction;
// the sun through the cloud towards it, in six steps each twice the last;
// its light scattered once, by Mie's phase for each layer's droplets, and
// many times, as the diffuse light the cloud holds (medium.ts); the sky above and the ground below
// through the cloud over and under; and the lightning's.
//
// Past `shapeM` the clouds are too far for their billows to show, a pixel
// kilometres across: there the ray takes a few long steps through their mean,
// read from a coarser map that reaches to the horizon, lit as layers of it.
//
// Each frame marches one texel of every four by four, in a Bayer order, and
// the resolve fills the others from their history, as Takram's clouds do: a
// sixteenth of the rays, into a history at the clouds' whole resolution. A
// texel's ray is its own, through its centre, so over sixteen frames every
// texel is seen sharp, not a coarser march's blur.
//
// Then the frames are blended: each texel's last value is found where the
// cloud it saw was the frame before, and kept unless it strays outside what
// the texel's neighbours see now

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;
type M4 = Node<"mat4">;

type Uniform<T, N> = N & { value: T };

// Below this transmittance, a ray has nothing left to see through
const OPAQUE = 0.01;

// The golden ratio, whose fractions of a frame count fill a step evenly
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

// How many deviations from its neighbours' mean a texel's history may stray.
// Salvi (2016) has one, for neighbours a texel apart; here they are four, a
// coarser and noisier neighbourhood, and one would clip the history to its
// grain. Two, as Takram's upscale has it: a cloud's slow change hides what
// little more it lags
const CLIP_DEVIATIONS = 2;

// How much of the detail's reach it fades out over, towards its end: a share
// of it, so its edge is not a line
const DETAIL_FADE = 0.3;

// The share of `shapeM` over which the clouds' shapes hand over to their
// mean, somewhere different each frame, so the history blends the two
const HANDOFF = 0.2;

// How far the light march reaches towards the sun: six steps, each twice the
// last. Past `shapeM` the sun is let in through the layer over the point as
// far as this, the same reach
const LIGHT_REACH_M = LIGHT_FIRST_M * (2 ** LIGHT_STEPS - 1);

// The texels a side of each block one ray is marched in a frame
const UPSCALE = 4;

// The order each block's texels are marched in: Bayer's, each frame's as far
// from the last ones as can be, so a frame's rays are spread evenly and any
// four in a row cover the block as a two by two would
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const ORDER = BAYER.flatMap((row, y) => row.map((at, x) => ({ at, x, y })))
  .sort((a, b) => a.at - b.at)
  .map(({ x, y }) => [x, y] as const);

/** The most flashes lighting the clouds at once */
export const LIGHTS = 4;

// The share of a flash's distance to a point of cloud that is cloud as thick
// as the point's own: the light comes through gaps as well. An estimate. The
// rain on the way is its mean, not the shaft the point is in: a path
// kilometres long crosses many
const LIGHTNING_PATH_SHARE = 0.5;

// What a ray hands back: its light and its alpha, and where it saw cloud,
// where the scene was, and what it saw through
const MARCHED = struct({ color: "vec4", info: "vec4" }, "CloudsMarched");

// The scene's depth of nothing: the sky
const NOWHERE = 1e9;

const scratch_size = new Vector2();
const scratch_origin = new Vector3();

const float_uniform = (value = 0) =>
  uniform(value) as unknown as Uniform<number, F>;
const vec3_uniform = (value = new Vector3()) =>
  uniform(value) as unknown as Uniform<Vector3, V3>;
const vec4_uniform = () =>
  uniform(new Vector4()) as unknown as Uniform<Vector4, V4>;
const mat4_uniform = () =>
  uniform(new Matrix4()) as unknown as Uniform<Matrix4, M4>;

/**
 * A texture sampled through a Catmull–Rom spline rather than bilinearly, in
 * five bilinear taps (Jimenez 2016). Bilinear resampling every frame blurs a
 * history a little more each time, as it is kept; the spline passes through
 * the texels, so it does not.
 * @param source The texture
 * @param uv Where
 * @param size Its size in texels
 * @returns The sample, its weights normalised
 */
const catmull_rom = (source: TextureNode, uv: V2, size: V2): V4 => {
  const position = uv.mul(size);
  const centre = floor(position.sub(0.5)).add(0.5);
  const f = position.sub(centre);

  const w0 = f.mul(f.mul(f.mul(-0.5).add(1)).sub(0.5));
  const w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1);
  const w2 = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5));
  const w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));

  const w12 = w1.add(w2);
  const t0 = centre.sub(1).div(size);
  const t3 = centre.add(2).div(size);
  const t12 = centre.add(w2.div(w12)).div(size);

  const tap = (x: F, y: F, weight: F) => source.sample(vec2(x, y)).mul(weight);
  const weights = [
    w12.x.mul(w0.y),
    w0.x.mul(w12.y),
    w12.x.mul(w12.y),
    w3.x.mul(w12.y),
    w12.x.mul(w3.y),
  ] as F[];

  const sum = tap(t12.x as F, t0.y as F, weights[0])
    .add(tap(t0.x as F, t12.y as F, weights[1]))
    .add(tap(t12.x as F, t12.y as F, weights[2]))
    .add(tap(t3.x as F, t12.y as F, weights[3]))
    .add(tap(t12.x as F, t3.y as F, weights[4]));

  return sum
    .div(weights.reduce((a, b) => a.add(b) as F))
    .max(0) as unknown as V4;
};

/**
 * Henyey and Greenstein's phase function.
 * @param cosine The cosine of the scattering angle
 * @param asymmetry Its asymmetry
 * @returns Per steradian
 */
const henyey_greenstein = (cosine: F, asymmetry: F | number): F => {
  const g = typeof asymmetry === "number" ? float(asymmetry) : asymmetry;
  const gg = g.mul(g);

  return gg
    .oneMinus()
    .div(
      pow(gg.add(1).sub(g.mul(cosine).mul(2)).max(1e-4), 1.5).mul(4 * Math.PI),
    ) as F;
};

/**
 * Jendersie and d'Eon's fit to Mie scattering by droplets: physics.ts's
 * `mie`.
 * @param cosine The cosine of the scattering angle
 * @param phase Its fit: the HG lobe, Draine's g and α, Draine's weight
 * @returns Per steradian
 */
const mie = (cosine: F, phase: V4): F => {
  const g = phase.y;
  const alpha = phase.z;
  const draine = henyey_greenstein(cosine, g as F)
    .mul(alpha.mul(cosine).mul(cosine).add(1))
    .div(alpha.mul(g.mul(g).mul(2).add(1)).div(3).add(1));

  return mix(henyey_greenstein(cosine, phase.x as F), draine, phase.w) as F;
};

/**
 * The share of a diffuse light a slab lets through: medium.ts's `diffuse`.
 * @param depth Its optical depth
 * @returns 0 to 1
 */
const diffuse = (depth: F): F =>
  float(1).div(depth.mul(0.75 * (1 - DIFFUSE_ASYMMETRY)).add(1)) as F;

/**
 * The sun's light scattered many times at a point, per its extinction and
 * the sun's illuminance: medium.ts's `scattered_many`.
 * @param sun_depth The optical depth towards the sun
 * @param column_depth The optical depth of the cloud through the point
 * @returns Per steradian
 */
const scattered_many = (sun_depth: F, column_depth: F): F =>
  diffuse(column_depth)
    .oneMinus()
    .mul(diffuse(sun_depth))
    .div(Math.PI)
    .sub(exp(sun_depth.negate()).div(4 * Math.PI))
    .max(0) as F;

/**
 * Where the clouds are drawn, and how.
 */
export type CloudsOptions = {
  /** How finely: a quality's name, or its settings, or some of them */
  quality?: WeatherQualityName | Partial<WeatherQuality>;

  /**
   * The scene the other effects are drawn in. Inside a cloud they are drawn
   * in it, as a medium: each fades into the cloud with how far it is, where
   * the clouds alone would be drawn behind them whole
   */
  scene?: Object3D | null;
};

/**
 * The weather's clouds, drawn for a camera: a texture of their light,
 * premultiplied, and what lies behind them seen through it.
 *
 * Composite them with `over`, under whatever else is drawn into the frame:
 * as `volume_pass`'s `backdropNode`, so the plumes and the vapour are drawn
 * over the clouds, and see through them.
 */
export class CloudsNode extends TempNode {
  static get type(): string {
    return "CloudsNode";
  }

  readonly weather: Weather;
  readonly camera: Camera;
  quality: WeatherQuality;

  /** The scene the other effects are drawn in, to set the cloud's medium on */
  scene: Object3D | null;

  /** The cloud round the camera, as a medium, as of the last frame */
  readonly medium: SceneMedium = { extinction: 0, color: new Color() };

  // The clouds between the camera and each effect, for it to fade by
  #path: ScenePath;

  /** The scene's depth, to stop the rays at: set by `over` */
  depthNode: TextureNode | null = null;

  #march = new RenderTarget(1, 1, {
    count: 2,
    type: HalfFloatType,
    format: RGBAFormat,
    depthBuffer: false,
  });
  #history = [0, 1].map(
    () =>
      new RenderTarget(1, 1, {
        type: HalfFloatType,
        format: RGBAFormat,
        depthBuffer: false,
      }),
  );
  #current = 0;

  #march_material = new NodeMaterial();
  #resolve_material = new NodeMaterial();
  #quad = new QuadMesh(this.#march_material);
  #state = undefined as unknown as RendererUtils.RendererState;

  #noise: NoiseTextures | null = null;
  #table = create_half_texture(TABLE_SIZE, TABLE_ROW_COUNT, "clouds.water");
  #field: FieldNodes | null = null;
  #map_textures: readonly Texture[] | null = null;
  #far_textures: readonly Texture[] | null = null;
  #tick = 0;
  #version = -1;
  #empty = true;
  #last_time = 0;

  // The scene camera, as the passes' own quads see it
  #projection_inverse = mat4_uniform();
  #camera_world = mat4_uniform();
  #camera_position = vec3_uniform();
  #near = float_uniform(0.1);
  #far = float_uniform(1000);

  // Last frame's view projection, and how far the clouds moved past the
  // scene since
  #previous_view_projection = mat4_uniform();
  #moved = vec3_uniform();
  #had_history = float_uniform(0);
  #previous_origin = new Vector3();

  #resolution = uniform(new Vector2(1, 1)) as unknown as Uniform<Vector2, V2>;

  // The march's, a texel for every two by two of the resolution's, and which
  // of the four it marches this frame
  #march_resolution = uniform(new Vector2(1, 1)) as unknown as Uniform<
    Vector2,
    V2
  >;
  #offset = uniform(new Vector2()) as unknown as Uniform<Vector2, V2>;
  #pixel_angle = float_uniform(1e-3);
  #frame_index = float_uniform(0);

  // The shell the clouds fill, and the scene origin's altitude
  #altitude = float_uniform(0);
  #low = float_uniform(0);
  #high = float_uniform(0);

  // The look
  #sun_direction = vec3_uniform(new Vector3(0, 1, 0));
  #sun = vec3_uniform(new Vector3(1, 1, 1));
  #sky = vec3_uniform();
  #ground_light = vec3_uniform();
  #exposure = float_uniform(1);
  #haze_extinction = float_uniform(0);
  #ground = float_uniform(0);

  // Each droplet layer's Mie fit: the cumulus', the sheets', the altostratus'
  #phases = [vec4_uniform(), vec4_uniform(), vec4_uniform()];

  // The flashes: where, in the scene, and their light in the scene's units
  #lights = Array.from({ length: LIGHTS }, vec4_uniform);

  // The quality's
  #steps = uniform(96, "int") as unknown as Uniform<number, Node<"int">>;
  #far_steps = uniform(32, "int") as unknown as Uniform<number, Node<"int">>;
  #min_step = float_uniform(5);
  #shape = float_uniform(80_000);
  #range = float_uniform(500_000);
  #detail = float_uniform(8000);
  #blend = float_uniform(0.1);

  #texture_node: TextureNode;
  #march_info = texture(this.#march.textures[1]) as unknown as TextureNode;
  #history_node = texture(this.#history[0].texture) as unknown as TextureNode;

  /**
   * @param weather The weather
   * @param camera The camera it is seen from
   * @param options How finely
   */
  constructor(weather: Weather, camera: Camera, options: CloudsOptions = {}) {
    super("vec4");

    this.weather = weather;
    this.#path = weather_path(weather);
    this.camera = camera;
    this.quality = resolve_weather_quality(options.quality);
    this.scene = options.scene ?? null;
    this.updateBeforeType = NodeUpdateType.FRAME;

    this.#march.textures[0].name = "clouds.light";
    this.#march.textures[1].name = "clouds.depth";
    this.#march_material.name = "clouds.march";
    this.#resolve_material.name = "clouds.resolve";

    this.#texture_node = passTexture(
      this as unknown as Parameters<typeof passTexture>[0],
      this.#history[0].texture,
    ) as unknown as TextureNode;
  }

  /**
   * The clouds' light, premultiplied, at their own resolution.
   * @returns Its texture
   */
  getTextureNode(): TextureNode {
    return this.#texture_node;
  }

  /**
   * The clouds over what lies behind them: a scene's colour, seen through
   * them, stopped by its depth.
   * @param color What is behind
   * @param depth Its depth
   * @param airlight The light the air shows in front of a far cloud in its
   * place: by default what lies behind it, which has the air in it already.
   * A sky that draws its stars or its sun gives its own light without them,
   * or they would show through the cloud
   * @returns The two, composited
   */
  over(color: Node<"vec4">, depth: TextureNode, airlight?: Node<"vec3">): V4 {
    this.depthNode = depth;

    const clouds = this.#texture_node;
    const near = this.#near;
    const far = this.#far;
    const resolution = this.#resolution;

    const scene_z = (uv: V2): F =>
      perspectiveDepthToViewZ(depth.sample(uv).x, near, far) as F;

    return Fn(() => {
      const behind = vec4(color).toVar();
      const own = scene_z(screenUV as unknown as V2).toVar();

      // From the four texels round the pixel, each as far as its scene sits
      // at the pixel's own depth, so the clouds do not bleed over an edge
      const at = screenUV.mul(resolution).sub(0.5);
      const base = floor(at);
      const between = fract(at);
      const sum = vec4(0).toVar();
      const total = float(0).toVar();
      const weigh = (uv: V2, bilinear: F): F => {
        const apart = scene_z(uv)
          .sub(own)
          .abs()
          .div(own.abs().max(1e-3).mul(0.03));

        return bilinear.mul(exp2(apart.mul(apart).negate()).add(1e-4)) as F;
      };

      for (const [i, j] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const uv = base
          .add(vec2(i, j))
          .add(0.5)
          .div(resolution)
          .clamp(0, 1) as unknown as V2;
        const bilinear = (i === 1 ? between.x : between.x.oneMinus()).mul(
          j === 1 ? between.y : between.y.oneMinus(),
        ) as F;
        const weight = weigh(uv, bilinear);

        sum.addAssign(clouds.sample(uv).mul(weight));
        total.addAssign(weight);
      }

      const cloud = sum.div(total.max(1e-6));

      // The air before it, from the march's own texels round the pixel, as
      // the same: they are one texel in every four by four, this frame's
      const offset = this.#offset;
      const march_resolution = this.#march_resolution;
      const in_march = this.#march_uv(screenUV as unknown as V2)
        .mul(march_resolution)
        .sub(0.5);
      const march_base = floor(in_march);
      const march_between = fract(in_march);
      const air = float(0).toVar();
      const air_total = float(0).toVar();

      for (const [i, j] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const texel = march_base.add(vec2(i, j));
        const bilinear = (
          i === 1 ? march_between.x : march_between.x.oneMinus()
        ).mul(j === 1 ? march_between.y : march_between.y.oneMinus()) as F;
        const weight = weigh(
          texel
            .mul(UPSCALE)
            .add(offset)
            .add(0.5)
            .div(resolution)
            .clamp(0, 1) as V2,
          bilinear,
        );
        const uv = texel.add(0.5).div(march_resolution).clamp(0, 1);

        air.addAssign(this.#march_info.sample(uv).w.mul(weight));
        air_total.addAssign(weight);
      }

      // Behind the cloud as much as it hides, and in the air before it what
      // that air takes of it: a cloud the air has all taken is the air's own
      // light, by default what lies behind it
      const taken = cloud.a.mul(air.div(air_total.max(1e-6)).oneMinus());
      const shown = airlight ? vec3(airlight) : behind.rgb;

      return vec4(
        behind.rgb.mul(cloud.a.oneMinus()).add(cloud.rgb).add(shown.mul(taken)),
        behind.a,
      );
    })() as unknown as V4;
  }

  /**
   * The direction of the scene camera's ray through a point of the screen,
   * in the world.
   * @param uv The point
   * @returns The direction
   */
  #ray(uv: V2): V3 {
    const view = getViewPosition(uv, float(1), this.#projection_inverse);

    return this.#camera_world
      .mul(vec4(view, 0))
      .xyz.normalize() as unknown as V3;
  }

  /**
   * The resolve: this frame's rays over the last frames', where the cloud
   * they saw was.
   * @param depth_node The scene's depth
   * @returns Its fragment
   */
  #resolve(depth_node: TextureNode): V4 {
    return Fn(() => {
      const uv = screenUV as unknown as V2;
      const fresh = floor(screenCoordinate.xy)
        .add(UPSCALE)
        .sub(this.#offset)
        .mod(UPSCALE)
        .lessThan(vec2(0.5))
        .all();

      // How far the scene is here, as the march keeps it
      const depth = depth_node.sample(uv).x;
      const own = select(
        depth.lessThan(1),
        getViewPosition(uv, depth, this.#projection_inverse).length(),
        float(NOWHERE),
      )
        .min(this.#range)
        .toVar();

      // The march's four texels round this one, as a bilinear filter would
      // weigh them, each as far as its ray ended where this one's does: one
      // that stopped at an aircraft says nothing of the cloud beside it, out
      // to the ground. Of them, this frame's ray here; their spread, to keep
      // a stale history inside, their mean give or take its deviations
      // (Salvi 2016); and how far the cloud they saw is. Four, not the nine
      // round: they are texels four apart, as wide a neighbourhood as nine
      // a texel apart, at half the reads
      const at = this.#march_uv(uv)
        .mul(this.#march_resolution)
        .sub(0.5)
        .toVar();
      const corner = floor(at).toVar();
      const now = vec4(0).toVar();
      const now_total = float(0).toVar();
      const first = vec4(0).toVar();
      const second = vec4(0).toVar();
      const total = float(0).toVar();
      const cloud = float(0).toVar();
      const cloud_total = float(0).toVar();

      for (let j = 0; j <= 1; j++) {
        for (let i = 0; i <= 1; i++) {
          const texel = corner.add(vec2(i, j));
          const at_texel = ivec2(
            texel.clamp(vec2(0), this.#march_resolution.sub(1)),
          );
          const color = textureLoad(this.#march.textures[0], at_texel).toVar();
          const info = textureLoad(this.#march.textures[1], at_texel).toVar();
          const apart = info.y.sub(own).abs().div(own.mul(0.03).max(1));
          const alike = exp2(apart.mul(apart).negate()).add(1e-4);
          const tent = texel.sub(at).abs().oneMinus().max(0).toVar();
          const bilinear = tent.x.mul(tent.y).mul(alike);

          now.addAssign(color.mul(bilinear));
          now_total.addAssign(bilinear);
          first.addAssign(color.mul(alike));
          second.addAssign(color.mul(color).mul(alike));
          total.addAssign(alike);

          const seen = select(info.z.lessThan(0.999), bilinear, float(0));

          cloud.addAssign(info.x.mul(seen));
          cloud_total.addAssign(seen);
        }
      }

      now.divAssign(now_total.max(1e-6));

      const mean = first.div(total).toVar();
      const deviation = sqrt(second.div(total).sub(mean.mul(mean)).max(0)).mul(
        CLIP_DEVIATIONS,
      );

      // Where the cloud this texel saw is, and where it was on screen
      const distance = select(
        cloud_total.greaterThan(1e-6),
        cloud.div(cloud_total.max(1e-6)),
        this.#range,
      ) as F;
      const point = this.#camera_position.add(this.#ray(uv).mul(distance));
      const clip = this.#previous_view_projection.mul(
        vec4(point.add(this.#moved), 1),
      );
      const then_uv = clip.xy.div(clip.w).mul(vec2(0.5, -0.5)).add(0.5).toVar();

      const then = catmull_rom(
        this.#history_node,
        then_uv as unknown as V2,
        this.#resolution as unknown as V2,
      ).clamp(mean.sub(deviation), mean.add(deviation));
      const valid = then_uv
        .greaterThanEqual(vec2(0))
        .all()
        .and(then_uv.lessThanEqual(vec2(1)).all())
        .and(clip.w.greaterThan(0))
        .and(this.#had_history.greaterThan(0.5));

      // A marched texel's ray over its history; one not marched, its history
      // alone, kept inside what its neighbours see now. A texel's own ray
      // comes back once in sixteen frames: once the cloud moves a march texel
      // a frame, the history it was drawn from has gone by before then, and
      // the texel is this frame's rays between it, sharp or not
      const moved = then_uv
        .sub(uv)
        .mul(this.#resolution)
        .length()
        .div(UPSCALE)
        .saturate();
      const share = select(
        valid,
        mix(select(fresh, this.#blend, float(0)), float(1), moved),
        float(1),
      );

      return mix(then, now, share);
    })() as unknown as V4;
  }

  /**
   * Where in the march a point of the clouds' texture is: its texels are
   * one in every four by four of the clouds', this frame's of each block.
   * @param uv The point
   * @returns The point in the march
   */
  #march_uv(uv: V2): V2 {
    return uv
      .mul(this.#resolution)
      .sub(0.5)
      .sub(this.#offset)
      .div(UPSCALE)
      .add(0.5)
      .div(this.#march_resolution) as unknown as V2;
  }

  /**
   * The march's fragment.
   * @param depth_node The scene's depth
   * @param field The clouds' textures and where the scene is in them
   * @returns Its fragment
   */
  #march_fragment(depth_node: TextureNode, field: FieldNodes): Node {
    const altitude_of = (p: V3): F =>
      this.#altitude.add(p.y).add(dot(p.xz, p.xz).div(2 * EARTH_RADIUS_M)) as F;

    const marched = Fn(() => {
      // The texel of the clouds' this one marches this frame
      const pixel = floor(screenCoordinate.xy)
        .mul(UPSCALE)
        .add(this.#offset)
        .toVar();
      const uv = pixel.add(0.5).div(this.#resolution).toVar() as unknown as V2;
      const direction = this.#ray(uv).toVar();
      const eye = this.#camera_position;

      // How far the scene is along the ray
      const depth = depth_node.sample(uv).x;
      const scene = select(
        depth.lessThan(1),
        getViewPosition(uv, depth, this.#projection_inverse).length(),
        float(NOWHERE),
      );

      // The shell of air the clouds fill, round the earth's curve: spheres
      // about the earth's centre, under the scene's origin. Their c, the
      // eye's distance from the centre squared less the shell's radius
      // squared, is formed from altitudes, which a float holds finely
      const centre_up = this.#altitude.add(EARTH_RADIUS_M);
      const f_y = eye.y.add(centre_up);
      const b = dot(vec3(eye.x, f_y, eye.z), direction);
      const eye_altitude = altitude_of(eye).toVar();

      const shell = (height: F) => {
        const c = eye_altitude
          .sub(height)
          .mul(eye_altitude.add(height).add(2 * EARTH_RADIUS_M));
        const discriminant = b.mul(b).sub(c);
        const root = sqrt(discriminant.max(0));

        return {
          hit: discriminant.greaterThanEqual(0),
          near: b.negate().sub(root),
          far: b.negate().add(root),
        };
      };

      const low = shell(this.#low);
      const high = shell(this.#high);

      // Above, in through the top; below, through the bottom; inside, from
      // the eye. Out through the bottom if the ray looks down to it, or else
      // the top. Chosen by select: an If's Else after an ElseIf is lost
      const above = eye_altitude.greaterThan(this.#high);
      const below = eye_altitude.lessThan(this.#low);
      const out = select(
        low.hit.and(low.near.greaterThan(0)),
        low.near,
        high.far,
      );

      const start = select(
        above,
        select(high.hit, high.near, float(NOWHERE)),
        select(below, low.far, float(0)),
      )
        .max(0)
        .toVar();
      const end = min(select(below, high.far, out), scene, this.#range).toVar();

      // Per ray: the phase of each kind of scatterer towards the eye
      const cosine = dot(direction, this.#sun_direction).toVar();
      const ice_phase = henyey_greenstein(cosine, ICE_ASYMMETRY).toVar();
      const rain_phase = henyey_greenstein(cosine, RAIN_ASYMMETRY).toVar();
      const water_phases = vec3(
        mie(cosine, this.#phases[0]),
        mie(cosine, this.#phases[1]),
        mie(cosine, this.#phases[2]),
      ).toVar();

      const light = vec3(0).toVar();
      const through = float(1).toVar();
      const front = float(0).toVar();
      const seen = float(0).toVar();

      // Where in its step each sample is, somewhere different each time: a
      // hash's white noise, not a gradient's, whose lines show where the
      // history is let go. Each time the texel is marched on by the golden
      // ratio, so its samples spread evenly along its steps over the frames
      const seed = pixel.x.add(pixel.y.mul(4099)).toVar();
      const jitter = hash(seed)
        .add(floor(this.#frame_index.div(ORDER.length)).mul(GOLDEN_RATIO - 1))
        .fract();

      // Where the clouds' shapes hand over to their mean: somewhere over the
      // last of `shapeM`, different each frame and texel
      const handoff = this.#shape
        .mul(
          hash(seed.add(this.#frame_index.mul(7919)).add(0.5))
            .mul(HANDOFF)
            .oneMinus(),
        )
        .toVar();

      // The sun through the cloud towards a point, marched:
      // in steps each twice the last; or, coarse, where the detail does not
      // wear the cloud for its first metres' shading to show, in half as
      // many each four times the last, as far
      const light_march = (p: V3, coarse: Node<"bool">): F => {
        const sun_depth = float(0).toVar();
        const along = float(0).toVar();
        const growth = select(coarse, float(2), float(1));
        const first = select(
          coarse,
          float((LIGHT_REACH_M * 3) / (4 ** (LIGHT_STEPS / 2) - 1)),
          float(LIGHT_FIRST_M),
        );
        const count = select(coarse, int(LIGHT_STEPS / 2), int(LIGHT_STEPS));

        Loop(count, ({ i }: { i: Node<"int"> }) => {
          const size = exp2(float(i).mul(growth)).mul(first);
          const q = p
            .add(this.#sun_direction.mul(along.add(size.mul(0.5))))
            .toVar();
          const there = cloud_at(
            field,
            q as unknown as V3,
            altitude_of(q as unknown as V3),
            map_column(field, q.xz as unknown as V2),
            null,
            false,
          );

          sun_depth.addAssign(
            there.water.x
              .add(there.water.y)
              .add(there.water.z)
              .add(there.ice)
              .add(there.rain)
              .mul(size),
          );
          along.addAssign(size);
        });

        return sun_depth;
      };

      // A walk from one distance to another in some steps: near, through the
      // clouds' shapes, the sun marched; far, through their mean
      const walk = (
        from: F,
        to: F,
        count: Uniform<number, Node<"int">>,
        mean: boolean,
      ) => {
        const t = from.toVar();
        const taken = float(0).toVar();
        const steps = float(count);

        Loop(count, () => {
          If(t.greaterThanEqual(to).or(through.lessThan(OPAQUE)), () => {
            Break();
          });

          // A pixel's footprint, or, if longer, the shortest step that still
          // reaches the end in the steps left: a ray cut short is a cloud
          // seen through, where a long step is only a coarser one, its light
          // integrated over it all the same. The steps left grow by a
          // constant ratio, short near the eye and long far off, and a ray
          // far longer than its neighbour, over the horizon, steps near the
          // eye almost as it does
          const left = steps.sub(taken).max(1);
          const near = t.add(STEPS_FROM_M);
          const enough = near.mul(
            pow(to.add(STEPS_FROM_M).div(near), left.reciprocal()).sub(1),
          );
          const step = max(t.mul(this.#pixel_angle), this.#min_step, enough)
            .min(to.sub(t))
            .toVar();

          taken.addAssign(1);

          const p = eye.add(direction.mul(t.add(step.mul(jitter)))).toVar();
          const altitude = altitude_of(p).toVar();
          const column = map_column(field, p.xz as unknown as V2, mean);

          // The detail, faded out towards the end of its reach
          const detail_share = mean
            ? null
            : (this.#detail
                .sub(t)
                .div(this.#detail.mul(DETAIL_FADE))
                .clamp(0, 1) as F);
          const cloud = cloud_at(
            field,
            p,
            altitude,
            column,
            detail_share,
            true,
            mean,
          );
          const sigma = cloud.water.x
            .add(cloud.water.y)
            .add(cloud.water.z)
            .add(cloud.ice)
            .add(cloud.rain)
            .toVar();

          If(sigma.greaterThan(0), () => {
            // The sun through the cloud towards it. Far off, through the
            // layer over the point, slanted to the sun, as far as the light
            // march would have reached
            const sun_depth = mean
              ? (cloud.up
                  .div(this.#sun_direction.y.max(1e-3))
                  .min(sigma.mul(LIGHT_REACH_M))
                  .toVar() as unknown as F)
              : light_march(
                  p as unknown as V3,
                  (detail_share as F).lessThan(jitter),
                );

            // Scattered once, by each scatterer's phase, and many times, as
            // the diffuse light the cloud holds
            const sunlit = dot(cloud.water, water_phases)
              .add(cloud.ice.mul(ice_phase))
              .add(cloud.rain.mul(rain_phase))
              .mul(exp(sun_depth.negate()))
              .add(
                sigma.mul(scattered_many(sun_depth, cloud.up.add(cloud.down))),
              )
              .toVar();

            // The sky's and the ground's, each half the sphere, through the
            // cloud over and under
            const ambient = this.#sky
              .mul(diffuse(cloud.up))
              .add(this.#ground_light.mul(diffuse(cloud.down)))
              .mul(0.5 * ALBEDO)
              .mul(sigma);

            // The flashes': each its light over 4π r², through the cloud
            // between as a diffuse light, scattered every way alike
            const flashes = float(0).toVar();

            for (const flash of this.#lights) {
              If(flash.w.greaterThan(0), () => {
                const apart = flash.xyz.sub(p);
                const r2 = dot(apart, apart).max(1e4);
                const between = sigma
                  .sub(cloud.rain)
                  .add(cloud.rainMean)
                  .mul(sqrt(r2))
                  .mul(LIGHTNING_PATH_SHARE);

                flashes.addAssign(
                  flash.w
                    .div(r2.mul(4 * Math.PI))
                    .mul(diffuse(between as F))
                    .mul(sigma.div(4 * Math.PI)),
                );
              });
            }

            const source = this.#sun
              .mul(sunlit.mul(ALBEDO))
              .add(ambient)
              .add(vec3(flashes.mul(ALBEDO)));

            // Hillaire's integration over the step
            const kept = exp(sigma.mul(step).negate());
            const lost = through.mul(kept.oneMinus());

            light.addAssign(
              source.mul(kept.oneMinus()).div(sigma).mul(through),
            );
            front.addAssign(t.add(step.mul(0.5)).mul(lost));
            seen.addAssign(lost);
            through.mulAssign(kept);
          });

          t.addAssign(step);
        });
      };

      // Through the shapes to the handoff, then through their mean. Far off
      // a step is kilometres long, through many billows and the gaps between:
      // their mean's extinction over it dims the ray more than they would,
      // gaps and all, but at that distance a layer is seen edge on, through
      // so much cloud that it is all but opaque either way
      walk(start, min(end, handoff) as F, this.#steps, false);
      walk(max(start, handoff) as F, end, this.#far_steps, true);

      const distance = select(
        seen.greaterThan(0),
        front.div(seen.max(1e-6)),
        float(NOWHERE),
      );
      const alpha = through.oneMinus();

      // The air between the eye and the cloud: Koschmieder's, faded towards
      // the horizon's light. Its extinction is the visibility's at the
      // ground, thinning with height as the aerosols do, so from above the
      // haze the clouds under it are seen clearly. Along a ray from h₀ at μ
      // up, over d, its optical depth is σ₀ e^(−h₀/H) d (1 − e^(−x)) / x,
      // x = μ d / H. A sunlit cloud is brighter than the horizon, so it is
      // still seen past the visibility, where a black one is not, and the
      // march's range would cut it off there, a line along the far cloud.
      // So the air lets nothing through by the range: less what it lets
      // through there, made up to one again. There along the level or the
      // ray's own path to its end, whichever holds more haze: a ray climbing
      // out of the haze is through nearly all of its own within a few
      // kilometres, and measured against its own it would turn every cloud
      // past them to haze; one looking down into it from above meets more
      // than the level there holds, and measured against the level every
      // cloud under it would be haze
      const at_eye = this.#haze_extinction.mul(
        exp(eye_altitude.sub(this.#ground).max(0).div(-AEROSOL_SCALE_M)),
      );
      const optical_depth = (d: F): F => {
        const x = direction.y.mul(d).div(AEROSOL_SCALE_M).max(-60);
        const spread = select(
          x.abs().lessThan(1e-3),
          x.mul(-0.5).add(1),
          exp(x.negate()).oneMinus().div(x),
        );

        return at_eye.mul(d).mul(spread) as F;
      };
      const to_range = max(
        at_eye.mul(this.#range),
        optical_depth(scene.min(this.#range) as F),
      ).toVar();
      const to_cloud = optical_depth(distance.min(this.#range) as F);
      const at_range = exp(to_range.negate());
      const air = select(
        this.#haze_extinction.greaterThan(0),
        select(
          to_range.lessThan(1e-3),
          to_cloud.div(to_range.max(1e-12)).oneMinus(),
          exp(to_cloud.negate()).sub(at_range).div(at_range.oneMinus()),
        ).max(0),
        float(1),
      );
      // What the air takes it fades to what lies behind it along the ray,
      // when it is composited: the air's own light, its whole path's, as
      // far as it goes, the sky behind or the scene in its own air
      const color = light.mul(air).mul(this.#exposure);

      return MARCHED(
        vec4(color, alpha),
        vec4(distance, scene.min(this.#range), through, air),
      );
    })() as unknown as { toConst: () => { get: (name: string) => V4 } };

    // The fragment's outputs must be its last node, so the march hands them
    // back in a struct
    const result = marched.toConst();

    return outputStruct(result.get("color"), result.get("info"));
  }

  /**
   * Bring the textures, the uniforms and the shader up to the weather.
   * @param renderer The renderer
   * @param depth The scene's depth
   */
  #update_weather(renderer: Renderer, depth: TextureNode): void {
    const weather = this.weather;
    const quality = this.quality;

    weather.resize_map(quality.mapSize, quality.mapExtentM);
    weather.resize_far_map(quality.farMapSize, quality.farMapExtentM);

    // The noise: one tile for every seed, baked once
    if (!this.#noise) {
      this.#noise = create_noise_textures();
      this.#noise.bake(renderer, SHAPE_SALT, DETAIL_SALT);
    }

    // The water table and the droplets' phases, for the climate
    if (weather.version !== this.#version) {
      this.#version = weather.version;

      const table = weather.table;

      this.#table.write(table);

      const air_mass = weather.climate.airMass;

      // Each layer's droplets at a typical height in it, a kilometre into a
      // cumulus and a few hundred metres into a sheet: their water from the
      // table, their size from it (Martin et al. 1994)
      const coefficient = (row: number, height: number) =>
        table_at(table, row, height, 0);
      const rows = [
        [TABLE_ROWS.cumulus, 1000],
        [TABLE_ROWS.stratus, 300],
        [TABLE_ROWS.alto, 500],
      ] as const;

      for (const [index, [row, height]] of rows.entries()) {
        // σ = C W^⅔, so W = (σ / C)^1.5 for the coefficient at d = 1
        const sigma = coefficient(row, height);
        const lwc = droplet_water(sigma, air_mass);
        const phase = mie_phase(2 * effective_radius(lwc, air_mass));

        this.#phases[index].value.set(
          phase.hg,
          phase.draine,
          phase.alpha,
          phase.weight,
        );
      }
    }

    // The shader, for the maps' textures
    const { map, farMap } = weather;

    if (
      this.#map_textures !== map.textures ||
      this.#far_textures !== farMap.textures ||
      !this.#field
    ) {
      this.#map_textures = map.textures;
      this.#far_textures = farMap.textures;
      this.#field = create_field_nodes({
        shape: this.#noise.shape.texture,
        detail: this.#noise.detail.texture,
        table: this.#table.texture,
        map: map.textures,
        far: farMap.textures,
      });
      this.#march_material.fragmentNode = this.#march_fragment(
        depth,
        this.#field,
      ) as unknown as V4;
      this.#march_material.needsUpdate = true;
      this.#resolve_material.fragmentNode = this.#resolve(depth);
      this.#resolve_material.needsUpdate = true;
    }

    // Where the scene is in the air
    update_field_nodes(
      this.#field,
      weather.air_at(0, 0),
      weather.origin[1],
      weather.climate,
      weather.shapes,
      map.frame,
      farMap.frame,
    );

    // The shell the clouds fill, in either map: down to the ground under any
    // rain, up to the cirrus or the tropopause over any ice, or a storm's top
    // over it
    const { climate } = weather;
    const shown = [map, farMap].filter(
      (m) => m.frame && Number.isFinite(m.bounds.lowM),
    );

    this.#empty = shown.length === 0;

    const rain = shown.some((m) => m.bounds.rain);
    const low = rain
      ? climate.groundM
      : Math.min(...shown.map((m) => m.bounds.lowM));
    const high = Math.max(...shown.map((m) => m.bounds.highM));
    let overshot = 0;

    for (const cell of weather.cells) {
      overshot = Math.max(overshot, overshoot(cell));
    }

    const ceiling = Math.max(
      climate.cirrusBaseM + climate.cirrusDepthM,
      climate.tropopauseM + overshot,
    );

    this.#low.value = Number.isFinite(low) ? Math.floor(low) : 0;
    this.#ground.value = climate.groundM;
    this.#high.value = this.#empty ? 0 : Math.ceil(Math.min(high, ceiling));
  }

  /**
   * Draw the clouds for the frame.
   * @param frame The frame
   */
  updateBefore(frame: NodeFrame): boolean | undefined {
    const renderer = frame.renderer as unknown as Renderer;
    const depth = this.depthNode;

    if (!renderer || !depth) return;

    this.#state = RendererUtils.resetRendererState(renderer, this.#state);

    const camera = this.camera as PerspectiveCamera;

    camera.updateMatrixWorld();
    this.#camera_position.value.setFromMatrixPosition(camera.matrixWorld);

    const { weather } = this;

    // The map is baked round the camera, and the thunder heard there
    const { x, y, z } = this.#camera_position.value;

    weather.listener[0] = x;
    weather.listener[1] = y;
    weather.listener[2] = z;

    this.#update_weather(renderer, depth);

    // The size: the drawing buffer's, scaled
    const quality = this.quality;
    const size = renderer.getDrawingBufferSize(scratch_size);
    const width = Math.max(Math.round(size.x * quality.resolutionScale), 1);
    const height = Math.max(Math.round(size.y * quality.resolutionScale), 1);

    const march_width = Math.ceil(width / UPSCALE);
    const march_height = Math.ceil(height / UPSCALE);

    if (
      this.#history[0].width !== width ||
      this.#history[0].height !== height
    ) {
      this.#march.setSize(march_width, march_height);

      for (const target of this.#history) target.setSize(width, height);

      this.#had_history.value = 0;
    }

    this.#resolution.value.set(width, height);
    this.#march_resolution.value.set(march_width, march_height);

    // Which texel of each block is marched
    const [ox, oy] = ORDER[this.#tick++ % ORDER.length];

    this.#offset.value.set(ox, oy);

    // The camera
    this.#projection_inverse.value.copy(camera.projectionMatrixInverse);
    this.#camera_world.value.copy(camera.matrixWorld);
    this.#near.value = camera.near;
    this.#far.value = camera.far;
    this.#pixel_angle.value =
      2 / (camera.projectionMatrix.elements[5] * height);

    // The look and the quality
    const { look } = weather;

    this.#altitude.value = weather.origin[1];
    this.#sun_direction.value.fromArray(look.sunDirection).normalize();
    this.#sun.value.fromArray(look.sun);
    this.#sky.value.fromArray(look.sky);
    this.#ground_light.value.fromArray(look.ground);
    this.#exposure.value = look.exposure;
    this.#haze_extinction.value =
      look.visibilityM > 0 ? KOSCHMIEDER / look.visibilityM : 0;

    this.#steps.value = quality.steps;
    this.#far_steps.value = quality.farSteps;
    this.#min_step.value = quality.minStepM;
    this.#shape.value = quality.shapeM;
    this.#range.value = quality.rangeM;
    this.#detail.value = quality.detailM;
    // A texel's ray, each time it is marched, is blended over its history by
    // the quality's share: a ray samples its steps at one place along each,
    // through billows smaller than they are, and alone it is grain. Takram's
    // upscale keeps it whole, its rays smoother than these; here a texel is
    // the mean of its last 2 / blend − 1 rays, nineteen at a tenth, which the
    // clip lets go of as soon as its neighbours see something else
    this.#blend.value = quality.blend;
    this.#frame_index.value =
      (this.#frame_index.value + 1) % (64 * ORDER.length);

    // The flashes, brightest first, in the scene
    const lux = look_lux(look);
    const flashes = weather.lightning.brightest(weather.time, LIGHTS);

    for (const [index, light] of this.#lights.entries()) {
      const flash = flashes[index];

      if (!flash) {
        light.value.set(0, 0, 0, 0);
        continue;
      }

      const [px, py, pz] = weather.to_scene(...flash.flash.centre);

      light.value.set(px, py, pz, flash.powerW * LIGHTNING_EFFICACY * lux);
    }

    // How far the clouds moved past the scene since the last frame: the
    // scene through the air, less the wind carrying them
    const origin = scratch_origin.fromArray(weather.origin);
    const elapsed = weather.time - this.#last_time;
    const [wx, wz] = weather.climate.wind;

    this.#moved.value.subVectors(origin, this.#previous_origin);
    this.#moved.value.x -= wx * elapsed;
    this.#moved.value.z -= wz * elapsed;
    this.#previous_origin.copy(origin);
    this.#last_time = weather.time;

    // The cloud round the camera, for the effects drawn in it: a frame late
    // for any drawn before the clouds, a frame's flight not to be seen
    weather_medium(weather, x, y, z, this.medium);

    if (this.scene) {
      set_scene_medium(
        this.scene,
        this.medium.extinction > 0 ? this.medium : null,
      );
      set_scene_path(this.scene, this.#path);
    }

    const read = this.#history[this.#current];
    const write = this.#history[1 - this.#current];

    if (this.#empty) {
      // No cloud: nothing to march, and no history to keep
      renderer.setRenderTarget(write);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      this.#had_history.value = 0;
    } else {
      renderer.setRenderTarget(this.#march);
      this.#quad.material = this.#march_material;
      this.#quad.render(renderer);

      // Resolve into one history, from the other
      this.#history_node.value = read.texture;
      renderer.setRenderTarget(write);
      this.#quad.material = this.#resolve_material;
      this.#quad.render(renderer);
      this.#had_history.value = 1;
    }

    this.#texture_node.value = write.texture;
    this.#current = 1 - this.#current;

    this.#previous_view_projection.value.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );

    RendererUtils.restoreRendererState(renderer, this.#state);
  }

  /**
   * @param builder The builder
   * @returns The clouds' texture
   */
  setup(builder: NodeBuilder): Node {
    void builder;

    return this.#texture_node;
  }

  dispose(): void {
    if (this.scene) {
      set_scene_medium(this.scene, null);
      set_scene_path(this.scene, null);
    }

    this.#march.dispose();

    for (const target of this.#history) target.dispose();

    this.#march_material.dispose();
    this.#resolve_material.dispose();
    this.#noise?.dispose();
    this.#table.texture.dispose();

    super.dispose();
  }
}

/**
 * The liquid water whose droplets' extinction, at a density of one, is a
 * table's coefficient: σ = C W^⅔, so W = (σ / C)^1.5.
 * @param sigma The coefficient, per metre
 * @param air_mass What the droplets formed on
 * @returns kg/m³
 */
const droplet_water = (sigma: number, air_mass: AirMass): number => {
  const c = droplet_coefficient(air_mass);

  return c > 0 ? (sigma / c) ** 1.5 : 0;
};

/**
 * The weather's clouds, for a camera.
 * @param weather The weather
 * @param camera The camera
 * @param options How finely
 * @returns Their node: composite them with `over`
 */
export const clouds = (
  weather: Weather,
  camera: Camera,
  options?: CloudsOptions,
): CloudsNode => new CloudsNode(weather, camera, options);
