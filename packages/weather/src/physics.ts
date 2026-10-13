import {
  AIR_CP,
  AIR_GAS_CONSTANT,
  dew_point,
  KOSCHMIEDER,
  LATENT_HEAT,
  mixing_ratio,
  saturation_pressure,
  standard_atmosphere,
  VAPOUR_RATIO,
} from "@aeronautic/core";

// The physics every cloud is made of, from the air it forms in to the light
// it stops
//
// - The air: the standard atmosphere, warmer or colder by the day's offset.
// - The base: a parcel lifted from the ground saturates about 125 m higher for
//   each kelvin its dew point is below its temperature (Lawrence 2005).
// - The tops: the parcel then rises on the moist adiabat while it is warmer
//   than the air round it, to its equilibrium level; the buoyancy it gains on
//   the way is its CAPE, and √(2 CAPE) the fastest updraft it could make.
// - The water: what the moist adiabat condenses, times the share a cloud
//   keeps as it mixes with the dry air round it (Warner 1955; Albrecht et al.
//   1990).
// - The droplets: as many as the air mass has aerosol for (Miles et al.
//   2000), their effective radius from their water (Martin et al. 1994),
//   their extinction 3 LWC / (2 ρ r_e), scattered by Mie's phase as Jendersie
//   and d'Eon (2023) fit it.
// - The ice: all of it below −38 °C, none above 0 °C, its extinction as Fu
//   (1996) has it.
// - The rain: Marshall and Palmer's drops, falling at Atlas et al.'s (1973)
//   speed.
// - The lightning: as many flashes as Price and Rind (1992) find a storm of
//   that height makes, a quarter of them to the ground (Prentice and
//   Mackerras 1977), each as bright as Guo and Krider (1982) measured.

/** Standard gravity, m/s² */
export const G0 = 9.80665;

/** Liquid water's density and ice's, kg/m³ */
export const WATER_DENSITY = 1000;
export const ICE_DENSITY = 917;

/** Where water freezes, and where every droplet has frozen, kelvin */
export const FREEZING_K = 273.15;
export const HOMOGENEOUS_FREEZING_K = 235.15;

/** The dry adiabat, kelvin a metre */
export const DRY_LAPSE = G0 / AIR_CP;

/** How much higher a parcel saturates per kelvin of dew-point spread, m */
export const ESPY_M_PER_K = 125;

/**
 * Droplets per cubic metre: Miles, Verlinde and Clothiaux's (2000) means,
 * 74 cm⁻³ in marine air and 288 over land, where there is more aerosol.
 */
export const DROPLETS_PER_M3 = {
  maritime: 74e6,
  continental: 288e6,
} as const;

/** An air mass, by what its droplets formed on */
export type AirMass = keyof typeof DROPLETS_PER_M3;

/**
 * The droplets' volume-mean radius cubed over their effective radius cubed
 * (Martin, Johnson and Spice 1994).
 */
export const DROPLET_SPREAD = { maritime: 0.8, continental: 0.67 } as const;

/** The ice crystals' effective size in cirrus and anvils, m: Fu's mid-range */
export const ICE_SIZE_M = 50e-6;

/** Hexagonal crystals' asymmetry, halos left out (Fu 1996) */
export const ICE_ASYMMETRY = 0.75;

/** Raindrops', far larger than the wavelength (Hansen and Travis 1974) */
export const RAIN_ASYMMETRY = 0.87;

/**
 * The air's temperature at an altitude, on a day warmer than the standard by
 * an offset.
 * @param altitude_m Metres above sea level
 * @param offset_k The day's offset, kelvin
 * @returns Kelvin
 */
export const air_temperature = (altitude_m: number, offset_k: number): number =>
  standard_atmosphere(altitude_m).temperatureK + offset_k;

/**
 * The most vapour air can carry, over liquid water.
 * @param temperature_k Its temperature
 * @param altitude_m Its altitude: the standard pressure there
 * @returns kg of vapour per kg of dry air
 */
export const saturation_mixing_ratio = (
  temperature_k: number,
  altitude_m: number,
): number =>
  mixing_ratio(
    saturation_pressure(temperature_k),
    standard_atmosphere(altitude_m).pressurePa,
  );

