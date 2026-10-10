import {
  AIR_CP,
  AIR_GAS_CONSTANT,
  KOSCHMIEDER,
  LATENT_HEAT,
  mixing_ratio,
  saturation_pressure,
  standard_atmosphere,
  VAPOUR_RATIO,
} from "@aeronautic/core";

// What a cloud is made of, and what that does to light
//
// A cloud is air lifted until it cools to its dew point, and lifted on: the
// water it carries past that height condenses on the aerosol in it. How much
// follows from the moist adiabat, how many droplets it makes from the air's
// aerosol, and those two set the droplets' size; the droplets' size and number
// set how much light the cloud stops, and which way it sends it. So a cloud's
// look is worked out from the day it forms in, as a meteorologist would
// work out the cloud itself
//
// - Its base: the lifted condensation level, where a parcel lifted dry from
//   the ground first saturates.
// - Its water: what the parcel has condensed by each height above that, as it
//   rises on the moist adiabat, times the share the cloud keeps of it as it
//   mixes with the dry air round it (the adiabatic fraction).
// - Its droplets: a number per cubic centimetre set by the air mass (Miles,
//   Verlinde and Clothiaux 2000: 74 in marine stratocumulus, 288 over land),
//   all sharing the water, so their effective radius is the water's over the
//   number's, to the third (Martin, Johnson and Spice 1994).
// - Its light: droplets of tens of microns stop twice their cross section of
//   light (geometric optics), σ = 3 LWC / (2 ρ_w r_e), and scatter it as Mie
//   says, here through Jendersie and d'Eon's fit for the droplets' diameter.
// - Ice: above the homogeneous freezing point, −38 °C, every droplet is ice,
//   and between it and 0 °C a share of them is: crystals of tens of microns,
//   stopping light as Fu (1996) parameterises it.
// - Rain: drops of millimetres, as Marshall and Palmer measured them for a
//   rain rate, stop light in geometric optics too.

const G0 = 9.80665;

// Liquid water's density, and ice's, kg/m³
export const WATER_DENSITY = 1000;
export const ICE_DENSITY = 917;

/** The temperature water freezes at, and where every droplet has, kelvin */
export const FREEZING_K = 273.15;
export const HOMOGENEOUS_FREEZING_K = 235.15;

/**
 * Droplets per cubic metre in an air mass's clouds: Miles, Verlinde and
 * Clothiaux's (2000) means for stratocumulus, 74 cm⁻³ in marine air and 288
 * over land, where there is far more aerosol to condense on.
 */
export const DROPLETS_PER_M3 = {
  maritime: 74e6,
  continental: 288e6,
} as const;

/** An air mass, by what its clouds' droplets formed on */
export type AirMass = keyof typeof DROPLETS_PER_M3;

/**
 * The ratio of the droplets' volume-mean radius cubed to their effective
 * radius cubed: 0.80 in maritime air and 0.67 in continental, whose droplet
 * sizes spread wider (Martin, Johnson and Spice 1994).
 */
export const DROPLET_SPREAD = {
  maritime: 0.8,
  continental: 0.67,
} as const;

/**
 * Where a parcel of air lifted from the ground saturates.
 */
export type CondensationLevel = {
  /** Metres above sea level */
  altitudeM: number;

  /** The parcel's temperature there, kelvin */
  temperatureK: number;

  /** The water it carries, kilograms per kilogram of dry air */
  mixingRatio: number;
};

/**
 * The parcel's saturation mixing ratio at a temperature and an altitude, over
 * liquid water.
 * @param temperature_k Its temperature
 * @param altitude_m Its altitude: the pressure is the standard one there
 * @returns Kilograms of vapour per kilogram of dry air
 */
export const saturation_mixing_ratio = (
  temperature_k: number,
  altitude_m: number,
): number =>
  mixing_ratio(
    saturation_pressure(temperature_k),
    standard_atmosphere(altitude_m).pressurePa,
  );

// The dry adiabat: g / c_p, kelvin per metre
const DRY_LAPSE = G0 / AIR_CP;

/**
 * The lifted condensation level: lift a parcel from the ground dry
 * adiabatically, keeping its water, until the air it has cooled to can hold no
 * more. Close to Espy's 125 m for each kelvin the dew point is below the
 * temperature, worked out here rather than approximated.
 * @param surface_k The air's temperature at the ground
 * @param dew_point_k Its dew point there
 * @param surface_m The ground's altitude
 * @returns The level, and the parcel there
 */
export const condensation_level = (
  surface_k: number,
  dew_point_k: number,
  surface_m = 0,
): CondensationLevel => {
  const surface_pa = standard_atmosphere(surface_m).pressurePa;
  const water = mixing_ratio(
    saturation_pressure(Math.min(dew_point_k, surface_k)),
    surface_pa,
  );

  // Saturated where the parcel's own water is all the air there can hold:
  // below it holds more, above less. Bisected, to a few centimetres
  let low = 0;
  let high = 20_000;

  for (let step = 0; step < 40; step++) {
    const rise = (low + high) / 2;
    const temperature = surface_k - DRY_LAPSE * rise;

    if (saturation_mixing_ratio(temperature, surface_m + rise) > water) {
      low = rise;
    } else {
      high = rise;
    }
  }

  const rise = (low + high) / 2;

  return {
    altitudeM: surface_m + rise,
    temperatureK: surface_k - DRY_LAPSE * rise,
    mixingRatio: water,
  };
};

