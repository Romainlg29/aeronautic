import type { AfterburnerProfile } from "./types";

// The air the engines run in, from the International Standard Atmosphere
//
// Worked out once per profile on the main thread and handed to the shader as
// uniforms, so there is one copy of it and the GPU never walks the layers

// g₀M/R*, in kelvin per metre: what the hydrostatic equation integrates over
const HYDROSTATIC = 0.0341632;

const SEA_LEVEL_K = 288.15;

const AIR_GAMMA = 1.4;
const AIR_GAS_CONSTANT = 287.05;

// Where each layer starts, in metres, and its lapse rate in kelvin per metre
// Above the last the air is taken as isothermal, which it nearly is to 100 km
const LAYERS: [base_m: number, lapse_k_m: number][] = [
  [0, -0.0065],
  [11_000, 0],
  [20_000, 0.001],
  [32_000, 0.0028],
  [47_000, 0],
  [51_000, -0.0028],
  [71_000, -0.002],
  [86_000, 0],
];

const CEILING_M = 120_000;

/**
 * The air at one profile's altitude.
 */
export type AirState = {
  // In kelvin, the day's offset included
  temperature_k: number;

  // Pressure and density as shares of sea level's on a standard day
  pressure: number;
  density: number;

  // How fast sound runs in it
  sound_m_s: number;

  // The stagnation over static pressure an inlet moving through it recovers
  ram: number;
};

/**
 * The standard atmosphere's temperature and pressure at one altitude.
 * @param altitude_m Metres above sea level
 * @returns The standard temperature in kelvin, and the pressure as a share of sea level's
 */
export const standard_atmosphere = (
  altitude_m: number,
): { temperature_k: number; pressure: number } => {
  const height = Math.max(0, Math.min(altitude_m, CEILING_M));

  let temperature_k = SEA_LEVEL_K;
  let pressure = 1;

  for (let index = 0; index < LAYERS.length; index++) {
    const [base, lapse] = LAYERS[index];
    const top = LAYERS[index + 1]?.[0] ?? Infinity;

    const rise = Math.min(height, top) - base;

    if (rise <= 0) {
      break;
    }

    const next_k = temperature_k + lapse * rise;

    pressure *=
      lapse === 0
        ? Math.exp((-HYDROSTATIC * rise) / temperature_k)
        : Math.pow(next_k / temperature_k, -HYDROSTATIC / lapse);

    temperature_k = next_k;
  }

  return { temperature_k, pressure };
};

/**
 * The air one profile puts the engines in.
 *
 * The pressure is the standard one at the altitude, and the day's offset warms
 * the air at that pressure, so a hot day is a thinner one.
 * @param profile The altitude, the day and the airspeed
 * @returns The air
 */
export const atmosphere = (profile: AfterburnerProfile): AirState => {
  const standard = standard_atmosphere(profile.altitude_m);

  const temperature_k = Math.max(
    standard.temperature_k + profile.temperature_offset_k,
    1,
  );

  const sound_m_s = Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * temperature_k);

  const flight_mach = Math.max(profile.airspeed_m_s, 0) / sound_m_s;

  // Isentropic, less what a supersonic inlet's shocks lose (MIL-E-5007)
  const recovery =
    flight_mach > 1 ? 1 - 0.075 * Math.pow(flight_mach - 1, 1.35) : 1;

  const ram =
    Math.pow(
      1 + ((AIR_GAMMA - 1) / 2) * flight_mach * flight_mach,
      AIR_GAMMA / (AIR_GAMMA - 1),
    ) * Math.max(recovery, 0.2);

  return {
    temperature_k,
    pressure: standard.pressure,
    density: (standard.pressure * SEA_LEVEL_K) / temperature_k,
    sound_m_s,
    ram,
  };
};