/**
 * The saturated adiabatic lapse rate, as the AMS Glossary has it.
 * @param temperature_k The air's temperature
 * @param saturation Its saturation mixing ratio
 * @returns Kelvin a metre
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
 * A parcel of air at the ground, lifted.
 */
export type Parcel = {
  /** Where it saturates: the cloud's base, m above sea level */
  baseM: number;

  /** Its temperature there, kelvin */
  baseK: number;

  /** The vapour it carries, kg/kg */
  mixingRatio: number;

  /**
   * Its equilibrium level: the highest it rises warmer than the air round
   * it, m above sea level. Its base, if it never is
   */
  topM: number;

  /** The buoyancy it gains on the way up, J/kg */
  capeJPerKg: number;
};

/** How finely a parcel is risen, m */
const PARCEL_STEP_M = 100;

/**
 * Lift a parcel from the ground: dry to its base, then on the moist adiabat
 * for as long as it is buoyant.
 * @param ground_m The ground's altitude
 * @param offset_k The day's offset from the standard atmosphere
 * @param humidity The relative humidity at the ground, 0 to 1
 * @param warmth_k How much warmer the parcel starts than the air round it:
 *   the ground's heating, kelvin
 * @param ceiling_m How high it may rise, at most
 * @returns The parcel
 */
export const lift_parcel = (
  ground_m: number,
  offset_k: number,
  humidity: number,
  warmth_k: number,
  ceiling_m = 16_000,
): Parcel => {
  const air_k = air_temperature(ground_m, offset_k);
  const vapour =
    Math.min(Math.max(humidity, 0.01), 1) * saturation_pressure(air_k);
  const start_k = air_k + warmth_k;
  const dew_k = Math.min(dew_point(vapour), start_k);
  const base_m = ground_m + ESPY_M_PER_K * (start_k - dew_k);
  const base_k = start_k - DRY_LAPSE * (base_m - ground_m);
  const water = mixing_ratio(vapour, standard_atmosphere(ground_m).pressurePa);

  // Below the base it is dry: its buoyancy there counts against it, as the
  // inhibition it must be pushed through, and is left out of the CAPE
  let temperature = base_k;
  let cape = 0;
  let top = base_m;

  for (let z = base_m; z < ceiling_m; z += PARCEL_STEP_M) {
    const around = air_temperature(z, offset_k);
    const buoyancy = (G0 * (temperature - around)) / around;

    if (buoyancy > 0) {
      cape += buoyancy * PARCEL_STEP_M;
      top = z;
    }

    temperature -=
      moist_lapse_rate(temperature, saturation_mixing_ratio(temperature, z)) *
      PARCEL_STEP_M;
  }

  return {
    baseM: base_m,
    baseK: base_k,
    mixingRatio: water,
    topM: top,
    capeJPerKg: cape,
  };
};

/**
 * The water a saturated parcel has condensed on the moist adiabat, at
 * heights above its base: the adiabatic liquid water content.
 * @param base_m The base
 * @param base_k The parcel's temperature there
 * @param height_m How far above the base
 * @returns kg/m³ of cloud
 */
export const adiabatic_water = (
  base_m: number,
  base_k: number,
  height_m: number,
): number => {
  const carried = saturation_mixing_ratio(base_k, base_m);
  const steps = Math.max(Math.ceil(height_m / 50), 1);
  const dz = height_m / steps;
  let temperature = base_k;

  for (let step = 0; step < steps; step++) {
    const z = base_m + step * dz;

    temperature -=
      moist_lapse_rate(temperature, saturation_mixing_ratio(temperature, z)) *
      dz;
  }

  const top = base_m + height_m;
  const left = saturation_mixing_ratio(temperature, top);
  const density =
    standard_atmosphere(top).pressurePa / (AIR_GAS_CONSTANT * temperature);

  return Math.max(carried - left, 0) * density;
};

/**
 * The share of a cloud's water that is ice: none at 0 °C, all at −38 °C,
 * linear between, where supercooled droplets and ice mix. An estimate.
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
 * The droplets' effective radius (Martin, Johnson and Spice 1994).
 * @param water_kg_m3 The liquid water content
 * @param air_mass What the droplets formed on
 * @returns Metres
 */
export const effective_radius = (
  water_kg_m3: number,
  air_mass: AirMass,
): number =>
  Math.cbrt(
    (3 * Math.max(water_kg_m3, 0)) /
      (4 * Math.PI * WATER_DENSITY * DROPLETS_PER_M3[air_mass]),
  ) / Math.cbrt(DROPLET_SPREAD[air_mass]);

