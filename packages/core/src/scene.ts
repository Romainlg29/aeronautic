import { Color, type Fog, type FogExp2, type Object3D } from "three";
import {
  Fn,
  cameraFar,
  cameraNear,
  exp,
  float,
  logarithmicDepthToViewZ,
  mix,
  perspectiveDepthToViewZ,
  select,
  smoothstep,
  uniform,
  viewportDepthTexture,
  viewportTexture,
} from "three/tsl";
import type { Node, TextureNode, UniformNode } from "three/webgpu";

// What every effect reads of the scene it is drawn into: how deep the opaque
// scene is, and the fog it is drawn in
//
// Each `viewportDepthTexture()` is a node of its own, and each copies the
// whole depth buffer once a render, however many others already have. Every
// effect reads this one instead, so a frame copies its depth once, whatever
// is drawn in it

type F = Node<"float">;
type V3 = Node<"vec3">;

let shared_depth: TextureNode | null = null;

/**
 * The opaque scene's depth, as the frame being drawn has it: one node every
 * effect shares, so the depth buffer is copied once a render.
 * @returns The depth texture node
 */
export const scene_depth = (): TextureNode => {
  shared_depth ??= viewportDepthTexture() as unknown as TextureNode;

  return shared_depth;
};

let shared_color: TextureNode | null = null;

/**
 * What the opaque scene looks like, as the frame being drawn has it: one node
 * every effect samples, with `.sample(uv)`, so the colour is copied once a
 * render however many places it is read from.
 *
 * Not three's `viewportSharedTexture`: that shares the texture but copies
 * into it once for each node made of it, every read a copy of the frame.
 * Samples of one `viewportTexture` all copy into the same texture, and three
 * copies a texture once a render
 * @returns The colour texture node
 */
export const scene_color = (): TextureNode => {
  shared_color ??= viewportTexture() as unknown as TextureNode;

  return shared_color;
};

/**
 * How far in front of the camera the opaque scene sits, in view space.
 * Negative, as view space depth is; reads the sky as the far plane.
 * @param depth A depth texture drawn in a pass of its own, sampled at the
 *   pixel. Left out, the frame's own, through `scene_depth`
 * @returns The view space depth
 */
export const scene_view_z = (depth?: TextureNode): F =>
  (
    Fn((builder: { renderer: { logarithmicDepthBuffer: boolean } }) => {
      const stored = (depth ?? scene_depth()).x as unknown as F;

      return builder.renderer.logarithmicDepthBuffer
        ? logarithmicDepthToViewZ(stored, cameraNear, cameraFar)
        : perspectiveDepthToViewZ(stored, cameraNear, cameraFar);
    }) as unknown as () => F
  )();

/**
 * No fog, three's `Fog`, three's `FogExp2`, and a medium: air thick with
 * something, a cloud the camera is in
 */
export const SCENE_FOG_NONE = 0;
export const SCENE_FOG_RANGE = 1;
export const SCENE_FOG_DENSITY = 2;
export const SCENE_FOG_MEDIUM = 3;

/**
 * The air round the camera as a medium of its own, thick enough to hide what
 * is drawn in it: the inside of a cloud, say. Light from a depth d comes
 * through it as e^(−σ d), Beer and Lambert's, and the rest is the light the
 * medium scatters itself.
 *
 * Three's fogs are only `Fog` and `FogExp2`, and it refuses any other on a
 * scene. A medium is set beside the scene's fog instead, with
 * `set_scene_medium`, and only the effects read it: they fog themselves
 */
export type SceneMedium = {
  /** Its extinction, per metre */
  extinction: number;

  /**
   * What it looks like where it is thick enough to hide everything: the light
   * it scatters per its extinction, in the working colour space
   */
  color: Color;

  /**
   * How much of the sun's light gets through it to the camera, 0 to 1: what
   * an effect lit by the sun is lit by there. By default 1
   */
  sunTransmittance?: number;

  /**
   * The light round the camera that is not the sun's own beam, its mean
   * radiance, in the scene's light units: what an effect lit by the sky is
   * lit by there instead. Left out, the effects keep their sky
   */
  light?: Color | null;
};

