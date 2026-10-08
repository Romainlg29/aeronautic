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
  type UniformNode,
} from "three/webgpu";
import { scene_depth, scene_view_z } from "@aeronautic/core";
import {
  Fn,
  asin,
  attribute,
  clamp,
  float,
  length,
  min,
  normalize,
  pow,
  select,
  uniform,
  vec4,
} from "three/tsl";

// The lights as the eye sees them
//
// Each light's glare is a quad laid on the screen on the CPU, as far round
// it as its veil is worth drawing, with the eye's spread worked out for each
// pixel from its angle off the light. A light hidden by the airframe or the
// ground has none: the scene's depth at the light says so

type F = Node<"float">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

/** Floats per vertex of each of the glare quads' attributes */
export const GLARE_ATTRIBUTES = {
  /** Where the corner is on the screen, NDC */
  position: 3,

  /** The view ray through it, in view space */
  ray: 3,

  /** The light's direction in view space, and its view z */
  light: 4,

  /**
   * Its illuminance at the eye in the scene's units, red, green and blue,
   * and the angular radius of its own disc, radians
   */
  glow: 4,

  /**
   * Where it is on the screen, uv, or below zero if off it; its disc's
   * luminance per lux; and how far in front of it the scene may be and
   * leave it seen, metres
   */
  centre: 4,
} as const;

/**
 * The glare's quads, two triangles a light, their corners rewritten each
 * frame.
 * @param count How many lights
 * @returns The geometry
 */
export const create_glare_geometry = (count: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  const vertices = Math.max(count, 1) * 6;

  for (const [name, size] of Object.entries(GLARE_ATTRIBUTES)) {
    const attribute = new Float32BufferAttribute(
      new Float32Array(vertices * size),
      size,
    );

    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }

  geometry.setDrawRange(0, count * 6);

  return geometry;
};

/**
 * The glare's uniforms.
 */
export type GlareUniforms = {
  /** The CIE equation's age factor, 1 + (A/62.5)⁴ */
  age: UniformNode<"float", number>;

  /** The eyes' pigmentation */
  pigmentation: UniformNode<"float", number>;
};

/**
 * Make the glare's uniforms.
 * @returns Fresh uniforms
 */
export const create_glare_uniforms = (): GlareUniforms => ({
  age: uniform(1) as UniformNode<"float", number>,
  pigmentation: uniform(0.5) as UniformNode<"float", number>,
});

/**
 * The glare's material.
 * @param uniforms Its uniforms
 * @returns The material
 */
export const create_glare_material = (
  uniforms: GlareUniforms,
): MeshBasicNodeMaterial => {
  const age = uniforms.age as unknown as F;
  const p = uniforms.pigmentation as unknown as F;

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });

  // Laid on the screen as they are: the CPU worked out where
  const corner = attribute("position", "vec3") as unknown as V3;

  material.vertexNode = vec4(corner.xy, 0.5, 1) as unknown as V4;

  material.fragmentNode = Fn(() => {
    const ray = normalize(attribute("ray", "vec3") as unknown as V3);
    const light = attribute("light", "vec4") as unknown as V4;
    const glow = attribute("glow", "vec4") as unknown as V4;
    const centre = attribute("centre", "vec4") as unknown as V4;

    // The angle off the light, from the chord between the two directions,
    // which keeps its precision near the light where an arccosine does not
    const chord = length(ray.sub(light.xyz));
    const theta = asin(min(chord.mul(0.5), 1)).mul(2) as unknown as F;
    const degrees = clamp(theta.mul(180 / Math.PI), 0.1, 100);

    // CIE 146:2002, per lux at the eye, and the light's own disc inside it
    const veil = float(10)
      .div(pow(degrees, 3))
      .add(
        float(5)
          .div(degrees.mul(degrees))
          .add(p.mul(0.1).div(degrees))
          .mul(age),
      )
      .add(p.mul(0.0025));
    const spread = select(theta.lessThan(glow.w), centre.z, veil);

    // Hidden, if the scene at the light is nearer than it
    const on_screen = centre.x.greaterThanEqual(0);
    const scene_z = scene_view_z(scene_depth().sample(centre.xy) as never);
    const seen = select(
      on_screen.and(scene_z.greaterThan(light.w.add(centre.w))),
      float(0),
      float(1),
    );

    return vec4(glow.rgb.mul(spread).mul(seen), 0);
  })() as unknown as V4;

  // Light added over what is behind
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;

  return material;
};
