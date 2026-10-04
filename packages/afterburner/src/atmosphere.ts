import {
  ram_pressure,
  SEA_LEVEL_K,
  speed_of_sound,
  standard_atmosphere,
} from "@aeronautic/core";
import type { AfterburnerProfile } from "./types";

// The air the engines run in, from the International Standard Atmosphere
//
// Worked out once per profile on the main thread and handed to the shader as
// uniforms, so there is one copy of it and the GPU never walks the layers. The
// atmosphere itself is the core's, so the engines and the wing vapour fly
// through the same day

/**
 * The air at one profile's altitude.
 */
export type AirState = {
  /** In kelvin, the day's offset included */
  temperatureK: number;

  /** Pressure and density as shares of sea level's on a standard day */
  pressure: number;
  density: number;

  /** How fast sound runs in it */
  soundMPerS: number;

  /** The stagnation over static pressure an inlet moving through it recovers */
  ram: number;
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
  const standard = standard_atmosphere(profile.altitudeM);

  const temperature_k = Math.max(
    standard.temperatureK + profile.temperatureOffsetK,
    1,
  );

  const sound_m_s = speed_of_sound(temperature_k);

  return {
    temperatureK: temperature_k,
    pressure: standard.pressure,
    density: (standard.pressure * SEA_LEVEL_K) / temperature_k,
    soundMPerS: sound_m_s,
    ram: ram_pressure(Math.max(profile.airspeedMPerS, 0) / sound_m_s),
  };
};