const mediums = new WeakMap<object, SceneMedium>();

/**
 * Set the medium a scene's effects are drawn in, over its fog while it is
 * thick at all.
 * @param scene The scene
 * @param medium The medium, or null for none
 */
export const set_scene_medium = (
  scene: object,
  medium: SceneMedium | null,
): void => {
  if (medium) mediums.set(scene, medium);
  else mediums.delete(scene);
};

/**
 * The medium a scene's effects are drawn in.
 * @param scene The scene
 * @returns Its medium, or null
 */
export const scene_medium = (
  scene: object | null | undefined,
): SceneMedium | null => (scene ? (mediums.get(scene) ?? null) : null);

/**
 * The optical depth of a scene's air between two of its points, where it is
 * not the same everywhere: the clouds between the camera and an effect, which
 * hide it as surely as one round the camera does. It counts the medium round
 * the camera too, so an effect that has it fogs itself by it alone
 */
export type ScenePath = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
) => number;

const paths = new WeakMap<object, ScenePath>();

/**
 * Set how a scene's effects find the air between them and the camera.
 * @param scene The scene
 * @param path Its optical depth between two points, or null for none
 */
export const set_scene_path = (scene: object, path: ScenePath | null): void => {
  if (path) paths.set(scene, path);
  else paths.delete(scene);
};

/**
 * How a scene's effects find the air between them and the camera.
 * @param scene The scene
 * @returns Its optical depth between two points, or null
 */
export const scene_path = (
  scene: object | null | undefined,
): ScenePath | null => (scene ? (paths.get(scene) ?? null) : null);

/**
 * A scene's fog as uniforms, so a volume can fog each of its samples at its
 * own depth rather than the whole of it at its hull's.
 */
export type SceneFogUniforms = {
  /**
   * `SCENE_FOG_NONE`, `SCENE_FOG_RANGE`, `SCENE_FOG_DENSITY` or
   * `SCENE_FOG_MEDIUM`
   */
  kind: UniformNode<"float", number>;

  /** In the working colour space, as three keeps it */
  color: UniformNode<"color", Color>;

  near: UniformNode<"float", number>;
  far: UniformNode<"float", number>;
  /** `FogExp2`'s density, or a medium's extinction */
  density: UniformNode<"float", number>;

  /** How much of the sun gets through a medium: 1 out of one */
  sun: UniformNode<"float", number>;

  /** A medium's light, in place of the sky, when `lit` is 1 */
  light: UniformNode<"color", Color>;
  lit: UniformNode<"float", number>;
};

/**
 * Make the uniforms a scene's fog is written into.
 * @returns Fresh uniforms, with no fog
 */
export const create_scene_fog = (): SceneFogUniforms => ({
  kind: uniform(SCENE_FOG_NONE) as UniformNode<"float", number>,
  color: uniform(new Color()) as unknown as UniformNode<"color", Color>,
  near: uniform(1) as UniformNode<"float", number>,
  far: uniform(1000) as UniformNode<"float", number>,
  density: uniform(0) as UniformNode<"float", number>,
  sun: uniform(1) as UniformNode<"float", number>,
  light: uniform(new Color()) as unknown as UniformNode<"color", Color>,
  lit: uniform(0) as UniformNode<"float", number>,
});

/**
 * Write the fog an object is drawn in into the uniforms: its medium while it
 * has one, or else its fog.
 *
 * Three's own fog nodes only fog a surface, at its own depth. A volume's light
 * comes from all along the ray, and is premultiplied, so it reads the same fog
 * from these and fogs it itself.
 * @param uniforms The uniforms
 * @param scene The scene it is drawn in, or anything with its `fog`
 */
