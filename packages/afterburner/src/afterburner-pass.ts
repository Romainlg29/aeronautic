import type { Camera, Object3D, Scene } from "three";
import { volume_pass, type VolumePass } from "@aeronautic/core";
import type { PassNode } from "three/webgpu";
import type { AfterburnerBackdrop } from "./afterburner-material";

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
 * The opaque scene and the plumes in passes of their own, composited: core's
 * `volume_pass`, which a wing's vapour can share with the plumes.
 */
export type AfterburnerPass = VolumePass & {
  /**
   * Where the batch's mesh goes instead of the scene. `<AfterburnerBatch>`
   * puts it there when given this pass
   */
  scene: Scene;

  /** What the plume material reads the opaque scene from */
  backdrop: AfterburnerBackdrop;

  /** The plumes alone, premultiplied, at the reduced resolution: `volumePass` */
  plumePass: PassNode;
};

/**
 * Draw the plumes at a lower resolution than the scene, and composite them.
 *
 * Core's `volume_pass`, under the name the plumes had for it first. The
 * opaque scene is drawn at full resolution, the plumes alone into a smaller
 * target, and brought back up with a depth-aware upsample, so a canopy or a
 * nozzle in front of the flame keeps its edge. A `<WingVapor>` given the same
 * pass is drawn in the same target.
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
  const split = volume_pass(scene, camera, options);

  return { ...split, plumePass: split.volumePass };
};