/**
 * The droplets' extinction over their water to the ⅔: 3 LWC / (2 ρ r_e),
 * with r_e as the cube root of the water, is this times LWC^⅔.
 * @param air_mass What the droplets formed on
 * @returns Per metre, per (kg/m³)^⅔
 */
export const droplet_coefficient = (air_mass: AirMass): number =>
  (3 / (2 * WATER_DENSITY)) *
  Math.cbrt(
    (DROPLET_SPREAD[air_mass] *
      4 *
      Math.PI *
      WATER_DENSITY *
      DROPLETS_PER_M3[air_mass]) /
      3,
  );

/**
 * The droplets' extinction.
 * @param water_kg_m3 The liquid water content
 * @param air_mass What the droplets formed on
 * @returns Per metre
 */
export const droplet_extinction = (
  water_kg_m3: number,
  air_mass: AirMass,
): number =>
  droplet_coefficient(air_mass) * Math.cbrt(Math.max(water_kg_m3, 0)) ** 2;

// Fu's (1996) fit: β = IWC (a0 + a1 / D), IWC in g/m³, D in µm, β per metre
const FU_A0 = -6.656e-3;
const FU_A1 = 3.686;

/**
 * The ice's extinction over its water (Fu 1996).
 * @param size_m The crystals' generalised effective size
 * @returns Per metre, per kg/m³
 */
export const ice_coefficient = (size_m = ICE_SIZE_M): number =>
  1000 * Math.max(FU_A0 + FU_A1 / Math.max(size_m * 1e6, 10), 0);

/**
 * The ice in cirrus at a temperature: Schiller et al.'s (2008) median over
 * their flights, exp(6.97 + 0.103 T) ppmv, T in °C, as kg of ice per m³.
 * @param temperature_k The temperature
 * @param altitude_m The altitude: the air's density there
 * @returns kg/m³
 */
export const cirrus_ice = (
  temperature_k: number,
  altitude_m: number,
): number => {
  const ppmv = Math.exp(6.97 + 0.103 * (temperature_k - FREEZING_K));
  const density =
    standard_atmosphere(altitude_m).pressurePa /
    (AIR_GAS_CONSTANT * temperature_k);

  // Parts per million by volume to a mass: water's molar mass over air's
  return ppmv * 1e-6 * VAPOUR_RATIO * density;
};

// Marshall and Palmer: N(D) = N0 e^(−ΛD), Λ = 4.1 R^−0.21 per mm
const MP_INTERCEPT = 8000;
const MP_SLOPE = 4.1;
const MP_EXPONENT = -0.21;

/**
 * The rain's slope: how fast its drops thin out with size.
 * @param rate_mm_h How hard it rains
 * @returns Per millimetre
 */
export const rain_slope = (rate_mm_h: number): number =>
  MP_SLOPE * Math.max(rate_mm_h, 1e-3) ** MP_EXPONENT;

/**
 * The rain's extinction: every drop stops twice its cross section, so
 * ∫ 2 (π D² / 4) N0 e^(−ΛD) dD = π N0 / Λ³, which is 0.365 R^0.63 per km.
 * @param rate_mm_h How hard it rains
 * @returns Per metre
 */
export const rain_extinction = (rate_mm_h: number): number =>
  rate_mm_h <= 0
    ? 0
    : (Math.PI * MP_INTERCEPT) / rain_slope(rate_mm_h) ** 3 / 1e6;

/**
 * The drops larger than a size, per cubic metre: N0 / Λ e^(−ΛD).
 * @param rate_mm_h How hard it rains
 * @param smallest_mm The size
 * @returns Per cubic metre
 */
export const raindrops = (rate_mm_h: number, smallest_mm: number): number => {
  if (rate_mm_h <= 0) return 0;

  const slope = rain_slope(rate_mm_h);

  return (MP_INTERCEPT / slope) * Math.exp(-slope * smallest_mm);
};

/**
 * How fast a raindrop falls in still air (Atlas, Srivastava and Sekhon
 * 1973).
 * @param diameter_mm Its diameter
 * @returns m/s
 */
export const fall_speed = (diameter_mm: number): number =>
  Math.max(9.65 - 10.3 * Math.exp(-0.6 * diameter_mm), 0);

