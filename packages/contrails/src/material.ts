import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  Matrix3,
  NearestFilter,
  RGBAFormat,
  Vector3,
} from "three";
import {
  CustomBlending,
  DoubleSide,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
  type UniformNode,
} from "three/webgpu";
import {
  create_scene_fog,
  scene_fog_factor,
  scene_view_z,
  type SceneBackdrop,
  type SceneFogUniforms,
} from "@aeronautic/core";
import {
  Discard,
  Fn,
  If,
  abs,
  attribute,
  cameraProjectionMatrix,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  hash,
  highpModelViewMatrix,
  ivec2,
  log,
  max,
  min,
  normalize,
  positionGeometry,
  pow,
  screenUV,
  select,
  sign,
  sin,
  sqrt,
  textureLoad,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  PUFF_SIZE_MAX,
  PUFF_SIZE_MIN,
  PUFF_SIZE_STEPS,
  PUFF_UNMIXEDNESS,
} from "./puffs";

// The trails, drawn as the eddies they are made of
//
// Each puff is a Gaussian blob of ice, so what a ray meets of it can be
// summed in closed form: its closest approach to the puff's centre sets how
// much, and an error function clips it at the camera and at whatever opaque
// thing is behind. A square facing the camera, three widths out, is only
// where to work that out. Each puff's place on its trail's axis is laid on
// the CPU, from the path flown, at its own age, and the shader scatters it
// round that by a hash of its name: puffs.ts says how many and how big
//
// Ice is white: crystals a micron or more across scatter every colour alike,
// and absorb none of it. So what a contrail looks like is the sun's light
// scattered once, mostly forward, the light it scattered scattered again,
// and the sky's and the ground's, over the share of what is behind it that
// it stops

type F = Node<"float">;
type V3 = Node<"vec3">;

// How far out each puff's square is drawn, in widths: a Gaussian has 1 % of
// its density left at three
const PUFF_SIGMAS = 3;

/**
 * A texel's place, from whole floats: turned to integers as one vector,
 * which TSL keeps, where it drops a lone float's turn to an int.
 * @param x Its column
 * @param y Its row
 * @returns The place
 */
const texel = (x: F | number, y: F | number) =>
  ivec2(vec2(x, y) as unknown as Node<"int">);

// Puffs written a row of the puffs' texture
const PUFF_ROW = 1024;

// The puffs' texture is in blocks of rows, a puff at the same texel of
// each: its age, name, and the seconds its ice and size stand for; the
// plume's width and extinction there and how fast the trail was left; which
// way the trail runs back; then where it is on each engine's trail
const PUFF_BLOCKS = 3;

/**
 * How many rows each block of the puffs' texture takes.
 * @param puffs The most puffs a trail
 * @returns The rows
 */
const puff_rows = (puffs: number) => Math.max(Math.ceil(puffs / PUFF_ROW), 1);

// (4π)^3/2 I² / 2π, which turns λ σ into the (1 - u²) / u³ a puff's size u
// solves
const SIZE_CONSTANT =
  (PUFF_UNMIXEDNESS ** 2 * (4 * Math.PI) ** 1.5) / (2 * Math.PI);

type FloatUniform = UniformNode<"float", number>;
type Vec3Uniform = UniformNode<"vec3", Vector3>;

/**
 * The uniforms one contrail material is driven by.
 */
export type ContrailUniforms = {
  /** The camera, in the canonical frame */
  camera: Vec3Uniform;

  /**
   * Which way the sunlight comes from, in the canonical frame, and the
   * light's colour times its brightness
   */
  sunDirection: Vec3Uniform;
  sun: Vec3Uniform;
  sky: Vec3Uniform;

  exposure: FloatUniform;
  anisotropy: FloatUniform;

  /**
   * The air's axes in the canonical frame now: puffs are scattered in the
   * air, so they stay where they are as the aircraft turns
   */
  air: UniformNode<"mat3", Matrix3>;

  /** The fog of the scene it is drawn in, written every render */
  fog: SceneFogUniforms;
};

/**
 * Make the uniforms a contrail material is driven by.
 * @returns Fresh uniforms
 */
