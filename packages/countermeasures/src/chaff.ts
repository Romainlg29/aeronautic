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
import { attribute, exp, float, vec4 } from "three/tsl";
import { G0 } from "./flare";

// Chaff: a cartridge of dipoles
//
// A chaff cartridge holds millions of aluminised glass fibres, each cut to
// half a radar's wavelength: 7.5 to 75 mm over 2 to 20 GHz, 25.4 µm thick.
// The cartridge throws them into the airstream, which tears the packet
// apart layer by layer: a cloud forms in a fifth of a second, about 1.75 m
// wide and 11 m long at 244 m/s (US patent 4,653,403). A fibre that thin
// is stopped by the air within a metre, so the cloud stays where it formed
// as the aircraft flies on, sinking slowly, and the air's turbulence
// spreads it as it does the smoke
//
// To the eye it is a faint grey puff: all those fibres stop light with
// their shadow, π d L / 4 over every orientation, under 2 m² for the
// cartridge, and their aluminium sends on 0.91 of it. A convex mirror turned
// every way scatters the same way in every direction, so it is lit with an
// isotropic phase. One camera-facing quad a cloud, its depth a Gaussian
// across both its axes

/**
 * A chaff cartridge's payload.
 */
export type Chaff = {
  /** All its dipoles, end to end, metres */
  dipoleLengthM: number;

  /** One dipole's diameter, its coating included, metres */
  dipoleDiameterM: number;

  /** A typical dipole's length, metres: the cuts' geometric mean */
  cutLengthM: number;

  /** The aluminised glass's density, kg/m³ */
  densityKgPerM3: number;

  /** The share of the light falling on a dipole its aluminium reflects */
  reflectance: number;

  /** What the cartridge throws the payload out at, m/s. An estimate */
  ejectionMPerS: number;

  /** How long the airstream takes to tear it into a cloud, seconds */
  bloomTimeS: number;

  /** The cloud then, across and along its path, ±2σ, metres */
  bloomWidthM: number;
  bloomLengthM: number;

  /** The airspeed that length is at, m/s: it is laid over its path */
  bloomAtMPerS: number;
};

/**
 * Chaff payloads by name.
 *
 * The RR-178's dipoles total 88,775 m (Dalkıran, Bilkent University),
 * aluminised glass a mil thick, 25.4 µm, the usual. Glass is 2540 kg/m³
 * and aluminium 2700: 2600 for the two, so the cartridge throws 117 g, a
 * little under the third of a pound US patent 4,653,403 gives. Its cuts
 * span 2 to 20 GHz, 7.5 to 75 mm, 24 mm their geometric mean. Aluminium
 * reflects 0.91 of visible light. The patent's cloud is 1.5 to 2 m across
 * and 10 to 12 m long at about 800 ft/s, formed in 200 ms. The throw is
 * taken as the flare's, the same impulse cartridge: an estimate
 */
export const CHAFF = {
  rr178: {
    dipoleLengthM: 88_775,
    dipoleDiameterM: 25.4e-6,
    cutLengthM: 0.024,
    densityKgPerM3: 2600,
    reflectance: 0.91,
    ejectionMPerS: 30.3,
    bloomTimeS: 0.2,
    bloomWidthM: 1.75,
    bloomLengthM: 11,
    bloomAtMPerS: 244,
  },
} as const satisfies Record<string, Chaff>;

/** A chaff payload's name */
export type ChaffName = keyof typeof CHAFF;

/** Corners of each cloud's quad: two triangles */
export const CHAFF_VERTICES = 6;

/** The quad's half width, in σ: all but a hundredth of the cloud in it */
export const CHAFF_SIGMAS = 3;

/**
 * The payload's mass.
 * @param chaff The payload
 * @returns kg
 */
export const chaff_mass = (chaff: Chaff): number =>
  ((Math.PI * chaff.dipoleDiameterM ** 2) / 4) *
  chaff.dipoleLengthM *
  chaff.densityKgPerM3;

/**
 * How many dipoles it holds.
 * @param chaff The payload
 * @returns Their number, of the typical cut
 */
export const dipole_count = (chaff: Chaff): number =>
  chaff.dipoleLengthM / chaff.cutLengthM;

/**
 * The light all its dipoles stop: their shadow, a quarter of their surface
 * over every orientation, as any convex body's.
 * @param chaff The payload
 * @returns m²
 */
export const chaff_cross_section = (chaff: Chaff): number =>
  (Math.PI * chaff.dipoleDiameterM * chaff.dipoleLengthM) / 4;

/**
 * The air's dynamic viscosity, Sutherland's law.
 * @param temperature_k The air's temperature
 * @returns Pa·s
 */
export const air_viscosity = (temperature_k: number): number =>
  (1.458e-6 * temperature_k ** 1.5) / (temperature_k + 110.4);

/**
 * How fast a dipole falls once the air has it: a slender rod falling
 * broadside, slowly enough for Stokes's drag, 4πμU / (ln(2L/d) + ½) a metre
 * of it, against its weight. At its Reynolds number, about 1, the rod
 * turns broadside as it falls.
 * @param chaff The payload
 * @param temperature_k The air's temperature
 * @returns m/s
 */
export const chaff_fall_speed = (
  chaff: Chaff,
  temperature_k: number,
): number => {
  const d = chaff.dipoleDiameterM;

  return (
    (chaff.densityKgPerM3 *
      G0 *
      d *
      d *
      (Math.log((2 * chaff.cutLengthM) / d) + 0.5)) /
    (16 * air_viscosity(temperature_k))
  );
};

/**
 * How far the cloud has bloomed, 0 to 1: the airstream tears off less as
 * the packet slows.
 * @param chaff The payload
 * @param age_s How long since it left
 * @returns Its share of its bloomed size
 */
export const chaff_bloom = (chaff: Chaff, age_s: number): number => {
  const left = 1 - Math.min(Math.max(age_s / chaff.bloomTimeS, 0), 1);

  return 1 - left * left;
};

/**
 * The chaff's quads, rewritten each frame.
 * @param count How many clouds
 * @returns The geometry: positions in the group's frame, the light each
 * cloud scatters, and where on it each corner is with its depth
 */
export const create_chaff_geometry = (count: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  const vertices = Math.max(count, 1) * CHAFF_VERTICES;

  for (const [name, size] of [
    ["position", 3],
    ["color", 3],
    ["chaff", 3],
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
 * The chaff's material: its depth a Gaussian across both its axes, the
 * light it scatters shown as much as it hides what is behind.
 * @returns The material
 */
export const create_chaff_material = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const chaff = attribute("chaff", "vec3") as unknown as Node<"vec3">;
  const u = chaff.x.mul(CHAFF_SIGMAS);
  const v = chaff.y.mul(CHAFF_SIGMAS);
  const tau = chaff.z.mul(exp(u.mul(u).add(v.mul(v)).mul(-0.5)));
  const alpha = float(1).sub(exp(tau.negate()));

  material.fragmentNode = vec4(
    (attribute("color", "vec3") as unknown as Node<"vec3">).mul(alpha),
    alpha,
  ) as unknown as Node<"vec4">;
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;

  return material;
};
