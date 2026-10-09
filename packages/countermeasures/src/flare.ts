import { band_radiance, blackbody_luminance } from "./graybody";

// A decoy flare: a grain of magnesium, Teflon and Viton (MTV) that burns as
// hot as a jet's exhaust and many times as bright, thrown from the aircraft
//
// The grain burns from every face at once, each face receding at the
// composition's linear burn rate, so a block a × b × c is (a - 2rt) ×
// (b - 2rt) × (c - 2rt) at t, and burns out when its thinnest side is gone.
// What it burns a second, the mass rate, is the density times the rate times
// the burning surface; what it radiates is that times the composition's
// efficiency, as Debnath et al.'s Eq. 1 has it, I = ṁ Hc F ε / 4π, measured
// as one number in W s/(sr g)
//
// That intensity is in a seeker's band. The flame's temperature carries it
// to the eye: a graybody's luminance over its radiance in the band is the
// candela each W/sr of the band brings, and the band's intensity over its
// radiance is the flame's area
//
// Thrown, it is a small dense block in the airstream: its own drag slows it
// from the aircraft's speed within a second or two, while gravity pulls it
// down. A tumbling convex body shows, on average, a quarter of its surface
// to the flow (Cauchy's formula), and a block's drag coefficient on it is a
// cube's, about 1.05 (Hoerner, Fluid-Dynamic Drag, 1965). As it burns it
// gets lighter and smaller, and slows faster

/** Standard gravity, m/s² */
export const G0 = 9.80665;

/**
 * A flare's make: its grain, its composition and how it is thrown.
 */
export type Flare = {
  /**
   * The grain's cross-section, the two short sides, metres. Its length
   * follows from its mass and density
   */
  crossSectionM: readonly [number, number];

  /** The composition's mass, kilograms */
  massKg: number;

  /** The grain's density, kg/m³ */
  densityKgPerM3: number;

  /** How fast each burning face recedes, m/s */
  burnRateMPerS: number;

  /**
   * The energy it radiates in its band, per kilogram burnt, per steradian:
   * its intensity's integral over the burn, over its mass. J/(kg sr)
   */
  bandEnergyJPerKgSr: number;

  /** The band that is measured in, metres: short end, long end */
  bandM: readonly [number, number];

  /** The flame's temperature, kelvin */
  temperatureK: number;

  /** The flame's emissivity, as a graybody */
  emissivity: number;

  /** The tumbling grain's drag coefficient, on its mean projected area */
  dragCoefficient: number;

  /** How fast the cartridge throws it from the dispenser, m/s */
  ejectionMPerS: number;
};

/**
 * MTV1, the baseline magnesium/Teflon/Viton composition, by mass.
 */
export const MTV_FRACTIONS = { magnesium: 0.5, teflon: 0.45, viton: 0.05 };

/**
 * The ingredients' densities, kg/m³, as Debnath et al. give them.
 */
export const MTV_DENSITIES = { magnesium: 1740, teflon: 2140, viton: 1850 };

/**
 * A mixture's theoretical density: the mass over the sum of each
 * ingredient's volume.
 * @param fractions Each ingredient's share of the mass
 * @param densities Each one's density, kg/m³
 * @returns kg/m³
 */
export const mixture_density = <K extends string>(
  fractions: Record<K, number>,
  densities: Record<K, number>,
): number => {
  let volume = 0;
  let mass = 0;

  for (const key of Object.keys(fractions) as K[]) {
    mass += fractions[key];
    volume += fractions[key] / densities[key];
  }

  return mass / volume;
};

/**
 * Flares, by name.
 */
export const FLARE = {
  /**
   * An MJU-7A/B class flare, the 1 × 2 × 8 inch cartridge most western
   * fighters carry, as Chemring's drop-in CM 218 is published: 253 g of MTV
   * in a 51.8 × 24.6 mm case. The grain fills the case less its walls, a
   * millimetre each side, pressed to the mixture's theoretical density
   *
   * It burns as Debnath et al.'s baseline MTV1 does (CEJEM 22(2), 2025):
   * 3.86 mm/s, 179 W s/(sr g) between 1.8 and 2.6 µm. An MTV flame is 2000 to
   * 2200 K, emissivity about 0.95: the middle of that. US patent 5,400,712
   * measured its ejection at 99.5 ft/s
   */
  mju7: {
    crossSectionM: [0.0226, 0.0498],
    massKg: 0.253,
    densityKgPerM3: mixture_density(MTV_FRACTIONS, MTV_DENSITIES),
    burnRateMPerS: 3.86e-3,
    bandEnergyJPerKgSr: 179e3,
    bandM: [1.8e-6, 2.6e-6],
    temperatureK: 2100,
    emissivity: 0.95,
    dragCoefficient: 1.05,
    ejectionMPerS: 30.3,
  },
} as const satisfies Record<string, Flare>;

/** A flare's name */
export type FlareName = keyof typeof FLARE;

/**
 * The grain, part burnt.
 */