export const create_contrail_uniforms = (): ContrailUniforms => {
  const vector = (name: string) =>
    uniform(new Vector3()).setName(
      `contrails_${name}`,
    ) as unknown as Vec3Uniform;

  return {
    camera: vector("camera"),
    sunDirection: vector("sunDirection"),
    sun: vector("sun"),
    sky: vector("sky"),
    exposure: uniform(1) as FloatUniform,
    anisotropy: uniform(0.77) as FloatUniform,
    air: uniform(new Matrix3()) as unknown as UniformNode<"mat3", Matrix3>,
    fog: create_scene_fog(),
  };
};

/**
 * A float texture, read texel by texel.
 * @param width Texels a row
 * @param height Rows
 * @param name Its name
 * @returns The texture
 */
const float_texture = (width: number, height: number, name: string) => {
  const texture = new DataTexture(
    new Float32Array(width * height * 4),
    width,
    height,
    RGBAFormat,
    FloatType,
  );

  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.name = name;

  return texture;
};

/**
 * Make the texture the puffs ride in, as `write_puffs` and the trails' laying
 * write it: four floats a texel, a block of rows for each of what a puff
 * carries, then a block for each engine's trail. Full floats: a trail runs
 * kilometres.
 * @param puffs The most puffs a trail
 * @param engines How many trails
 * @returns The texture
 */
export const create_puff_texture = (
  puffs: number,
  engines: number,
): DataTexture =>
  float_texture(
    PUFF_ROW,
    puff_rows(puffs) * (PUFF_BLOCKS + Math.max(engines, 1)),
    "ContrailPuffs",
  );

/**
 * Where a puff's texel of one block is in the puffs' texture's data.
 * @param puff Which puff
 * @param block Which block: 0 to 2, then 3 on for each engine
 * @param puffs The most puffs a trail
 * @returns The index of its first float
 */
export const puff_texel = (puff: number, block: number, puffs: number) =>
  (block * puff_rows(puffs) * PUFF_ROW + puff) * 4;

/**
 * The puffs: a square for each puff of each engine's trail, the puffs
 * outermost, so drawing the first n of them draws n a trail. Each corner
 * carries only which corner, which puff and which engine: where it goes is
 * read from the textures.
 * @param puffs The most puffs a trail
 * @param engines How many trails
 * @returns The geometry
 */