/**
 * The saturated adiabatic lapse rate: how fast saturated air cools as it
 * rises, the heat its condensing water gives up slowing it (the AMS
 * Glossary's).
 * @param temperature_k The air's temperature
 * @param saturation The saturation mixing ratio there
 * @returns Kelvin per metre, positive
 */
export const moist_lapse_rate = (
  temperature_k: number,
  saturation: number,
): number =>
  (G0 * (1 + (LATENT_HEAT * saturation) / (AIR_GAS_CONSTANT * temperature_k))) /
  (AIR_CP +
    (LATENT_HEAT * LATENT_HEAT * saturation * VAPOUR_RATIO) /
      (AIR_GAS_CONSTANT * temperature_k * temperature_k));

/**
 * A saturated parcel risen from a cloud's base: its temperature and the water
 * it has condensed, at even heights.
 */
export type AdiabaticProfile = {
  /** The base, metres above sea level */
  baseM: number;

  /** Between one height and the next, metres */
  stepM: number;

  /** The parcel's temperature at each height, kelvin */
  temperatureK: Float64Array;

  /**
   * The water it has condensed there, kilograms per cubic metre of cloud: the
   * adiabatic liquid water content
   */
  waterKgPerM3: Float64Array;
};

/**
 * Raise a saturated parcel from a cloud's base on the moist adiabat, and keep
 * what it condenses: the most water the cloud can hold at each height, before
 * any of it is mixed away or rains out.
 * @param base The level the parcel saturated at
 * @param top_m How high to go, metres above sea level
 * @param steps How many heights to keep, base and top included
 * @returns The profile
 */
export const adiabatic_profile = (
  base: CondensationLevel,
  top_m: number,
  steps = 64,
): AdiabaticProfile => {
  const count = Math.max(steps, 2);
  const step_m = Math.max(top_m - base.altitudeM, 1) / (count - 1);
  const temperature_k = new Float64Array(count);
  const water = new Float64Array(count);

  // Integrated in steps of ten metres or less, kept at every step_m
  const substeps = Math.max(Math.ceil(step_m / 10), 1);
  const dz = step_m / substeps;

  let temperature = base.temperatureK;

  for (let index = 0; index < count; index++) {
    const altitude = base.altitudeM + index * step_m;
    const saturation = saturation_mixing_ratio(temperature, altitude);
    const pressure = standard_atmosphere(altitude).pressurePa;
    const density = pressure / (AIR_GAS_CONSTANT * temperature);

    temperature_k[index] = temperature;
    water[index] = Math.max(base.mixingRatio - saturation, 0) * density;

    for (let sub = 0; sub < substeps; sub++) {
      const at = altitude + sub * dz;

      temperature -=
        moist_lapse_rate(
          temperature,
          saturation_mixing_ratio(temperature, at),
        ) * dz;
    }
  }

  return {
    baseM: base.altitudeM,
    stepM: step_m,
    temperatureK: temperature_k,
    waterKgPerM3: water,
  };
};

/**
 * The share of a cloud's water that is ice at a temperature: none at 0 °C
 * and above, all of it at −38 °C and below, where droplets freeze by
 * themselves. Between, clouds are mixed, and supercooled droplets common;
 * linear here, an estimate.
 * @param temperature_k The temperature
 * @returns 0 to 1
 */
export const ice_share = (temperature_k: number): number =>
  Math.min(
    Math.max(
      (FREEZING_K - temperature_k) / (FREEZING_K - HOMOGENEOUS_FREEZING_K),
      0,
    ),
    1,
  );

/**
 * The droplets' effective radius: their volume over their area, for a number
 * sharing the water (Martin, Johnson and Spice 1994).
 * @param water_kg_m3 The liquid water content
 * @param droplets_m3 Droplets per cubic metre
 * @param spread The volume-mean over effective radius, cubed
 * @returns Metres
 */
export const effective_radius = (
  water_kg_m3: number,
  droplets_m3: number,
  spread: number,
): number => {
  const volume_mean = Math.cbrt(
    (3 * Math.max(water_kg_m3, 0)) /
      (4 * Math.PI * WATER_DENSITY * Math.max(droplets_m3, 1)),
  );

  return volume_mean / Math.cbrt(spread);
};

/**
 * How much light droplets stop a metre: twice their cross section, as any
 * particle far larger than the wavelength does, 3 LWC / (2 ρ_w r_e).
 * @param water_kg_m3 The liquid water content
 * @param droplets_m3 Droplets per cubic metre
 * @param spread The volume-mean over effective radius, cubed
 * @returns The extinction coefficient, per metre
 */
export const droplet_extinction = (
  water_kg_m3: number,
  droplets_m3: number,
  spread: number,
): number => {
  if (water_kg_m3 <= 0) return 0;

  return (
    (3 * water_kg_m3) /
    (2 * WATER_DENSITY * effective_radius(water_kg_m3, droplets_m3, spread))
  );
};