export type Grain = {
  /** Its three sides, metres */
  sides: [number, number, number];

  /** What is left of it, kilograms */
  massKg: number;

  /** Its burning surface, m² */
  surfaceM2: number;
};

/**
 * The grain's length: its mass over its density and cross-section.
 * @param flare The flare
 * @returns Metres
 */
export const grain_length = (flare: Flare): number =>
  flare.massKg /
  (flare.densityKgPerM3 * flare.crossSectionM[0] * flare.crossSectionM[1]);

/**
 * How long the flare burns: until its thinnest side is gone.
 * @param flare The flare
 * @returns Seconds
 */
export const burn_time = (flare: Flare): number =>
  Math.min(
    flare.crossSectionM[0],
    flare.crossSectionM[1],
    grain_length(flare),
  ) /
  (2 * flare.burnRateMPerS);

/**
 * The grain after burning a while.
 * @param flare The flare
 * @param age_s How long it has burnt, seconds
 * @param target Where to write it
 * @returns target
 */
export const grain_at = (
  flare: Flare,
  age_s: number,
  target: Grain = { sides: [0, 0, 0], massKg: 0, surfaceM2: 0 },
): Grain => {
  const burnt = 2 * flare.burnRateMPerS * Math.max(age_s, 0);
  const a = Math.max(flare.crossSectionM[0] - burnt, 0);
  const b = Math.max(flare.crossSectionM[1] - burnt, 0);
  const c = Math.max(grain_length(flare) - burnt, 0);
  const left = a > 0 && b > 0 && c > 0;

  target.sides[0] = a;
  target.sides[1] = b;
  target.sides[2] = c;
  target.massKg = left ? flare.densityKgPerM3 * a * b * c : 0;
  target.surfaceM2 = left ? 2 * (a * b + b * c + c * a) : 0;

  return target;
};

/**
 * How much of the grain burns a second.
 * @param flare The flare
 * @param grain The grain now
 * @returns kg/s
 */
export const mass_rate = (flare: Flare, grain: Grain): number =>
  flare.densityKgPerM3 * flare.burnRateMPerS * grain.surfaceM2;

/**
 * Its intensity in the band it is measured in.
 * @param flare The flare
 * @param grain The grain now
 * @returns W/sr
 */
export const band_intensity = (flare: Flare, grain: Grain): number =>
  mass_rate(flare, grain) * flare.bandEnergyJPerKgSr;

/**
 * What the flame gives the eye for each W/sr it gives the band: its
 * luminance over its radiance there, the emissivity cancelling.
 * @param flare The flare
 * @returns cd per W/sr
 */
export const luminous_per_band = (flare: Flare): number =>
  blackbody_luminance(flare.temperatureK) /
  band_radiance(flare.bandM[0], flare.bandM[1], flare.temperatureK);

/**
 * The flame, as the eye sees it.
 */
export type FlareLight = {
  /** Its luminous intensity, candela */
  intensityCd: number;

  /**
   * Its radius, metres: a sphere's whose disc at its radiance gives the
   * band's intensity
   */
  radiusM: number;
};

/**
 * The flame now.
 * @param flare The flare
 * @param grain The grain now
 * @param per_band `luminous_per_band(flare)`, if worked out already
 * @param target Where to write it
 * @returns target
 */
export const flare_light = (
  flare: Flare,
  grain: Grain,
  per_band = luminous_per_band(flare),
  target: FlareLight = { intensityCd: 0, radiusM: 0 },
): FlareLight => {
  const band = band_intensity(flare, grain);
  const radiance =
    flare.emissivity *
    band_radiance(flare.bandM[0], flare.bandM[1], flare.temperatureK);

  target.intensityCd = band * per_band;
  target.radiusM = Math.sqrt(band / (radiance * Math.PI));

  return target;
};

/**
 * The tumbling grain's mean area to the flow: a quarter of its surface, as
 * Cauchy's formula has any convex body's.
 * @param grain The grain
 * @returns m²
 */
export const mean_area = (grain: Grain): number => grain.surfaceM2 / 4;

/**
 * How hard the air slows the grain, per unit of its speed squared: the drag
 * over the mass and the speed squared.
 * @param flare The flare
 * @param grain The grain now
 * @param density_kg_m3 The air's density
 * @returns Per metre
 */
export const drag_per_speed2 = (
  flare: Flare,
  grain: Grain,
  density_kg_m3: number,
): number =>
  grain.massKg > 0
    ? (0.5 * density_kg_m3 * flare.dragCoefficient * mean_area(grain)) /
      grain.massKg
    : 0;

/**
 * How fast the unburnt grain would fall in still air, where its drag is its
 * weight.
 * @param flare The flare
 * @param density_kg_m3 The air's density
 * @returns m/s
 */
export const terminal_speed = (flare: Flare, density_kg_m3: number): number =>
  Math.sqrt(G0 / drag_per_speed2(flare, grain_at(flare, 0), density_kg_m3));
