import { scene_view_z, type SceneBackdrop } from "@aeronautic/core";
import type { Node } from "three/webgpu";
import { positionView, screenUV, select, vec4 } from "three/tsl";

// Hidden by the opaque scene, drawn in a pass of its own
//
// In core's volume pass the flames, the smoke and the chaff are drawn into
// a scene of their own, with nothing in its depth buffer: the airframe in
// front of them is in the opaque scene's. Its depth, as the pass gives it,
// hides them where it is nearer

/**
 * A premultiplied colour, or nothing where the opaque scene is in front of
 * the fragment.
 * @param color What the fragment adds and hides
 * @param backdrop The opaque scene, from core's `volume_pass`. Left out,
 *   the depth test does it, the mesh being drawn in the scene itself
 * @returns The colour, hidden or not
 */
export const unless_hidden = (
  color: Node<"vec4">,
  backdrop?: SceneBackdrop,
): Node<"vec4"> =>
  backdrop
    ? (select(
        positionView.z.lessThan(
          scene_view_z(backdrop.depth.sample(screenUV) as never),
        ),
        vec4(0),
        color,
      ) as unknown as Node<"vec4">)
    : color;
