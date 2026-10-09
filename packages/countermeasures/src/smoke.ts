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
import type { SceneBackdrop } from "@aeronautic/core";
import { attribute, exp, float, vec4 } from "three/tsl";
import { unless_hidden } from "./hidden";

// The flare's smoke
//
// What the flame burns to is left in the air: magnesium's oxide and
// fluoride, and the Teflon's carbon, a white smoke laid along the flare's
// path through the air, where it stays as the aircraft flies on. Along its
// path it holds the mass the grain burnt there, ṁ / v a metre; across it the
// air's turbulence spreads it, as Richardson's law spreads two points apart:
// σ² = σ₀² + ½ ε t³, from the flame's own width. Its optical depth through
// its middle is κ λ / (√(2π) σ), the cross-section a Gaussian's
//
// It scatters the light that falls on it: the sun's, the sky's, and the
// flares' own, each burning one the brightest source by far near it. Lit
// once, by Henyey and Greenstein's phase, it shows that light times
// 1 − e^-τ over what is behind it, which it hides as much. Each trail is a
// ribbon facing the camera, laid on the CPU from points the flare left
// every tenth of a second or so, the depth worked out at each

/** Points a smoke trail keeps, its flare's head among them while it burns */
export const SMOKE_POINTS = 32;

/** Vertices a trail: two triangles between each two points */
export const SMOKE_VERTICES = (SMOKE_POINTS - 1) * 6;

/** The ribbon's half width, in σ: all but 5 % of the smoke across it */
export const SMOKE_SIGMAS = 2;

/** The thinnest smoke kept, as its optical depth through its middle */
export const SMOKE_FAINTEST = 0.02;

/**
 * The smoke's ribbons, rewritten each frame.
 * @param count How many trails
 * @returns The geometry: positions in the group's frame, the light each
 * point scatters, and where across the ribbon it is with the depth there
 */
export const create_smoke_geometry = (count: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  const vertices = Math.max(count, 1) * SMOKE_VERTICES;

  for (const [name, size] of [
    ["position", 3],
    ["color", 3],
    ["smoke", 2],
  ] as const) {
    const attribute = new Float32BufferAttribute(
      new Float32Array(vertices * size),
      size,
    );

    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }

  geometry.setDrawRange(0, 0);

  return geometry;
};

/**
 * The smoke's material: its depth across the ribbon a Gaussian's, the
 * light it scatters shown as much as it hides what is behind.
 * @param backdrop The opaque scene, when drawn in core's volume pass
 * @returns The material
 */
export const create_smoke_material = (
  backdrop?: SceneBackdrop,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const smoke = attribute("smoke", "vec2") as unknown as Node<"vec2">;
  const across = smoke.x.mul(SMOKE_SIGMAS);
  const tau = smoke.y.mul(exp(across.mul(across).mul(-0.5)));
  const alpha = float(1).sub(exp(tau.negate()));

  material.fragmentNode = unless_hidden(
    vec4(
      (attribute("color", "vec3") as unknown as Node<"vec3">).mul(alpha),
      alpha,
    ) as unknown as Node<"vec4">,
    backdrop,
  );
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;

  return material;
};

/**
 * Henyey and Greenstein's phase function.
 * @param cosine The cosine of the angle the light is turned through
 * @param g The asymmetry
 * @returns Per steradian
 */
export const henyey_greenstein = (cosine: number, g: number): number => {
  const g2 = g * g;

  return (
    (1 - g2) / (4 * Math.PI * Math.max(1 + g2 - 2 * g * cosine, 1e-6) ** 1.5)
  );
};

/**
 * How wide the smoke has spread.
 * @param sigma0_m Its σ when laid
 * @param turbulence_m2_s3 The air's turbulence, its dissipation rate ε
 * @param age_s How long since
 * @returns σ, metres
 */
export const smoke_sigma = (
  sigma0_m: number,
  turbulence_m2_s3: number,
  age_s: number,
): number =>
  Math.sqrt(
    sigma0_m * sigma0_m +
      0.5 * Math.max(turbulence_m2_s3, 0) * Math.max(age_s, 0) ** 3,
  );