// Fu's (1996) fit of ice crystals' extinction to their content and their
// generalised effective size, at visible wavelengths: β = IWC (a₀ + a₁ / D),
// IWC in g/m³ and D in µm giving per metre
const FU_A0 = -6.656e-3;
const FU_A1 = 3.686;

/**
 * How much light ice crystals stop a metre (Fu 1996).
 * @param ice_kg_m3 The ice water content
 * @param size_m The crystals' generalised effective size, metres: tens of
 *   microns in cirrus and an anvil's outflow
 * @returns The extinction coefficient, per metre
 */
export const ice_extinction = (ice_kg_m3: number, size_m: number): number => {
  if (ice_kg_m3 <= 0) return 0;

  const grams = ice_kg_m3 * 1000;
  const microns = Math.max(size_m * 1e6, 10);

  return Math.max(grams * (FU_A0 + FU_A1 / microns), 0);
};

/**
 * The asymmetry of ice crystals' scattering in the visible, about 0.75 for
 * hexagonal columns and plates (Fu 1996), their halos left out.
 */
export const ICE_ASYMMETRY = 0.75;

/**
 * Jendersie and d'Eon's (2023) fit of Mie scattering by water droplets: a
 * Henyey–Greenstein peak blended with Draine's phase function for the bulk.
 */
export type MiePhase = {
  /** The Henyey–Greenstein lobe's asymmetry */
  hg: number;

  /** The Draine lobe's asymmetry and its α */
  draine: number;
  alpha: number;

  /** The Draine lobe's weight */
  weight: number;
};

/**
 * Mie scattering by droplets of one diameter, as Jendersie and d'Eon's fit
 * gives it: good from 5 to 50 µm, and held to that range.
 * @param diameter_m The droplets' diameter, metres: twice the effective radius
 * @returns The phase function's parameters
 */
export const mie_phase = (diameter_m: number): MiePhase => {
  const d = Math.min(Math.max(diameter_m * 1e6, 5), 50);

  return {
    hg: Math.exp(-0.0990567 / (d - 1.67154)),
    draine: Math.exp(-2.20679 / (d + 3.91029) - 0.428934),
    alpha: Math.exp(3.62489 - 8.29288 / (d + 5.52825)),
    weight: Math.exp(-0.599085 / (d - 0.641583) - 0.665888),
  };
};

/**
 * Henyey and Greenstein's phase function.
 * @param cosine The cosine of the scattering angle
 * @param g Its asymmetry
 * @returns Per steradian
 */
export const henyey_greenstein = (cosine: number, g: number): number =>
  (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cosine, 1.5));

/**
 * Draine's phase function.
 * @param cosine The cosine of the scattering angle
 * @param g Its asymmetry
 * @param alpha Its α: 0 is Henyey and Greenstein's
 * @returns Per steradian
 */
export const draine = (cosine: number, g: number, alpha: number): number =>
  (henyey_greenstein(cosine, g) * (1 + alpha * cosine * cosine)) /
  (1 + (alpha * (1 + 2 * g * g)) / 3);

/**
 * Mie scattering by water droplets, as Jendersie and d'Eon fit it.
 * @param cosine The cosine of the scattering angle
 * @param phase The fit for the droplets' size
 * @returns Per steradian
 */
export const mie = (cosine: number, phase: MiePhase): number =>
  (1 - phase.weight) * henyey_greenstein(cosine, phase.hg) +
  phase.weight * draine(cosine, phase.draine, phase.alpha);

// Marshall and Palmer's (1948) drop sizes: N(D) = N₀ e^(−ΛD), N₀ = 8000 per
// cubic metre per millimetre, Λ = 4.1 R^−0.21 per millimetre for R in mm/h
const MP_INTERCEPT = 8000;
const MP_SLOPE = 4.1;
const MP_EXPONENT = -0.21;

/**
 * How much light rain stops a metre: Marshall and Palmer's drops, each
 * stopping twice its cross section. ∫ 2 (π D² / 4) N₀ e^(−ΛD) dD = π N₀ / Λ³,
 * which is 0.365 R^0.63 per kilometre.
 * @param rate_mm_h The rain rate, millimetres an hour
 * @returns The extinction coefficient, per metre
 */
export const rain_extinction = (rate_mm_h: number): number => {
  if (rate_mm_h <= 0) return 0;

  const slope = MP_SLOPE * Math.pow(rate_mm_h, MP_EXPONENT);

  // Square millimetres per cubic metre, to per metre
  return (Math.PI * MP_INTERCEPT) / (slope * slope * slope) / 1e6;
};

/**
 * The asymmetry of raindrops' scattering: spheres far larger than the
 * wavelength, about 0.87 for water's refractive index (Hansen and Travis
 * 1974).
 */
export const RAIN_ASYMMETRY = 0.87;

/**
 * How far one can see through a medium: Koschmieder's meteorological range.
 * @param extinction_per_m Its extinction coefficient
 * @returns Metres
 */
export const visibility = (extinction_per_m: number): number =>
  KOSCHMIEDER / Math.max(extinction_per_m, 1e-9);
