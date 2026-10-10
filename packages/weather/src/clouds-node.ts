import {
  HalfFloatType,
  Matrix4,
  type Camera,
  type PerspectiveCamera,
  RenderTarget,
  RGBAFormat,
  type Texture,
  Vector2,
  Vector3,
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
  If,
  int,
  interleavedGradientNoise,
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
import { KOSCHMIEDER } from "@aeronautic/core";
import {
  EARTH_RADIUS_M,
  noise_salts,
  TABLE_SIZE,
  type ResolvedLayer,
} from "./field";
import { bake_map, layer_has_map, type MapFrame } from "./map";
import { ICE_ASYMMETRY, RAIN_ASYMMETRY } from "./microphysics";
import {
  create_half_texture,
  create_noise_textures,
  type NoiseTextures,
} from "./textures";
import {
  create_layer_nodes,
  detail_noise,
  layer_column,
  layer_density,
  layer_extinction,
  layer_key,
  layer_occupied,
  noise_coordinates,
  shape_noise,
  update_layer_nodes,
  type LayerNodes,
} from "./tsl/field";
import {
  resolve_weather_quality,
  type WeatherQuality,
  type WeatherQualityName,
} from "./types";
import type { Weather } from "./weather";

// The clouds, raymarched at a reduced resolution and resolved over the frames
//
// Each frame, a ray a texel: through the shell of air the layers fill, round
// the earth's curve, stopping at the scene and at the range. It strides over
// clear air, and steps back and walks finely once it meets cloud, as finely as
// a pixel's footprint there. At each step in cloud: the droplets', the ice's
// and the rain's extinction, from the layer's water and its column; the sun
// through the cloud towards it, in six steps each twice the last; the sky
// above and the ground below through the cloud over and under; Mie's phase
// for the droplets' size, and the light scattered many times over as the
// two-stream approximation has it. The
// step's light is integrated as Hillaire has it, so a long step loses no
// energy.
//
// The ray starts at a different place along its first step every frame, and
// the frames are blended: each texel's last value is found where the cloud it
// saw was the frame before, and kept unless it strays outside what the
// texel's neighbours see now

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;
type M4 = Node<"mat4">;

/** What a step in cloud keeps of its light, the rest scattered on */
const ALBEDO = 1;

// The droplets' asymmetry averaged over the visible, for the diffuse light:
// about 0.85 (Hansen and Travis 1974)
const DIFFUSE_ASYMMETRY = 0.85;

// The light march: six steps, the first 30 m, each twice the last, so 1.9 km
// of cloud towards the sun, the near cloud finely
const LIGHT_STEPS = 6;
const LIGHT_FIRST_M = 30;

// Below this transmittance, a ray has nothing left to see through
const OPAQUE = 0.01;

// How many empty steps a ray walks finely after cloud before it strides again
const FINE_STEPS = 8;

// Fine steps against coarse: a coarse step strides this many fine ones
const COARSE_STRIDE = 4;

// What a ray hands back: its light and its alpha, and where it saw cloud,
// where the scene was, and what it saw through
const MARCHED = struct({ color: "vec4", info: "vec4" }, "CloudsMarched");

// The scene's depth of nothing: the sky
const NOWHERE = 1e9;

type FloatUniform = Node<"float"> & { value: number };

const float_uniform = (value = 0): FloatUniform =>
  uniform(value) as unknown as FloatUniform;

/**
 * Henyey and Greenstein's phase function.
 * @param cosine The cosine of the scattering angle
 * @param g Its asymmetry
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
 * Jendersie and d'Eon's fit to Mie scattering by droplets: Henyey–Greenstein
 * and Draine, mixed.
 * @param cosine The cosine of the scattering angle
 * @param phase Its fit: the HG lobe, Draine's g and α, Draine's weight
 * @returns Per steradian
 */
const mie = (cosine: F, phase: V4): F => {
  const g = phase.y;
  const alpha = phase.z;
  const draine = henyey_greenstein(cosine, g)
    .mul(alpha.mul(cosine).mul(cosine).add(1))
    .div(alpha.mul(g.mul(g).mul(2).add(1)).div(3).add(1));

  return mix(henyey_greenstein(cosine, phase.x), draine, phase.w) as F;
};

/**
 * Where the clouds are drawn, and how.
 */
export type CloudsOptions = {
  /** How finely: a quality's name, or its settings, or some of them */
  quality?: WeatherQualityName | Partial<WeatherQuality>;
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
  #salts = [-1, -1];

  #version = -1;
  #key = "";
  #layers: ResolvedLayer[] = [];
  #nodes: LayerNodes[] = [];
  #maps: (ReturnType<typeof create_half_texture> | null)[] = [];
  #frames: (MapFrame | null)[] = [];
  #table: ReturnType<typeof create_half_texture> | null = null;
  #built = false;

  // The scene camera, as the passes' own quads see it
  #projection_inverse = uniform(new Matrix4()) as unknown as M4 & {
    value: Matrix4;
  };
  #camera_world = uniform(new Matrix4()) as unknown as M4 & {
    value: Matrix4;
  };
  #camera_position = uniform(new Vector3()) as unknown as V3 & {
    value: Vector3;
  };
  #near = float_uniform(0.1);
  #far = float_uniform(1000);

  // Last frame's view projection, and how far the weather moved past the
  // scene since
  #previous_view_projection = uniform(new Matrix4()) as unknown as M4 & {
    value: Matrix4;
  };
  #moved = uniform(new Vector3()) as unknown as V3 & { value: Vector3 };
  #had_history = float_uniform(0);
  #previous_origin = new Vector3();

  #resolution = uniform(new Vector2(1, 1)) as unknown as V2 & {
    value: Vector2;
  };
  #pixel_angle = float_uniform(1e-3);
  #frame_index = float_uniform(0);

  // The weather's day and look
  #altitude = float_uniform(0);
  #ground = float_uniform(0);
  #low = float_uniform(0);
  #high = float_uniform(0);
  #sun_direction = uniform(new Vector3(0, 1, 0)) as unknown as V3 & {
    value: Vector3;
  };
  #sun = uniform(new Vector3(1, 1, 1)) as unknown as V3 & { value: Vector3 };
  #sky = uniform(new Vector3()) as unknown as V3 & { value: Vector3 };
  #ground_light = uniform(new Vector3()) as unknown as V3 & {
    value: Vector3;
  };
  #exposure = float_uniform(1);
  #haze = uniform(new Vector3()) as unknown as V3 & { value: Vector3 };
  #haze_extinction = float_uniform(0);

  // The quality's
  #steps = uniform(96, "int") as unknown as Node<"int"> & { value: number };
  #min_step = float_uniform(5);
  #max_step = float_uniform(400);
  #range = float_uniform(80_000);
  #blend = float_uniform(0.1);

  #texture_node: TextureNode;
  #march_color = texture(this.#march.textures[0]) as unknown as TextureNode;
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
    this.camera = camera;
    this.quality = resolve_weather_quality(options.quality);
    this.updateBeforeType = NodeUpdateType.FRAME;

    this.#march.textures[0].name = "clouds.light";
    this.#march.textures[1].name = "clouds.depth";
    this.#march_material.name = "clouds.march";
    this.#resolve_material.name = "clouds.resolve";

    this.#texture_node = passTexture(
      this as unknown as Parameters<typeof passTexture>[0],
      this.#history[0].texture,
    ) as unknown as TextureNode;

    this.#resolve_material.fragmentNode = this.#resolve();
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
   * @returns The two, composited
   */
  over(color: Node<"vec4">, depth: TextureNode): V4 {
    this.depthNode = depth;

    const clouds = this.#texture_node;
    const near = this.#near;
    const far = this.#far;
    const resolution = this.#resolution;

    const scene_z = (uv: V2): F =>
      perspectiveDepthToViewZ(depth.sample(uv).x, near, far) as F;

    return Fn(() => {
      // The scene first, so it is drawn before the clouds read its depth
      const behind = vec4(color).toVar();
      const own = scene_z(screenUV as unknown as V2).toVar();

      // As volume_pass upsamples: from the four texels round the pixel,
      // each as far as its scene sits at the pixel's own depth
      const at = screenUV.mul(resolution).sub(0.5);
      const base = floor(at);
      const between = fract(at);
      const sum = vec4(0).toVar();
      const total = float(0).toVar();

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
        );
        const apart = scene_z(uv)
          .sub(own)
          .abs()
          .div(own.abs().max(1e-3).mul(0.03));
        const weight = bilinear.mul(exp2(apart.mul(apart).negate()).add(1e-4));

        sum.addAssign(clouds.sample(uv).mul(weight));
        total.addAssign(weight);
      }

      const cloud = sum.div(total.max(1e-6));

      return vec4(behind.rgb.mul(cloud.a.oneMinus()).add(cloud.rgb), behind.a);
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
   * @returns Its fragment
   */
  #resolve(): V4 {
    return Fn(() => {
      const uv = screenUV as unknown as V2;
      const now = this.#march_color.sample(uv).toVar();
      const info = this.#march_info.sample(uv);

      // Where the cloud this texel saw is, and where it was on screen
      const distance = select(info.z.lessThan(0.999), info.x, this.#range) as F;
      const point = this.#camera_position.add(this.#ray(uv).mul(distance));
      const clip = this.#previous_view_projection.mul(
        vec4(point.add(this.#moved), 1),
      );
      const then_uv = clip.xy.div(clip.w).mul(vec2(0.5, -0.5)).add(0.5).toVar();

      // The neighbourhood's range, to keep a stale history inside
      const texel = vec2(1).div(this.#resolution);
      const low = now.toVar();
      const high = now.toVar();

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if (i === 0 && j === 0) continue;

          const near = this.#march_color.sample(uv.add(texel.mul(vec2(i, j))));

          low.assign(min(low, near));
          high.assign(max(high, near));
        }
      }

      const then = this.#history_node.sample(then_uv).clamp(low, high);
      const valid = then_uv
        .greaterThanEqual(vec2(0))
        .all()
        .and(then_uv.lessThanEqual(vec2(1)).all())
        .and(clip.w.greaterThan(0))
        .and(this.#had_history.greaterThan(0.5));

      return mix(now, then, select(valid, this.#blend.oneMinus(), float(0)));
    })() as unknown as V4;
  }

  /**
   * The march's fragment, for the layers as they are.
   * @param depth_node The scene's depth
   * @param shape The shape noise
   * @param detail The detail noise
   * @param table The water table
   * @returns Its fragment
   */
  #march_fragment(
    depth_node: TextureNode,
    shape: Texture,
    detail: Texture,
    table: Texture,
  ): Node {
    const layers = this.#layers;
    const nodes = this.#nodes;
    const count = layers.length;

    if (count === 0) {
      return outputStruct(vec4(0), vec4(NOWHERE, NOWHERE, 1, 0));
    }

    const altitude_of = (p: V3): F =>
      this.#altitude.add(p.y).add(dot(p.xz, p.xz).div(2 * EARTH_RADIUS_M)) as F;

    const marched = Fn(() => {
      const uv = screenUV as unknown as V2;
      const direction = this.#ray(uv).toVar();
      const eye = this.#camera_position;

      // How far the scene is along the ray
      const depth = depth_node.sample(uv).x;
      const scene = select(
        depth.lessThan(1),
        getViewPosition(uv, depth, this.#projection_inverse).length(),
        float(NOWHERE),
      );

      // The shell of air the layers fill, round the earth's curve: spheres
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
      const water_phases = nodes.map((layer) =>
        mie(cosine, layer.phase).toVar(),
      );

      // The air at a point: its extinction, how much of it is the cloud's
      // droplets and ice, and, when lit, its scattering weighted by each
      // scatterer's phase, and the cloud over it and under it
      const field = (
        p: V3,
        fine: boolean,
        sigma: F,
        dense: F | null,
        lit: { phased: F; up: F; down: F } | null,
      ) => {
        const altitude = altitude_of(p).toVar();

        for (const [index, layer] of nodes.entries()) {
          const resolved = layers[index];
          const lowest = layer_has_map(resolved) ? this.#ground : layer.base;

          If(
            altitude.greaterThan(lowest).and(altitude.lessThan(layer.top)),
            () => {
              const { column, air } = layer_column(
                layer,
                resolved,
                p.xz as unknown as V2,
              );

              If(layer_occupied(layer, column, altitude, this.#ground), () => {
                const at = noise_coordinates(layer, air, altitude);
                const worn = shape_noise(shape as never, at.shape);
                const fray = fine
                  ? detail_noise(detail as never, at.detail)
                  : float(1);
                const density = layer_density(
                  layer,
                  column,
                  altitude,
                  worn,
                  fray as F,
                );
                const extinction = layer_extinction(
                  layer,
                  table,
                  count,
                  column,
                  altitude,
                  select(
                    altitude.greaterThanEqual(layer.base),
                    density,
                    float(0),
                  ) as F,
                  this.#ground,
                ).toVar();
                const here = extinction.x.add(extinction.y).add(extinction.z);

                sigma.addAssign(here);
                dense?.addAssign(extinction.x.add(extinction.y));

                if (lit) {
                  lit.phased.addAssign(
                    water_phases[index]
                      .mul(extinction.x)
                      .add(ice_phase.mul(extinction.y))
                      .add(rain_phase.mul(extinction.z)),
                  );

                  const top = select(
                    column.y.greaterThan(0),
                    layer.top,
                    layer.base.add(column.x),
                  );

                  lit.up.addAssign(here.mul(top.sub(altitude).max(0)));
                  lit.down.addAssign(here.mul(altitude.sub(layer.base).max(0)));
                }
              });
            },
          );
        }
      };

      const light = vec3(0).toVar();
      const through = float(1).toVar();
      const front = float(0).toVar();
      const seen = float(0).toVar();

      const length = end.sub(start).max(0);
      const pixel = this.#pixel_angle;

      // The first step starts somewhere different each frame
      const jitter = interleavedGradientNoise(
        screenCoordinate.xy.add(this.#frame_index.mul(5.588238)),
      );

      const fine_step = (t: F): F =>
        t
          .mul(pixel)
          .clamp(this.#min_step, this.#max_step.div(COARSE_STRIDE)) as F;
      const coarse_step = (t: F): F =>
        max(
          length.div(float(this.#steps)),
          fine_step(t).mul(COARSE_STRIDE),
        ).clamp(this.#min_step, this.#max_step) as F;

      const t = start.add(coarse_step(start).mul(jitter)).toVar();
      const fine = int(0).toVar();

      // Where a stride last found cloud: the fine walk back to it counts
      // nothing, however many fine steps a stride is
      const found = float(0).toVar();

      // How far the ray is integrated: a stride back never counts twice
      const done = start.toVar();

      Loop(this.#steps, () => {
        If(t.greaterThanEqual(end).or(through.lessThan(OPAQUE)), () => {
          Break();
        });

        const p = eye.add(direction.mul(t)).toVar();
        const step = float(0).toVar();
        const sigma = float(0).toVar();
        const dense = float(0).toVar();
        const phased = float(0).toVar();
        const up = float(0).toVar();
        const down = float(0).toVar();

        // Rain is as smooth as the map it is baked in and strided through;
        // only the cloud's droplets and ice, worn by the noise, are walked
        // finely. A rain shaft walked finely spends the ray's steps before
        // the tower over it
        If(fine.equal(0), () => {
          field(p, false, sigma, dense, { phased, up, down });

          If(dense.greaterThan(0), () => {
            // Back a stride, as far as is counted, and walk on finely
            fine.assign(FINE_STEPS);
            found.assign(t);
            t.assign(t.sub(coarse_step(t)).max(done));
            sigma.assign(0);
          }).Else(() => {
            step.assign(coarse_step(t));
          });
        }).Else(() => {
          step.assign(fine_step(t));
          field(p, true, sigma, dense, { phased, up, down });

          If(dense.greaterThan(0), () => {
            fine.assign(FINE_STEPS);
          }).Else(() => {
            If(t.greaterThan(found), () => {
              fine.subAssign(1);
            });
          });
        });

        If(sigma.greaterThan(0), () => {
          // The sun through the cloud towards it
          const sun_depth = float(0).toVar();
          const along = float(0).toVar();

          Loop(LIGHT_STEPS, ({ i }: { i: Node<"int"> }) => {
            const size = exp2(float(i)).mul(LIGHT_FIRST_M);
            const q = p.add(this.#sun_direction.mul(along.add(size.mul(0.5))));
            const sigma_there = float(0).toVar();

            field(q as V3, false, sigma_there, null, null);
            sun_depth.addAssign(sigma_there.mul(size));
            along.addAssign(size);
          });

          // Eddington's two-stream for light scattered many times: a slab
          // of optical depth τ lets 1 / (1 + ¾ (1 − g) τ) of a diffuse light
          // through, and reflects the rest
          const diffuse = (depth: F) =>
            float(1).div(depth.mul(0.75 * (1 - DIFFUSE_ASYMMETRY)).add(1));

          // The sun's light scattered once, by each scatterer's phase,
          // through the cloud towards it
          const once = phased.mul(exp(sun_depth.negate()));

          // And many times: the light the cloud's column reflects, R E / π
          // at its sunlit face, the same every way, fading into the cloud
          // as a diffuse light does. Its first scattering is counted above
          const column = up.add(down);
          const reflected = diffuse(column).oneMinus();
          const many = sigma
            .mul(reflected.div(Math.PI))
            .mul(diffuse(sun_depth).sub(exp(sun_depth.negate())).max(0));

          const sunlit = once.add(many);

          // The sky's and the ground's, each half the sphere, through the
          // cloud over and under
          const ambient = this.#sky
            .mul(diffuse(up))
            .add(this.#ground_light.mul(diffuse(down)))
            .mul(0.5 * ALBEDO)
            .mul(sigma);

          const source = this.#sun.mul(sunlit.mul(ALBEDO)).add(ambient);

          // Hillaire's integration over the step
          const kept = exp(sigma.mul(step).negate());
          const lost = through.mul(kept.oneMinus());

          light.addAssign(source.mul(kept.oneMinus()).div(sigma).mul(through));
          front.addAssign(t.mul(lost));
          seen.addAssign(lost);
          through.mulAssign(kept);
        });

        t.addAssign(step);
        done.assign(max(done, t));
      });

      const distance = select(
        seen.greaterThan(0),
        front.div(seen.max(1e-6)),
        float(NOWHERE),
      );
      const alpha = through.oneMinus();

      // The air between the eye and the cloud: Koschmieder's, faded towards
      // the horizon's light
      const air = exp(this.#haze_extinction.mul(distance.min(1e7)).negate());
      const color = light
        .mul(air)
        .add(this.#haze.mul(air.oneMinus()).mul(alpha))
        .mul(this.#exposure);

      return MARCHED(
        vec4(color, alpha),
        vec4(distance, scene.min(this.#range), through, 0),
      );
    })() as unknown as { toConst: () => { get: (name: string) => V4 } };

    // The fragment's outputs must be its last node, so the march hands them
    // back in a struct
    const result = marched.toConst();

    return outputStruct(result.get("color"), result.get("info"));
  }

  /**
   * Bring the layers' textures, uniforms and shader up to the weather.
   * @param renderer The renderer
   */
  #update_weather(renderer: Renderer): void {
    const weather = this.weather;
    const { layers, hand } = weather.resolve();
    const quality = this.quality;

    // The noise, for the seed
    const salts = noise_salts(weather.seed);

    this.#noise ??= create_noise_textures();

    if (salts[0] !== this.#salts[0] || salts[1] !== this.#salts[1]) {
      this.#noise.bake(renderer, salts[0], salts[1]);
      this.#salts = salts;
    }

    if (weather.version !== this.#version) {
      this.#version = weather.version;
      this.#layers = layers;

      const key = layers.map(layer_key).join("|");

      // The water table: a row a layer
      if (!this.#table || this.#nodes.length !== layers.length) {
        this.#table?.texture.dispose();
        this.#table = create_half_texture(
          TABLE_SIZE,
          Math.max(layers.length, 1),
          "clouds.water",
        );
      }

      const rows = new Float32Array(
        TABLE_SIZE * 4 * Math.max(layers.length, 1),
      );

      for (const [index, layer] of layers.entries()) {
        rows.set(layer.table, index * TABLE_SIZE * 4);
      }

      this.#table.write(rows);

      // The maps, each made again: what they hold may have changed
      for (const map of this.#maps) map?.texture.dispose();

      this.#maps = layers.map((layer) =>
        layer_has_map(layer)
          ? create_half_texture(quality.mapSize, quality.mapSize, "clouds.map")
          : null,
      );
      this.#frames = layers.map(() => null);

      if (key !== this.#key || !this.#built) {
        this.#key = key;
        this.#nodes = layers.map((layer, index) =>
          create_layer_nodes(layer, this.#maps[index]?.texture ?? null),
        );
        this.#built = false;
      } else {
        for (const [index, nodes] of this.#nodes.entries()) {
          nodes.map = this.#maps[index]?.texture ?? null;
        }

        // The map textures are new: the shader samples them afresh
        this.#built = false;
      }
    }

    // Each layer's map, baked again once the camera has crossed a quarter
    let low = Infinity;
    let high = -Infinity;

    for (const [index, resolved] of layers.entries()) {
      const [ax, az] = weather.air(resolved.layer, 0, 0);
      const map = this.#maps[index];
      let frame = this.#frames[index];

      if (map) {
        const quarter = quality.mapExtentM / 4;

        if (
          !frame ||
          Math.abs(ax - frame.x) > quarter ||
          Math.abs(az - frame.z) > quarter
        ) {
          frame = {
            x: ax,
            z: az,
            extent: quality.mapExtentM,
            size: quality.mapSize,
          };
          this.#frames[index] = frame;
          map.write(bake_map(resolved, hand[index], frame));
        }
      }

      update_layer_nodes(
        this.#nodes[index],
        resolved,
        ax,
        az,
        weather.time,
        frame,
        index,
      );

      low = Math.min(
        low,
        layer_has_map(resolved) ? weather.day.groundM : resolved.baseM,
      );
      high = Math.max(high, resolved.topM);
    }

    this.#low.value = Number.isFinite(low) ? low : 0;
    this.#high.value = Number.isFinite(high) ? high : 0;
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

    this.#update_weather(renderer);

    if (!this.#built && this.#noise && this.#table) {
      this.#march_material.fragmentNode = this.#march_fragment(
        depth,
        this.#noise.shape.texture,
        this.#noise.detail.texture,
        this.#table.texture,
      ) as unknown as V4;
      this.#march_material.needsUpdate = true;
      this.#built = true;
    }

    // The size: the drawing buffer's, scaled
    const quality = this.quality;
    const size = renderer.getDrawingBufferSize(new Vector2());
    const width = Math.max(Math.round(size.x * quality.resolutionScale), 1);
    const height = Math.max(Math.round(size.y * quality.resolutionScale), 1);

    if (this.#march.width !== width || this.#march.height !== height) {
      this.#march.setSize(width, height);

      for (const target of this.#history) target.setSize(width, height);

      this.#had_history.value = 0;
    }

    this.#resolution.value.set(width, height);

    // The camera
    const camera = this.camera as PerspectiveCamera;

    camera.updateMatrixWorld();
    this.#projection_inverse.value.copy(camera.projectionMatrixInverse);
    this.#camera_world.value.copy(camera.matrixWorld);
    this.#camera_position.value.setFromMatrixPosition(camera.matrixWorld);
    this.#near.value = camera.near;
    this.#far.value = camera.far;
    this.#pixel_angle.value =
      2 / (camera.projectionMatrix.elements[5] * height);

    // The weather's day, look and quality
    const { weather } = this;
    const { look } = weather;

    this.#altitude.value = weather.origin[1];
    this.#ground.value = weather.day.groundM;
    this.#sun_direction.value.fromArray(look.sunDirection).normalize();
    this.#sun.value.fromArray(look.sun);
    this.#sky.value.fromArray(look.sky);
    this.#ground_light.value.fromArray(look.ground);
    this.#exposure.value = look.exposure;
    this.#haze.value.fromArray(look.haze);
    this.#haze_extinction.value =
      look.visibilityM > 0 ? KOSCHMIEDER / look.visibilityM : 0;

    this.#steps.value = quality.steps;
    this.#min_step.value = quality.minStepM;
    this.#max_step.value = quality.maxStepM;
    this.#range.value = quality.rangeM;
    this.#blend.value = quality.blend;
    this.#frame_index.value = (this.#frame_index.value + 1) % 64;

    // How far the weather moved past the scene since the last frame
    const origin = new Vector3(...weather.origin);

    this.#moved.value.subVectors(origin, this.#previous_origin);
    this.#previous_origin.copy(origin);

    // March
    renderer.setRenderTarget(this.#march);
    this.#quad.material = this.#march_material;
    this.#quad.render(renderer);

    // Resolve into one history, from the other
    const read = this.#history[this.#current];
    const write = this.#history[1 - this.#current];

    this.#history_node.value = read.texture;
    renderer.setRenderTarget(write);
    this.#quad.material = this.#resolve_material;
    this.#quad.render(renderer);

    this.#texture_node.value = write.texture;
    this.#current = 1 - this.#current;
    this.#had_history.value = 1;

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
    this.#march.dispose();

    for (const target of this.#history) target.dispose();

    this.#march_material.dispose();
    this.#resolve_material.dispose();
    this.#noise?.dispose();
    this.#table?.texture.dispose();

    for (const map of this.#maps) map?.texture.dispose();

    super.dispose();
  }
}

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
