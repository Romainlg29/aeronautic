import { Color, type Camera, type Object3D, Scene } from "three";
import {
  abs,
  convertToTexture,
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

type F = Node<"float">;
type V2 = Node<"vec2">;
type V4 = Node<"vec4">;

// How far a reduced texel's scene may sit from the pixel's, as a share of the
// pixel's own depth, before it stops lending the pixel its volume
const DEPTH_TOLERANCE = 0.03;

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
 * The opaque scene, drawn in a pass of its own, as a volume drawn in another
 * reads it: its colour to see through, and its depth to stop at.
 */
export type SceneBackdrop = {
  /** Its colour */
  color: TextureNode;

  /** Its depth */
  depth: TextureNode;
};

/**
 * How `volume_pass` draws the volumes.
 */
export type VolumePassOptions = {
  /**
   * The volumes' resolution against the frame's. A raymarch costs per pixel,
   * and flame and fog are soft enough that half of it, a quarter of the
   * pixels, is seldom seen
   */
  resolutionScale?: number;

  /**
   * What the opaque scene becomes before the volumes are laid over it, from
   * its colour and depth: an atmosphere's aerial perspective, its sky where
   * nothing was drawn. The volumes see through it and are composited over
   * it, so a sky drawn here is behind them rather than over them. Drawn to a
   * texture of its own, once a frame. Left out, the scene as it was drawn
   */
  backdropNode?: (scene: SceneBackdrop) => Node<"vec4">;
};

/**
 * The opaque scene and the volumes in passes of their own, composited.
 */
export type VolumePass = {
  /**
   * Where the volumes' meshes go instead of the scene: a plume batch's, a
   * wing's vapour. Their components put them there when given this pass
   */
  scene: Scene;

  /**
   * What the volumes read the opaque scene from: its colour as
   * `backdropNode` made it, and its depth
   */
  backdrop: SceneBackdrop;

  /** The scene at full resolution, without the volumes */
  scenePass: PassNode;

  /** The volumes alone, premultiplied, at the reduced resolution */
  volumePass: PassNode;

  /**
   * The two composited at full resolution, for a render pipeline's output or
   * whatever comes after it, bloom say
   */
  output: V4;
};

/**
 * Draw raymarched volumes at a lower resolution than the scene, and composite
 * them.
 *
 * The opaque scene is drawn first at full resolution, then the volumes alone
 * into a smaller target, reading the scene's depth to stop at what is in front
 * of them and its colour to see through. Every volume of the aeronautic
 * effects blends premultiplied, so any number of them share the one target
 * and come out as they would have over the scene. They are brought back up
 * with a depth-aware upsample: each pixel takes its volume only from the
 * nearby texels whose scene sits at its own depth, so a canopy or a nozzle in
 * front of a flame keeps its edge rather than wearing a fringe of fire.
 *
 * Hand the result to the effects' components as `pass`, or put their meshes in
 * `pass.scene` and build them with `backdrop: pass.backdrop`, and use
 * `pass.output` as the render pipeline's output.
 * @param scene The scene, volumes left out of it
 * @param camera The camera
 * @param options How finely to draw the volumes
 * @returns The passes, and the composite
 */
export const volume_pass = (
  scene: Object3D,
  camera: Camera,
  options: VolumePassOptions = {},
): VolumePass => {
  const {
    resolutionScale: resolution_scale = 0.5,
    backdropNode: backdrop_node,
  } = options;

  const scene_pass = pass(scene, camera);

  // The volumes' own scene: no background, and cleared to nothing, whatever
  // the renderer's clear colour, so what is left is the volumes alone
  const volume_scene = new Scene();

  const kept_color = new Color();
  let kept_alpha = 1;

  volume_scene.onBeforeRender = (renderer) => {
    // The volumes are fogged as the scene they are drawn over is
    volume_scene.fog = (scene as Partial<Scene>).fog ?? null;

    renderer.getClearColor(kept_color);
    kept_alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
  };

  volume_scene.onAfterRender = (renderer) => {
    renderer.setClearColor(kept_color, kept_alpha);
  };

  const volumes_pass = pass(volume_scene, camera);

  volumes_pass.setResolutionScale(resolution_scale);

  const drawn = scene_pass.getTextureNode("output") as unknown as TextureNode;
  const depth = scene_pass.getTextureNode("depth") as unknown as TextureNode;

  // What the volumes stand in front of: the scene, or what it was made into
  const color = backdrop_node
    ? (convertToTexture(
        backdrop_node({ color: drawn, depth }),
      ) as unknown as TextureNode)
    : drawn;
  const volumes = volumes_pass.getTextureNode(
    "output",
  ) as unknown as TextureNode;

  // The scene camera's planes: the composite is drawn with a camera of its own
  const near = uniform(0).onRenderUpdate(
    () => (camera as Camera & { near: number }).near,
  ) as unknown as F;
  const far = uniform(0).onRenderUpdate(
    () => (camera as Camera & { far: number }).far,
  ) as unknown as F;

  const scene_z = (uv: V2): F =>
    view_z(depth.sample(uv).x as unknown as F, near, far);

  const output = Fn(() => {
    // First, so the backdrop is drawn before the volumes that read it
    const behind = color.sample(screenUV);

    const size = vec2(
      textureSize(volumes, int(0)) as unknown as Node<"ivec2">,
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

      sum.addAssign(volumes.sample(uv).mul(weight));
      total.addAssign(weight);
    }

    const volume = sum.div(max(total, 1e-6));

    // Premultiplied over: the scene, less what the volumes cover, and their light
    return vec4(behind.rgb.mul(volume.a.oneMinus()).add(volume.rgb), behind.a);
  })() as unknown as V4;

  return {
    scene: volume_scene,
    backdrop: { color, depth },
    scenePass: scene_pass,
    volumePass: volumes_pass,
    output,
  };
};
