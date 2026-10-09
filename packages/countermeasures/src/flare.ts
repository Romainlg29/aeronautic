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

  /**
   * The speed through the air that halves the flame's light at the grain,
   * m/s: the airstream sweeps its hot products away before they radiate.
   * An estimate, as is the next two: no measured curve is published openly
   */
  halfLightMPerS: number;

  /**
   * How long the swept products glow, seconds: the e-folding time of the
   * light along the trail they leave
   */
  glowTimeS: number;

  /** The share of the light swept off the grain that the trail still gives */
  trailShare: number;

  /**
   * How the burn rate follows the pressure, r ∝ pⁿ: the rate given is at
   * sea level's
   */
  pressureExponent: number;

  /** How long after it leaves the grain lights, seconds. An estimate */
  ignitionDelayS: number;

  /** The smoke it leaves, per kilogram burnt: its oxides and carbon, kg/kg */
  smokeYield: number;

  /** The smoke's extinction per kilogram, m²/kg. An estimate */
  smokeExtinctionM2PerKg: number;

  /** The share of what the smoke stops that it scatters. An estimate */
  smokeAlbedo: number;

  /**
   * The smoke's scattering asymmetry, Henyey and Greenstein's g: how much
   * it sends on forward. An estimate
   */
  smokeAsymmetry: number;
};

/** Sea level's pressure, Pa */
export const SEA_LEVEL_PA = 101_325;

/** Sea level's density, kg/m³ */
export const SEA_LEVEL_DENSITY = 1.225;

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
   *
   * In thinner air it burns slower, as MTV's rate goes with the pressure to
   * the 0.094 (strand burner, 0.15 to 1.15 MPa, Nihon University's
   * Mg/Teflon/Viton). The igniter takes a moment: 0.1 s, an estimate
   *
   * Its smoke is what it burns to: the Teflon's fluorine takes the
   * magnesium it can to MgF₂, its carbon is left as soot, and the rest of
   * the magnesium burns in the air to MgO. A kilogram's 500 g of Mg and
   * 450 g of C₂F₄ give 561 g of MgF₂, 108 g of C and 466 g of MgO: 1.13 kg,
   * its 50 g of Viton left aside. A white oxide smoke stops about 2 m² a gram, scatters about
   * 0.8 of it, the soot taking the rest, and sends it on forward with a g of
   * 0.6, its particles a fraction of a micron: all three estimates, there
   * being no measurement of an MTV flare's smoke
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
    halfLightMPerS: 150,
    glowTimeS: 0.05,
    trailShare: 0.5,
    pressureExponent: 0.094,
    ignitionDelayS: 0.1,
    smokeYield: 1.13,
    smokeExtinctionM2PerKg: 2_000,
    smokeAlbedo: 0.8,
    smokeAsymmetry: 0.6,
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
 * The share of the flame's light that stays at the grain at a speed
 * through the air. Radiation from the flame competes with the airstream
 * carrying its products off, at a rate that grows with the speed, so the
 * share is 1 / (1 + v / v½): what static tests measure when still, half at
 * v½. The form is the competition's; v½ is an estimate (see the make).
 * What carries them off is the air's mass flux, ρ v, so v½ is sea level's
 * and grows as the air thins
 * @param flare The flare
 * @param speed_m_s Its speed through the air
 * @param density_kg_m3 The air's density: sea level's by default
 * @returns From 1 down
 */
export const airstream_share = (
  flare: Flare,
  speed_m_s: number,
  density_kg_m3 = SEA_LEVEL_DENSITY,
): number =>
  1 /
  (1 +
    (Math.max(speed_m_s, 0) * density_kg_m3) /
      (flare.halfLightMPerS * SEA_LEVEL_DENSITY));

/**
 * The flame, as the eye sees it.
 */
export type FlareLight = {
  /** Its luminous intensity at the grain, candela */
  intensityCd: number;

  /** The luminous intensity of the trail it leaves, all of it, candela */
  trailCd: number;

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
 * @param speed_m_s Its speed through the air: still, as tested, by default
 * @param density_kg_m3 The air's density: sea level's by default
 * @returns target
 */
export const flare_light = (
  flare: Flare,
  grain: Grain,
  per_band = luminous_per_band(flare),
  target: FlareLight = { intensityCd: 0, trailCd: 0, radiusM: 0 },
  speed_m_s = 0,
  density_kg_m3 = SEA_LEVEL_DENSITY,
): FlareLight => {
  const still = band_intensity(flare, grain);
  const share = airstream_share(flare, speed_m_s, density_kg_m3);
  const band = still * share;
  const radiance =
    flare.emissivity *
    band_radiance(flare.bandM[0], flare.bandM[1], flare.temperatureK);

  target.intensityCd = band * per_band;
  target.trailCd = still * (1 - share) * flare.trailShare * per_band;
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

/**
 * The flare at a pressure: the burn rate the pressure gives it, as MTV's
 * goes with the pressure to its exponent. The rest is the same.
 * @param flare The flare, its rate sea level's
 * @param pressure_pa The air's pressure
 * @returns The flare as it burns there
 */
export const flare_at_pressure = (
  flare: Flare,
  pressure_pa: number,
): Flare => ({
  ...flare,
  burnRateMPerS:
    flare.burnRateMPerS *
    (Math.max(pressure_pa, 1) / SEA_LEVEL_PA) ** flare.pressureExponent,
});

/**
 * The trail's colours as it cools, a table over the e-folds of its light:
 * where the light has fallen by e^-f, the products are as hot as a
 * graybody whose luminance has, and their colour is that one's. The
 * colours are at a luminance of one.
 * @param flare The flare
 * @param chromaticity_rgb_of A colour for a temperature, at a luminance of one
 * @param e_folds How far the table goes
 * @param steps Its entries, past the first
 * @returns The colours, red, green and blue in turn
 */
export const trail_colors = (
  flare: Flare,
  chromaticity_rgb_of: (
    temperature_k: number,
  ) => readonly [number, number, number],
  e_folds: number,
  steps: number,
): Float32Array => {
  const table = new Float32Array((steps + 1) * 3);
  const hot = blackbody_luminance(flare.temperatureK);

  for (let step = 0; step <= steps; step++) {
    const wanted = hot * Math.exp((-e_folds * step) / steps);

    // The luminance only falls as it cools: halve the interval on it
    let low = 300;
    let high = flare.temperatureK;

    for (let iteration = 0; iteration < 40; iteration++) {
      const middle = (low + high) / 2;

      if (blackbody_luminance(middle) > wanted) high = middle;
      else low = middle;
    }

    table.set(chromaticity_rgb_of((low + high) / 2), step * 3);
  }

  return table;
};
