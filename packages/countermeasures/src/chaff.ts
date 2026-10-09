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
import {
  Fn,
  If,
  Loop,
  attribute,
  cos,
  exp,
  float,
  hash,
  log,
  max,
  screenCoordinate,
  select,
  sqrt,
  vec4,
} from "three/tsl";
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
// every way scatters the same way in every direction, so on the whole it is
// lit with an isotropic phase. But each fibre is a mirror cylinder: it sends
// a source's light on a cone round its axis, and only the fibres whose axis
// is square to the half way between the source and the eye send it to the
// eye. Those few carry all of it: the cloud glitters, the more where it is
// thin. One camera-facing quad a cloud, its depth a Gaussian across both its
// axes, each pixel's glints drawn as so many as fall in it

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

/** The sun's angular radius, radians: 0.267° */
export const SUN_RADIUS_RAD = 4.65e-3;

/** Past this many glints a pixel, their count is drawn as a normal's */
const POISSON_NORMAL = 12;

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
 * How fast a dipole falls once the air has it, broadside, as inertia turns
 * a falling rod. Its Reynolds number across it is a few tenths: the air's
 * wake reaches only a few of its diameters, far short of its length, so
 * each length of it is a cylinder in Oseen's flow, with Lamb's drag
 * 4πμU / (½ − γ − ln(Re/8)) a metre, against its weight. One-mil chaff is
 * measured to fall at 0.18 to 0.3 m/s at sea level, about twice that at
 * 40,000 ft (Stine, 1980); this gives 0.18 and 0.28.
 * @param chaff The payload
 * @param temperature_k The air's temperature
 * @param density_kg_m3 The air's density
 * @returns m/s
 */
export const chaff_fall_speed = (
  chaff: Chaff,
  temperature_k: number,
  density_kg_m3: number,
): number => {
  const d = chaff.dipoleDiameterM;
  const mu = air_viscosity(temperature_k);
  const weight = (chaff.densityKgPerM3 * G0 * d * d) / (16 * mu);
  let speed = weight;

  // The drag goes with the speed but through a logarithm: a few steps settle it
  for (let step = 0; step < 16; step++) {
    const reynolds = Math.max((density_kg_m3 * speed * d) / mu, 1e-9);

    speed = weight * Math.max(0.5 - 0.5772 + Math.log(8 / reynolds), 1);
  }

  return speed;
};

/**
 * How fast the air's turbulence turns a dipole: eddies its own size turn it,
 * at (ε / L²)^⅓, as rods in the inertial range tumble (Parsa et al., PRL
 * 2012). Its order-one constant taken as 1: an estimate.
 * @param chaff The payload
 * @param turbulence_m2_s3 The air's dissipation rate
 * @returns rad/s
 */
export const dipole_tumble_rate = (
  chaff: Chaff,
  turbulence_m2_s3: number,
): number => Math.cbrt(turbulence_m2_s3 / chaff.cutLengthM ** 2);

/**
 * The share of a cloud's dipoles that glint to the eye over a frame. A
 * mirror cylinder sends a source's light on a cone round its axis, so the
 * eye sees it when the axis is square to h, half way between the source and
 * the eye, within the source's radius over |s + v|. For axes turned every
 * way that bound is the share. Turning, each fibre sweeps through more of
 * them over the frame.
 * @param radius_rad The source's angular radius from the cloud
 * @param half_length |s + v|, the source's and the eye's directions summed
 * @param sweep_rad How far the fibres turn against h over the frame
 * @returns 0 to 1
 */
export const glint_share = (
  radius_rad: number,
  half_length: number,
  sweep_rad: number,
): number => Math.min(radius_rad / Math.max(half_length, 1e-6) + sweep_rad, 1);

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
 * cloud scatters from the sky, the light it glints from the sun and the
 * flares with a seed for them, and where on it each corner is with its
 * depth and the glints a pixel holds for each unit of it
 */
export const create_chaff_geometry = (count: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  const vertices = Math.max(count, 1) * CHAFF_VERTICES;

  for (const [name, size] of [
    ["position", 3],
    ["color", 3],
    ["glint", 4],
    ["chaff", 4],
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
 * How many glints fall in a pixel: Poisson's count for the mean given,
 * summed term by term while it is small, a normal's past that.
 */
const glint_count = Fn(
  ([mean, first, second]: [Node<"float">, Node<"float">, Node<"float">]) => {
    const term = exp(mean.negate()).toVar();
    const sum = term.toVar();
    const count = float(0).toVar();

    Loop(POISSON_NORMAL * 2, () => {
      If(first.greaterThan(sum), () => {
        count.addAssign(1);
        term.mulAssign(mean.div(count));
        sum.addAssign(term);
      });
    });

    // Box and Muller's normal from the two
    const normal = sqrt(log(max(first, 1e-7)).mul(-2)).mul(
      cos(second.mul(2 * Math.PI)),
    );

    return select(
      mean.greaterThan(POISSON_NORMAL),
      max(mean.add(sqrt(mean).mul(normal)), 0),
      count,
    );
  },
);

/**
 * The chaff's material: its depth a Gaussian across both its axes, the
 * light it scatters shown as much as it hides what is behind, its glints
 * counted pixel by pixel.
 * @returns The material
 */
export const create_chaff_material = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const chaff = attribute("chaff", "vec4") as unknown as Node<"vec4">;
  const glint = attribute("glint", "vec4") as unknown as Node<"vec4">;
  const u = chaff.x.mul(CHAFF_SIGMAS);
  const v = chaff.y.mul(CHAFF_SIGMAS);
  const tau = chaff.z.mul(exp(u.mul(u).add(v.mul(v)).mul(-0.5)));
  const alpha = float(1).sub(exp(tau.negate()));

  // A seed for each pixel, cloud and step of the clock
  const seed = screenCoordinate.x
    .toUint()
    .add(screenCoordinate.y.toUint().mul(7919))
    .add(glint.w.toUint().mul(2654435761));
  const mean = tau.mul(chaff.w);
  const count = glint_count(mean, hash(seed), hash(seed.bitXor(0x5bd1e995)));

  material.fragmentNode = vec4(
    (attribute("color", "vec3") as unknown as Node<"vec3">)
      .add(glint.xyz.mul(count.div(max(mean, 1e-12))))
      .mul(alpha),
    alpha,
  ) as unknown as Node<"vec4">;
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;

  return material;
};
