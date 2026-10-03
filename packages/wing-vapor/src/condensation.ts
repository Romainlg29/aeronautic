import {
  AIR_CP,
  AIR_GAS_CONSTANT,
  LATENT_HEAT,
  mixing_ratio,
  saturation_pressure,
  type MoistAir,
} from "./atmosphere";

// What happens to a parcel of air the aircraft drops the pressure on
//
// Air sweeping past a wing, round a vortex or over a supersonic pocket has its
// pressure dropped in well under a millisecond. Nothing has time to conduct
// heat in or out, so it expands adiabatically and cools: by about a degree
// for every one and a quarter per cent of pressure, near the ground. Cool it
// past its dew point and the vapour in it condenses on the aerosol that is
// always there, and that is the white
//
// The condensing vapour gives up its latent heat, which warms the parcel back
// towards its dew point and holds the cloud to far less water than a dry
// expansion would suggest. So the parcel is solved on the moist adiabat: the
// temperature at which the heat the vapour gives up is exactly what the
// expansion took. When the pressure recovers, behind a shock or out of a
// vortex, the droplets evaporate as fast as they formed, which is why vapour
// ends in a hard edge rather than drifting away

// The lowest pressure ratio the table covers. Under this the flow would have
// to be at several times the speed of sound locally, which nothing here makes
export const CONDENSATION_MIN_RATIO = 0.3;

// Entries in the table, from that ratio to one
export const CONDENSATION_TEXELS = 128;

// The humidities the table holds besides the day's own, as a share of it
// Air is not uniformly moist: a few per cent either way is enough to break a
// vapour sheet into the patches and wisps footage always shows
export const DEFAULT_HUMIDITY_SPREAD = 0.06;

/**
 * One parcel after its expansion.
 */
export type Condensate = {
  // Where it settled, in kelvin, the latent heat given back included
  temperature_k: number;

  // Liquid water per kilogram of dry air
  liquid: number;

  // Liquid water per cubic metre, in kilograms
  water_kg_m3: number;
};

/**
 * Expand a parcel of the free air to a lower pressure, and see what condenses.
 * @param pressure_ratio The local pressure over the free stream's, at most one
 * @param air The free stream
 * @param humidity_scale How much more vapour this parcel carries than the
 *   day's average, one being as much
 * @returns The parcel
 */
export const condensate = (
  pressure_ratio: number,
  air: MoistAir,
  humidity_scale = 1,
): Condensate => {
  const ratio = Math.min(Math.max(pressure_ratio, 1e-3), 1);
  const pressure_pa = air.pressure_pa * ratio;

  // Dry, straight down the adiabat: T p^(-R/cp) is held
  const dry_k = air.temperature_k * Math.pow(ratio, AIR_GAS_CONSTANT / AIR_CP);

  const water = air.mixing_ratio * Math.max(humidity_scale, 0);

  const saturated = (temperature_k: number) =>
    mixing_ratio(saturation_pressure(temperature_k), pressure_pa);

  const density = (temperature_k: number) =>
    pressure_pa / (AIR_GAS_CONSTANT * temperature_k);

  if (water <= saturated(dry_k)) {
    return { temperature_k: dry_k, liquid: 0, water_kg_m3: 0 };
  }

  // The heat balance cp (T - T_dry) = L (w - w_s(T)) rises monotonically with
  // T, negative at the dry adiabat and positive at the free stream's own
  // temperature, so a bisection always finds it
  let low = dry_k;
  let high = Math.max(air.temperature_k, dry_k + 1e-3);

  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) / 2;
    const balance =
      AIR_CP * (middle - dry_k) - LATENT_HEAT * (water - saturated(middle));

    if (balance > 0) {
      high = middle;
    } else {
      low = middle;
    }
  }

  const temperature_k = (low + high) / 2;
  const liquid = Math.max(water - saturated(temperature_k), 0);

  return {
    temperature_k,
    liquid,
    water_kg_m3: liquid * density(temperature_k),
  };
};

/**
 * The pressure ratio a table entry stands for.
 * @param texel Which entry, 0 to `CONDENSATION_TEXELS - 1`
 * @returns The pressure ratio
 */
export const condensation_ratio_at = (texel: number): number =>
  CONDENSATION_MIN_RATIO +
  ((1 - CONDENSATION_MIN_RATIO) * texel) / (CONDENSATION_TEXELS - 1);

/**
 * Liquid water against local pressure, for the shader to look up.
 *
 * Four floats an entry, in grams per cubic metre: the drier parcel, the day's
 * own, the moister one, and the temperature drop of the day's parcel, kelvin.
 * Worked out once per day and altitude, never per frame.
 * @param air The free stream
 * @param spread How much drier and moister the outer two channels are
 * @param target Where to write it, `CONDENSATION_TEXELS * 4` floats
 * @returns target
 */
export const condensation_table = (
  air: MoistAir,
  spread = DEFAULT_HUMIDITY_SPREAD,
  target = new Float32Array(CONDENSATION_TEXELS * 4),
): Float32Array => {
  for (let texel = 0; texel < CONDENSATION_TEXELS; texel++) {
    const ratio = condensation_ratio_at(texel);
    const day = condensate(ratio, air, 1);

    target[texel * 4] = condensate(ratio, air, 1 - spread).water_kg_m3 * 1000;
    target[texel * 4 + 1] = day.water_kg_m3 * 1000;
    target[texel * 4 + 2] =
      condensate(ratio, air, 1 + spread).water_kg_m3 * 1000;
    target[texel * 4 + 3] = air.temperature_k - day.temperature_k;
  }

  return target;
};

/**
 * How far one cubic metre of cloud dims light passing through it.
 *
 * Droplets of a micron or more are large against visible light, so each one
 * blocks twice its cross-section, whatever the colour: the extinction
 * paradox. Hence white, and hence no tint to what shows through.
 * @param water_kg_m3 Liquid water, kilograms per cubic metre
 * @param droplet_radius_m The droplets' effective radius
 * @returns The extinction coefficient, per metre
 */
export const cloud_extinction = (
  water_kg_m3: number,
  droplet_radius_m: number,
): number => (3 * water_kg_m3) / (2 * 1000 * Math.max(droplet_radius_m, 1e-8));

/**
 * How far below its dew point a parcel must be expanded to.
 * The pressure ratio at which the free air just saturates, dry adiabatically.
 * @param air The free stream
 * @returns The pressure ratio, or zero if no expansion short of the table's
 *   floor will do it
 */
export const saturation_ratio = (air: MoistAir): number => {
  let low = CONDENSATION_MIN_RATIO;
  let high = 1;

  if (condensate(low, air).liquid <= 0) {
    return 0;
  }

  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) / 2;

    if (condensate(middle, air).liquid > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
};
