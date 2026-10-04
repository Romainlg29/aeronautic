import { Color, type Camera, type Object3D, Scene } from "three";
import {
  abs,
  exp2,
  float,
  floor,
  fract,
  Fn,
  int,
  logarithmicDepthToViewZ,
  max,
  pass,
  perspectiveDepthToViewZ,
  screenUV,
  textureSize,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import type { Node, PassNode, TextureNode } from "three/webgpu";
import type { AfterburnerBackdrop } from "./afterburner-material";

type F = Node<"float">;
type V2 = Node<"vec2">;
type V4 = Node<"vec4">;

// How far a half-resolution texel's scene may sit from the pixel's, as a
// share of the pixel's own depth, before it stops lending the pixel its plume
const DEPTH_TOLERANCE = 0.03;

/**
 * How `afterburner_pass` draws the plumes.
 */
export type AfterburnerPassOptions = {
  /**
   * The plumes' resolution against the frame's. A raymarch costs per pixel,
   * and a plume is soft enough that half of it, a quarter of the pixels, is
   * seldom seen
   */
  resolutionScale?: number;
};

/**
 * The opaque scene and the plumes in passes of their own, composited.
 */
export type AfterburnerPass = {
  /**
   * Where the batch's mesh goes instead of the scene. `<AfterburnerBatch>`
   * puts it there when given this pass
   */
  scene: Scene;

  /** What the plume material reads the opaque scene from */
  backdrop: AfterburnerBackdrop;

  /** The scene at full resolution, without the plumes */
  scenePass: PassNode;

  /** The plumes alone, premultiplied, at the reduced resolution */
  plumePass: PassNode;

  /**
   * The two composited at full resolution, for a render pipeline's output or
   * whatever comes after it, bloom say
   */
  output: V4;
};

/**
 * View space depth from a depth buffer value.
 * @param depth The stored depth
 * @param near The camera's near plane
 * @param far The camera's far plane
 * @returns View space z, negative in front of the camera
 */
const view_z = (depth: F, near: F, far: F): F =>
  (
    Fn((builder: { renderer: { logarithmicDepthBuffer: boolean } }) =>
      builder.renderer.logarithmicDepthBuffer
        ? logarithmicDepthToViewZ(depth, near, far)
        : perspectiveDepthToViewZ(depth, near, far),
    ) as unknown as () => F
  )();

/**
 * Draw the plumes at a lower resolution than the scene, and composite them.
 *
 * The opaque scene is drawn first at full resolution, then the plumes alone
 * into a smaller target, reading the scene's depth to stop at what is in front
 * of them and its colour for the haze. The plumes are brought back up with a
 * depth-aware upsample: each pixel takes its plume only from the nearby
 * texels whose scene sits at its own depth, so a canopy or a nozzle in front of
 * the flame keeps its edge rather than wearing a fringe of fire.
 *
 * Give the result to `<AfterburnerBatch pass={...}>` (or put a batch's mesh in
 * `pass.scene` and build it with `backdrop: pass.backdrop`), and use
 * `pass.output` as the render pipeline's output.
 * @param scene The scene, plumes left out of it
 * @param camera The camera
 * @param options How finely to draw the plumes
 * @returns The passes, and the composite
 */
export const afterburner_pass = (
  scene: Object3D,
  camera: Camera,
  options: AfterburnerPassOptions = {},
): AfterburnerPass => {
  const { resolutionScale: resolution_scale = 0.5 } = options;

  const scene_pass = pass(scene, camera);

  // The plumes' own scene: no background, and cleared to nothing, whatever
  // the renderer's clear colour, so what is left is the plumes alone
  const plume_scene = new Scene();

  const kept_color = new Color();
  let kept_alpha = 1;

  plume_scene.onBeforeRender = (renderer) => {
    renderer.getClearColor(kept_color);
    kept_alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
  };

  plume_scene.onAfterRender = (renderer) => {
    renderer.setClearColor(kept_color, kept_alpha);
  };

  const plume_pass = pass(plume_scene, camera);

  plume_pass.setResolutionScale(resolution_scale);

  const color = scene_pass.getTextureNode("output") as unknown as TextureNode;
  const depth = scene_pass.getTextureNode("depth") as unknown as TextureNode;
  const plumes = plume_pass.getTextureNode("output") as unknown as TextureNode;

  const near = uniform(0).onRenderUpdate(
    () => (camera as Camera & { near: number }).near,
  ) as unknown as F;
  const far = uniform(0).onRenderUpdate(
    () => (camera as Camera & { far: number }).far,
  ) as unknown as F;

  const scene_z = (uv: V2): F =>
    view_z(depth.sample(uv).x as unknown as F, near, far);

  const output = Fn(() => {
    const size = vec2(
      textureSize(plumes, int(0)) as unknown as Node<"ivec2">,
    ) as unknown as V2;

    // The four texels round the pixel, and how far it sits between them
    const at = screenUV.mul(size).sub(0.5);
    const base = floor(at);
    const between = fract(at);

    const own = scene_z(screenUV as unknown as V2);

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
        .div(size)
        .clamp(0, 1) as unknown as V2;

      const bilinear = (i === 1 ? between.x : between.x.oneMinus()).mul(
        j === 1 ? between.y : between.y.oneMinus(),
      );

      const apart = abs(scene_z(uv).sub(own)).div(
        max(abs(own), 1e-3).mul(DEPTH_TOLERANCE),
      );

      // A little of every texel, so a pixel none of them matches still has one
      const weight = bilinear.mul(exp2(apart.mul(apart).negate()).add(1e-4));

      sum.addAssign(plumes.sample(uv).mul(weight));
      total.addAssign(weight);
    }

    const plume = sum.div(max(total, 1e-6));
    const behind = color.sample(screenUV);

    // Premultiplied over: the scene, less what the plumes cover, and their light
    return vec4(behind.rgb.mul(plume.a.oneMinus()).add(plume.rgb), behind.a);
  })() as unknown as V4;

  return {
    scene: plume_scene,
    backdrop: { color, depth },
    scenePass: scene_pass,
    plumePass: plume_pass,
    output,
  };
};
