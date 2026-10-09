import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from "three";
import {
  CustomBlending,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
  type UniformNode,
} from "three/webgpu";
import { scene_depth, scene_view_z } from "./scene";
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

const scratch_size = new Vector2();
const scratch_direction = new Vector3();
const scratch_up = new Vector3();
const scratch_side = new Vector3();
const scratch_point = new Vector3();

/**
 * A pixel's angular radius at the middle of a camera's view: no light's own
 * disc is drawn smaller.
 * @param renderer The renderer, for its drawing buffer's size
 * @param camera The camera
 * @returns Radians
 */
export const glare_pixel = (
  renderer: { getDrawingBufferSize: (target: Vector2) => Vector2 },
  camera: PerspectiveCamera,
): number => {
  renderer.getDrawingBufferSize(scratch_size);

  return Math.atan(
    1 / camera.projectionMatrix.elements[5] / Math.max(scratch_size.y, 1),
  );
};

/**
 * One light's glare, as `lay_glare` draws it.
 */
export type GlareLight = {
  /** Where the light is, in the camera's view space */
  view: Vector3;

  /** Its illuminance at the eye, red, green and blue, in the scene's units */
  rgb: readonly [number, number, number];

  /** The angular radius of its own disc, radians */
  core: number;

  /** The disc's luminance per lux at the eye */
  coreLuminance: number;

  /** How far round it its veil is worth drawing, radians */
  radius: number;

  /** How far in front of it the scene may be and leave it seen, metres */
  bias: number;
};

/**
 * Lay one light's glare quad on the screen, as far round it as its veil
 * reaches, or nothing if it is off the screen.
 * @param geometry The glare's geometry, from `create_glare_geometry`
 * @param index Which quad
 * @param camera The camera it is seen from
 * @param light The light
 */
export const lay_glare = (
  geometry: BufferGeometry,
  index: number,
  camera: PerspectiveCamera,
  light: GlareLight,
) => {
  const position = geometry.getAttribute("position").array as Float32Array;
  const ray = geometry.getAttribute("ray").array as Float32Array;
  const light_attribute = geometry.getAttribute("light").array as Float32Array;
  const glow = geometry.getAttribute("glow").array as Float32Array;
  const centre = geometry.getAttribute("centre").array as Float32Array;

  const projection = camera.projectionMatrix;
  const view = light.view;
  const radius = light.radius;
  const direction = scratch_direction.copy(view).normalize();
  const vertex = index * 6;

  // Where on the screen, and how far round, its veil reaches
  let x0 = -1;
  let x1 = 1;
  let y0 = -1;
  let y1 = 1;

  const off_axis = Math.acos(Math.min(Math.max(-direction.z, -1), 1));

  if (off_axis + radius < (85 * Math.PI) / 180) {
    x0 = Infinity;
    x1 = -Infinity;
    y0 = Infinity;
    y1 = -Infinity;

    // Two directions square to the light's, round which the cone's rim is
    // laid
    scratch_up.set(0, 1, 0).addScaledVector(direction, -direction.y);

    if (scratch_up.lengthSq() < 1e-8) scratch_up.set(1, 0, 0);

    scratch_up.normalize();

    const side = scratch_side.crossVectors(direction, scratch_up);
    const steps = 24;
    const cos_radius = Math.cos(radius);
    const sin_radius = Math.sin(radius);

    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      const cos = Math.cos(angle) * sin_radius;
      const sin = Math.sin(angle) * sin_radius;

      // A point on the rim, as a view space position, then its NDC
      const projected = scratch_point
        .set(
          direction.x * cos_radius + scratch_up.x * cos + side.x * sin,
          direction.y * cos_radius + scratch_up.y * cos + side.y * sin,
          direction.z * cos_radius + scratch_up.z * cos + side.z * sin,
        )
        .applyMatrix4(projection);

      x0 = Math.min(x0, projected.x);
      x1 = Math.max(x1, projected.x);
      y0 = Math.min(y0, projected.y);
      y1 = Math.max(y1, projected.y);
    }

    // The rim's ellipse bulges between the points by up to 1/cos(π/24)
    const pad_x = (x1 - x0) * 0.01;
    const pad_y = (y1 - y0) * 0.01;

    x0 = Math.max(x0 - pad_x, -1);
    x1 = Math.min(x1 + pad_x, 1);
    y0 = Math.max(y0 - pad_y, -1);
    y1 = Math.min(y1 + pad_y, 1);
  }

  if (!(x1 > x0 && y1 > y0)) {
    position.fill(0, vertex * 3, (vertex + 6) * 3);

    return;
  }

  // Where the light itself is on the screen, to read the depth there
  let u_centre = -1;
  let v_centre = -1;

  if (view.z < 0) {
    const ndc = scratch_point.copy(view).applyMatrix4(projection);

    if (Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) {
      u_centre = (ndc.x + 1) / 2;
      v_centre = (1 - ndc.y) / 2;
    }
  }

  const corners = [x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1];
  const [r, g, b] = light.rgb;

  for (let corner = 0; corner < 6; corner++) {
    const at = vertex + corner;
    const cx = corners[corner * 2];
    const cy = corners[corner * 2 + 1];

    position[at * 3] = cx;
    position[at * 3 + 1] = cy;
    position[at * 3 + 2] = 0;

    // The view ray through the corner: a point on one depth plane, so it
    // interpolates linearly across the screen
    const through = scratch_point
      .set(cx, cy, 0.5)
      .applyMatrix4(camera.projectionMatrixInverse);

    ray[at * 3] = through.x;
    ray[at * 3 + 1] = through.y;
    ray[at * 3 + 2] = through.z;

    light_attribute[at * 4] = direction.x;
    light_attribute[at * 4 + 1] = direction.y;
    light_attribute[at * 4 + 2] = direction.z;
    light_attribute[at * 4 + 3] = view.z;

    glow[at * 4] = r;
    glow[at * 4 + 1] = g;
    glow[at * 4 + 2] = b;
    glow[at * 4 + 3] = light.core;

    centre[at * 4] = u_centre;
    centre[at * 4 + 1] = v_centre;
    centre[at * 4 + 2] = light.coreLuminance;
    centre[at * 4 + 3] = light.bias;
  }
};

/**
 * Leave a light's quad undrawn.
 * @param geometry The glare's geometry
 * @param index Which quad
 */
export const hide_glare = (geometry: BufferGeometry, index: number) => {
  const position = geometry.getAttribute("position").array as Float32Array;

  position.fill(0, index * 18, (index + 1) * 18);
};

/**
 * Send the laid quads to the GPU, and draw so many of them.
 * @param geometry The glare's geometry
 * @param count How many quads
 */
export const glare_laid = (geometry: BufferGeometry, count: number) => {
  for (const name of Object.keys(GLARE_ATTRIBUTES)) {
    geometry.getAttribute(name).needsUpdate = true;
  }

  geometry.setDrawRange(0, count * 6);
};