export const write_scene_fog = (
  uniforms: SceneFogUniforms,
  scene: Object3D | { fog?: Fog | FogExp2 | null } | null | undefined,
) => {
  const medium = scene_medium(scene);

  if (medium && medium.extinction > 0) {
    uniforms.kind.value = SCENE_FOG_MEDIUM;
    uniforms.color.value.copy(medium.color);
    uniforms.density.value = medium.extinction;
    uniforms.sun.value = medium.sunTransmittance ?? 1;
    uniforms.lit.value = medium.light ? 1 : 0;

    if (medium.light) uniforms.light.value.copy(medium.light);

    return;
  }

  uniforms.sun.value = 1;
  uniforms.lit.value = 0;

  const fog = (scene as { fog?: Fog | FogExp2 | null } | null | undefined)?.fog;

  if (!fog) {
    uniforms.kind.value = SCENE_FOG_NONE;

    return;
  }

  uniforms.color.value.copy(fog.color);

  if ((fog as FogExp2).isFogExp2) {
    uniforms.kind.value = SCENE_FOG_DENSITY;
    uniforms.density.value = (fog as FogExp2).density;
  } else {
    uniforms.kind.value = SCENE_FOG_RANGE;
    uniforms.near.value = (fog as Fog).near;
    uniforms.far.value = (fog as Fog).far;
  }
};

/**
 * How much of the light from a depth the fog replaces, 0 to 1, as three's
 * `rangeFogFactor` and `densityFogFactor` work it out for a surface there, or
 * a medium's 1 − e^(−σ d).
 * @param uniforms The fog
 * @param depth How far in front of the camera, in view space, positive
 * @returns The fog factor; zero with no fog
 */
export const scene_fog_factor = (uniforms: SceneFogUniforms, depth: F): F => {
  const kind = uniforms.kind as unknown as F;
  const density = uniforms.density as unknown as F;

  const range = smoothstep(
    uniforms.near as unknown as F,
    uniforms.far as unknown as F,
    depth,
  );

  const thick = float(1).sub(
    exp(density.mul(density).mul(depth).mul(depth).negate()),
  );

  const medium = float(1).sub(exp(density.mul(depth).negate()));

  return select(
    kind.lessThan(SCENE_FOG_RANGE - 0.5),
    float(0),
    select(
      kind.lessThan(SCENE_FOG_DENSITY - 0.5),
      range,
      select(kind.lessThan(SCENE_FOG_MEDIUM - 0.5), thick, medium),
    ),
  );
};

/**
 * The sun as an effect in the scene's medium is lit by it: dimmed by what of
 * it gets through, and as it is out of one.
 * @param uniforms The fog
 * @param sun The effect's sun
 * @returns Its sun there
 */
export const medium_sun = (uniforms: SceneFogUniforms, sun: V3): V3 =>
  sun.mul(uniforms.sun as unknown as F);

/**
 * The sky as an effect in the scene's medium is lit by it: the medium's own
 * light inside one, the effect's sky out of one.
 * @param uniforms The fog
 * @param sky The effect's sky
 * @returns Its sky there
 */
export const medium_sky = (uniforms: SceneFogUniforms, sky: V3): V3 =>
  mix(
    sky,
    uniforms.light as unknown as V3,
    uniforms.lit as unknown as F,
  ) as unknown as V3;

/**
 * `scene_fog_factor` on the CPU, for tests and for anything placed by hand.
 * @param fog The scene's fog or medium, if any
 * @param depth How far in front of the camera, positive
 * @returns The fog factor
 */
export const fog_factor = (
  fog: Fog | FogExp2 | SceneMedium | null | undefined,
  depth: number,
): number => {
  if (!fog) {
    return 0;
  }

  if ("extinction" in fog) {
    return 1 - Math.exp(-fog.extinction * depth);
  }

  if ((fog as FogExp2).isFogExp2) {
    const density = (fog as FogExp2).density;

    return 1 - Math.exp(-density * density * depth * depth);
  }

  const { near, far } = fog as Fog;
  const t = Math.min(Math.max((depth - near) / (far - near), 0), 1);

  return t * t * (3 - 2 * t);
};
