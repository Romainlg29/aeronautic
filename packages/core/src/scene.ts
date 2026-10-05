import { Color, type Fog, type FogExp2, type Object3D } from "three";
import {
  Fn,
  cameraFar,
  cameraNear,
  exp,
  float,
  logarithmicDepthToViewZ,
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

/** No fog, three's `Fog`, and three's `FogExp2` */
export const SCENE_FOG_NONE = 0;
export const SCENE_FOG_RANGE = 1;
export const SCENE_FOG_DENSITY = 2;

/**
 * A scene's fog as uniforms, so a volume can fog each of its samples at its
 * own depth rather than the whole of it at its hull's.
 */
export type SceneFogUniforms = {
  /** `SCENE_FOG_NONE`, `SCENE_FOG_RANGE` or `SCENE_FOG_DENSITY` */
  kind: UniformNode<"float", number>;

  /** In the working colour space, as three keeps it */
  color: UniformNode<"color", Color>;

  near: UniformNode<"float", number>;
  far: UniformNode<"float", number>;
  density: UniformNode<"float", number>;
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
});

/**
 * Write the fog an object is drawn in into the uniforms.
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
 * `rangeFogFactor` and `densityFogFactor` work it out for a surface there.
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

  return select(
    kind.lessThan(SCENE_FOG_RANGE - 0.5),
    float(0),
    select(kind.lessThan(SCENE_FOG_DENSITY - 0.5), range, thick),
  );
};

/**
 * `scene_fog_factor` on the CPU, for tests and for anything placed by hand.
 * @param fog The scene's fog, if any
 * @param depth How far in front of the camera, positive
 * @returns The fog factor
 */
export const fog_factor = (
  fog: Fog | FogExp2 | null | undefined,
  depth: number,
): number => {
  if (!fog) {
    return 0;
  }

  if ((fog as FogExp2).isFogExp2) {
    const density = (fog as FogExp2).density;

    return 1 - Math.exp(-density * density * depth * depth);
  }

  const { near, far } = fog as Fog;
  const t = Math.min(Math.max((depth - near) / (far - near), 0), 1);

  return t * t * (3 - 2 * t);
};