/**
 * The rain's median-volume drop: half its water is in drops larger, 3.67 / Λ.
 * @param rate_mm_h How hard it rains
 * @returns Millimetres
 */
export const median_drop = (rate_mm_h: number): number =>
  3.67 / rain_slope(rate_mm_h);

/**
 * How far one sees through air of an extinction: Koschmieder's range.
 * @param extinction_per_m The extinction
 * @returns Metres
 */
export const visibility = (extinction_per_m: number): number =>
  extinction_per_m > 0 ? KOSCHMIEDER / extinction_per_m : Infinity;

/**
 * Jendersie and d'Eon's (2023) fit of Mie scattering by droplets of a
 * diameter: a Henyey–Greenstein lobe and a Draine lobe, mixed.
 */
export type MiePhase = {
  hg: number;
  draine: number;
  alpha: number;
  weight: number;
};

/**
 * The fit for droplets of a diameter.
 * @param diameter_m Their diameter, 5 to 50 µm
 * @returns The fit
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
  (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * cosine) ** 1.5);

/**
 * Mie's phase, as the fit has it.
 * @param cosine The cosine of the scattering angle
 * @param phase The fit
 * @returns Per steradian
 */
export const mie = (cosine: number, phase: MiePhase): number => {
  const { draine: g, alpha } = phase;
  const draine =
    (henyey_greenstein(cosine, g) * (1 + alpha * cosine * cosine)) /
    (1 + (alpha * (1 + 2 * g * g)) / 3);

  return (
    henyey_greenstein(cosine, phase.hg) * (1 - phase.weight) +
    draine * phase.weight
  );
};

/**
 * How many flashes a storm makes, from how high its top is (Price and Rind
 * 1992): 3.44 × 10⁻⁵ H^4.9 a minute over land, 6.4 × 10⁻⁴ H^1.73 over the
 * sea, H in km.
 * @param top_km Its top, km above the ground
 * @param air_mass Over land or the sea
 * @returns Flashes a minute
 */
export const flash_rate = (top_km: number, air_mass: AirMass): number =>
  top_km <= 0
    ? 0
    : air_mass === "continental"
      ? 3.44e-5 * top_km ** 4.9
      : 6.4e-4 * top_km ** 1.73;

/**
 * The share of flashes that strike the ground: one in 1 + Z, Z = 4.16 + 2.16
 * cos(3λ) intracloud flashes to each (Prentice and Mackerras 1977).
 * @param latitude_deg The latitude
 * @returns 0 to 1
 */
export const ground_share = (latitude_deg: number): number =>
  1 / (1 + 4.16 + 2.16 * Math.cos((3 * latitude_deg * Math.PI) / 180));

/**
 * The share of its adiabatic water a cumulus keeps at a height above its
 * base, as it mixes with the dry air round it: Warner's (1955) ratio, falling
 * from about 0.7 at the base towards 0.2 kilometres up. An estimate, fit to
 * his soundings' trend.
 * @param height_m Metres above the base
 * @returns 0 to 1
 */
export const warner_fraction = (height_m: number): number =>
  0.2 + 0.5 * Math.exp(-Math.max(height_m, 0) / 1500);

/**
 * The effective radius past which a cloud's droplets collide and rain:
 * 14 µm (Freud and Rosenfeld 2012).
 */
export const RAIN_RADIUS_M = 14e-6;

/**
 * How deep a cumulus must grow before it rains: where its droplets first
 * reach `RAIN_RADIUS_M` in its core, which keeps near all its adiabatic water,
 * as their measurements were made. Shallow over the sea, where the droplets
 * are few and large; deep over land. Freud and Rosenfeld's (2012) depth is
 * about 5 m for each droplet a cubic centimetre: 370 m in marine air, 1.4 km
 * over land.
 * @param base_m Its base
 * @param base_k The air's temperature there
 * @param air_mass What its droplets formed on
 * @returns Metres above the base, Infinity if never within 12 km
 */
export const rain_onset = (
  base_m: number,
  base_k: number,
  air_mass: AirMass,
): number => {
  for (let height = 100; height <= 12_000; height += 100) {
    const water = adiabatic_water(base_m, base_k, height);

    if (effective_radius(water, air_mass) >= RAIN_RADIUS_M) return height;
  }

  return Infinity;
};
