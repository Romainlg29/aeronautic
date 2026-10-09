import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
} from "three";
import {
  CustomBlending,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
} from "three/webgpu";
import { attribute, vec4 } from "three/tsl";

// The flame's trail
//
// In the airstream the flame's hot products are left in the air as the
// grain flies on: each stays where it left the grain, glowing as it cools,
// so the trail lies along the flare's path through the air, behind it, as
// long as its speed times how long they glow. Its light falls off along it
// as they cool, an e-fold each speed × glow time. Each trail is a ribbon
// facing the camera, its luminance the light per metre over its width, laid
// on the CPU a few cross-sections at a time

/** The ribbon's segments: an e-fold of the light over each one and a half */
export const TRAIL_SEGMENTS = 4;

/** How many e-folds of the light are drawn: all but 5 % of it */
export const TRAIL_E_FOLDS = 3;

/** Vertices a trail: two triangles a segment */
export const TRAIL_VERTICES = TRAIL_SEGMENTS * 6;

/**
 * The trails' ribbons, rewritten each frame.
 * @param count How many flares
 * @returns The geometry: positions in the group's frame, and luminances
 */
export const create_trail_geometry = (count: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  const vertices = Math.max(count, 1) * TRAIL_VERTICES;

  for (const name of ["position", "color"]) {
    const attribute = new Float32BufferAttribute(
      new Float32Array(vertices * 3),
      3,
    );

    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }

  geometry.setDrawRange(0, 0);

  return geometry;
};

/**
 * The trails' material: each vertex's luminance in the scene's units, added
 * over what is behind, hidden by what is in front.
 * @returns The material
 */
export const create_trail_material = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  material.fragmentNode = vec4(
    attribute("color", "vec3") as unknown as Node<"vec3">,
    0,
  ) as unknown as Node<"vec4">;
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;

  return material;
};