export const create_puff_geometry = (
  puffs: number,
  engines: number,
): BufferGeometry => {
  const corners: number[] = [];
  const owners: number[] = [];
  const indices: number[] = [];

  for (let puff = 0; puff < puffs; puff++) {
    for (let engine = 0; engine < engines; engine++) {
      const base = corners.length / 3;

      corners.push(-1, -1, puff, 1, -1, puff, 1, 1, puff, -1, 1, puff);
      owners.push(engine, engine, engine, engine);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new Float32BufferAttribute(corners, 3));
  geometry.setAttribute("puffEngine", new Float32BufferAttribute(owners, 1));
  geometry.setIndex(indices);

  return geometry;
};

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
 * The error function, to 1.5e-7: Abramowitz and Stegun's 7.1.26.
 * @param x Its argument
 * @returns erf(x)
 */
const erf = (x: F): F => {
  const a = abs(x);
  const t = float(1).div(a.mul(0.3275911).add(1));
  const poly = t
    .mul(1.061405429)
    .sub(1.453152027)
    .mul(t)
    .add(1.421413741)
    .mul(t)
    .sub(0.284496736)
    .mul(t)
    .add(0.254829592)
    .mul(t);

  return sign(x).mul(float(1).sub(poly.mul(exp(a.mul(a).negate()))));
};

/**
 * What is compiled into one contrail material.
 */
export type ContrailMaterialOptions = {
  uniforms: ContrailUniforms;

  /** The puffs, from `create_puff_texture` */
  puffs: DataTexture;

  /** The most puffs a trail: how its texture's blocks are laid out */
  count: number;

  /**
   * The opaque scene, drawn in a pass of its own, for trails drawn in
   * another, as core's `volume_pass` sets up. Left out, they read the frame
   * they are drawn into
   */
  backdrop?: SceneBackdrop;
};

/**
 * Build the material the trails are drawn with.
 * @param options Its uniforms and its textures
 * @returns The material
 */
export const create_contrail_material = (
  options: ContrailMaterialOptions,
): MeshBasicNodeMaterial => {
  const { uniforms: u, puffs, backdrop } = options;
  const camera = u.camera as unknown as V3;
  const rows = puff_rows(options.count);

  // Which puff, of which engine's trail, and which corner of its square
  const puff = positionGeometry.z;
  const owner = attribute("puffEngine", "float") as unknown as F;
  const corner = positionGeometry.xy;

  // Its texel of each block, as whole floats
  const column = puff.mod(PUFF_ROW) as unknown as F;
  const row = floor(puff.div(PUFF_ROW)) as unknown as F;
  const block = (index: F) =>
    textureLoad(puffs, texel(column, row.add(index.mul(rows))));

  // Its age, its name, and the seconds of trail its ice and its size stand
  // for
  const written = block(float(0) as unknown as F);
  const age = written.x as unknown as F;
  const name = written.y as unknown as F;
  const mass_s = written.z as unknown as F;
  const size_s = written.w as unknown as F;

  // The plume there, and how fast the trail runs back through the air, per
  // second of age: all laid at its own age, from the path flown
  const optics = block(float(1) as unknown as F);
  const sigma = max(optics.x, 1e-4) as unknown as F;
  const extinction = optics.y as unknown as F;
  const flown = max(optics.z, 1e-3) as unknown as F;
  const axis = normalize(block(float(2) as unknown as F).xyz) as unknown as V3;
  const axis_point = block(owner.add(PUFF_BLOCKS)).xyz as unknown as V3;

  // Its ice: the trail's, over the stretch of it the puff stands for. Its
  // size: what makes the plume wander by a quarter, for how far apart the
  // puffs are, by Newton's steps from one as puffs.ts does
  const ice = extinction.mul(flown).mul(mass_s);
  const per_width = sigma.div(flown.mul(max(size_s, 1e-9)));
  const k = per_width.mul(SIZE_CONSTANT);
  let size = float(1) as unknown as F;

  for (let step = 0; step < PUFF_SIZE_STEPS; step++) {
    const value = k.mul(size.mul(size).mul(size)).add(size.mul(size)).sub(1);
    const slope = k.mul(size.mul(size)).mul(3).add(size.mul(2));

    size = size.sub(value.div(slope)) as unknown as F;
  }

  size = clamp(size, PUFF_SIZE_MIN, PUFF_SIZE_MAX) as unknown as F;

  const puff_sigma = sigma.mul(size);
  const spread = sigma.mul(sqrt(float(1).sub(size.mul(size))));

  // Where in the plume: three normal draws from its name and engine, by
  // Box and Muller, in the air's axes. Each draw hashes the last, scaled to
  // the 2^24 integers a float holds exactly
  const draw = (seed: F, salt: F | number) =>
    hash(seed.mul(16777216).add(salt)) as unknown as F;
  const u1 = draw(hash(name) as unknown as F, owner.mul(4).add(1));
  const u2 = draw(u1, 2);
  const u3 = draw(u2, 3);
  const u4 = draw(u3, 4);
  const r1 = sqrt(log(max(u1, 1e-7)).mul(-2));
  const r2 = sqrt(log(max(u3, 1e-7)).mul(-2));
  const scatter = vec3(
    r1.mul(cos(u2.mul(2 * Math.PI))),
    r1.mul(sin(u2.mul(2 * Math.PI))),
    r2.mul(cos(u4.mul(2 * Math.PI))),
  );
  const centre = axis_point.add(
    (u.air as unknown as Node<"mat3">).mul(scatter).mul(spread),
  ) as unknown as V3;

  // How much plume the sunlight crossed to reach it: the trail's own mean,
  // summed along the sun's ray from there. On the side facing the sun it has
  // crossed little, on the far side all of it, so a thick young trail is lit
  // on one side and in its own shadow on the other
  const sun_ray = u.sunDirection as unknown as V3;
  const sun_along = dot(sun_ray, axis);
  const sun_cross2 = max(float(1).sub(sun_along.mul(sun_along)), 1e-4);
  const sun_cross = sqrt(sun_cross2);
  const sun_tau_through = extinction.div(
    sigma.mul(Math.sqrt(2 * Math.PI)).mul(sun_cross),
  );

  const from_axis = centre.sub(axis_point);
  const across = from_axis.sub(axis.mul(dot(from_axis, axis)));
  const sun_across = sun_ray.sub(axis.mul(sun_along));
  const sun_closest = dot(across, sun_across).negate().div(sun_cross2);
  const sun_miss = across.add(sun_across.mul(sun_closest));
  const sun_tau = sun_tau_through
    .mul(exp(dot(sun_miss, sun_miss).div(sigma.mul(sigma).mul(2)).negate()))
    .mul(
      float(1)
        .add(erf(sun_closest.mul(sun_cross).div(sigma.mul(Math.SQRT2))))
        .mul(0.5),
    );

  const sun = u.sun as unknown as V3;
  const direction = normalize(centre.sub(camera));
  const cosine = dot(direction, sun_ray);

  // Scattered once, from the sunlight that got there; and the light the
  // plume scattered, scattered again, with no direction left in it
  const single = sun
    .mul(henyey_greenstein(cosine, u.anisotropy as unknown as F))
    .mul(exp(sun_tau.negate()));
  const multiple = sun
    .mul(float(1).sub(exp(sun_tau_through.negate())))
    .div(4 * Math.PI);

  const source = single
    .add(multiple)
    .add(u.sky as unknown as V3)
    .mul(u.exposure as unknown as F);

  // Its square, facing the camera, wide enough for the puff seen off axis
  const view_centre = highpModelViewMatrix.mul(vec4(centre, 1))
    .xyz as unknown as V3;
  const off_axis = min(
    view_centre.length().div(max(view_centre.z.negate(), 1e-3)),
    2,
  );
  const reach = puff_sigma.mul(PUFF_SIGMAS).mul(off_axis);
  const view = view_centre.add(vec3(corner.mul(reach), 0)) as unknown as V3;

  // Fog between it and the camera takes its share of what it scatters, and
  // puts its own colour in for the share of the backdrop it hides
  const fog = scene_fog_factor(u.fog, max(view_centre.z.negate(), 0));
  const color = source
    .mul(fog.oneMinus())
    .add(vec3(u.fog.color as unknown as V3).mul(fog));

  // Nothing to draw: not laid, or no ice
  const drawn = age.greaterThanEqual(0).and(ice.greaterThan(1e-9));

  const v_view = varying(view, "v_contrail_view") as unknown as V3;
  const v_centre = varying(view_centre, "v_contrail_centre") as unknown as V3;
  const v_sigma = varying(puff_sigma, "v_contrail_sigma") as unknown as F;
  const v_ice = varying(
    select(drawn, ice, float(0)),
    "v_contrail_ice",
  ) as unknown as F;
  const v_color = varying(color, "v_contrail_color") as unknown as V3;

  const radiance = Fn(() => {
    const ice = v_ice.toVar();

    If(ice.lessThanEqual(1e-9), () => {
      Discard();
    });

    const s = max(v_sigma, 1e-4).toVar();
    const direction = normalize(v_view).toVar();

    // Where the ray comes closest to the puff's centre, as a distance along
    // it from the camera, and how close
    const closest = dot(direction, v_centre).toVar();
    const miss2 = max(dot(v_centre, v_centre).sub(closest.mul(closest)), 0);

    If(miss2.greaterThan(s.mul(s).mul(PUFF_SIGMAS * PUFF_SIGMAS)), () => {
      Discard();
    });

    // What of the ray is in front of the scene
    const depth_per_metre = max(direction.z.negate(), 1e-6);
    const end = scene_view_z(backdrop?.depth.sample(screenUV))
      .negate()
      .div(depth_per_metre)
      .toVar();

    If(end.lessThanEqual(0), () => {
      Discard();
    });

    // ∫ μ / (2π σ²)^3/2 exp(-r² / 2σ²) dt along the ray: the miss sets the
    // peak, the error functions the clipping at the camera and the scene
    const scale = float(1).div(s.mul(Math.SQRT2));
    const crossing = erf(end.sub(closest).mul(scale)).sub(
      erf(closest.negate().mul(scale)),
    );
    const tau = ice
      .div(s.mul(s).mul(2 * Math.PI))
      .mul(exp(miss2.div(s.mul(s).mul(2)).negate()))
      .mul(crossing.mul(0.5));

    const stopped = float(1).sub(exp(tau.negate())).toVar();

    If(stopped.lessThan(1e-4), () => {
      Discard();
    });

    return vec4(v_color.mul(stopped), stopped);
  });

  // Premultiplied: what the ice scatters, over what it lets through
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
    side: DoubleSide,
    fog: false,
  });

  material.name = "ContrailMaterial";

  // A puff not drawn is put behind the camera, where nothing of it is
  material.vertexNode = select(
    drawn,
    cameraProjectionMatrix.mul(vec4(view, 1)),
    vec4(0, 0, 2, 1),
  );
  material.colorNode = radiance();

  return material;
};
