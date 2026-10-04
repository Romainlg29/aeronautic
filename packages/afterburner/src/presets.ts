import { Color, type ColorRepresentation } from "three";
import { propellant_params, type Propellant } from "./propellant";
import {
  default_afterburner_params,
  default_afterburner_profile,
  default_afterburner_quality,
  type AfterburnerParams,
  type AfterburnerProfile,
  type AfterburnerQuality,
} from "./types";

// Presets, and turning partial input into the complete dials the batch draws
//
// A preset is an engine *and* a camera: the params ride on each nozzle, and the
// profile on the batch the nozzle is drawn by. Each is written for one nozzle
// size and scales to any other — the length, the shock spacing and the eddies
// are not params at all, they come out of the jet's diameter

const COLOR_KEYS = ["bandColor"] as const;

type ColorKey = (typeof COLOR_KEYS)[number];

/**
 * An engine, every field optional and the colour in any form three takes.
 */
export type AfterburnerParamsInput = Partial<
  Omit<AfterburnerParams, ColorKey> & Record<ColorKey, ColorRepresentation>
> & {
  /**
   * What a rocket burns, and how rich: sets its soot, what burns in the air
   * and, against the preset's own mix, its temperatures. Any of those given
   * here as well wins over what the mix would make of it
   */
  propellant?: Propellant;
};

/**
 * A named engine: what it burns, and the camera it is best seen through.
 */
export type AfterburnerPreset = {
  /** What the engine burns at the params given, for a new mix to scale from */
  propellant?: Propellant;

  params: AfterburnerParamsInput;
  profile: Partial<AfterburnerProfile>;
};

// What a fighter's burner shares: the flame is drawn to where it stops glowing
// yellow-orange, not to where the gas stops glowing at all, which is the cone
// a pilot or a camera sees and not the long dull tail behind it
const JET_PROFILE: Partial<AfterburnerProfile> = {
  visibleTemperatureK: 900,
};

// What a rocket shares, against a jet
//
// No burner to light, so the gas is as hot at any throttle and a throttled
// engine is a lower chamber pressure: a more overexpanded bell and a tighter
// shock train. And a plume seen by day, through a camera stopped well down
const ROCKET_PROFILE: Partial<AfterburnerProfile> = {
  burnerThreshold: 0,
  idlePressure: 0.45,
  maxLengthD: 45,
};

// Every value below is a real engine's, or as near as the open literature has
// it: exit Mach from the bell's expansion ratio, exit pressure at sea level,
// exit static temperature from the chamber temperature and the expansion, and
// the exhaust's gamma and molar mass from its equilibrium composition. What is
// tuned is the exposure, as it would be for a photograph of each

/**
 * The engines the library ships with.
 */
export const AFTERBURNER_PRESETS = {
  // A fighter at full reheat on a still night: a large military turbofan,
  // a little underexpanded, with a countable train of diamonds in a clean,
  // translucent barrel, and almost no turbulence to break it up
  afterburner: {
    params: {
      turbulence: 0.12,
      meander: 0.02,
    },
    profile: { ...JET_PROFILE, shockRelaxation: 3.2 },
  },

  // The same burner as it really is: the mixing layer fully turbulent, the
  // tail breaking up into the air behind it
  afterburner_turbulent: {
    params: {},
    profile: JET_PROFILE,
  },

  // RP-1 and liquid oxygen, a gas-generator first stage at sea level
  //
  // Kerosene burns rich, and the gas generator's exhaust richer: the plume is
  // full of soot, which glows a luminous yellow where the leftover fuel burns
  // in the air and goes to dark smoke where it has cooled. Expansion ratio 16,
  // so Mach 3.3 at the exit, a little overexpanded at sea level
  rocket_kerolox: {
    propellant: { fuel: "kerosene", mixtureRatio: 2.36 },
    params: {
      nozzleRadiusM: 0.46,
      exitMach: 3.3,
      pressureRatio: 0.75,
      exitTemperatureK: 1750,
      dryTemperatureK: 1750,
      gamma: 1.22,
      molarMassGPerMol: 22.5,
      sootPerM: 2.2,
      sootSurvival: 0.6,
      particlesPerM: 0,
      particleAlbedo: 0,
      afterburningK: 950,
      bandColor: "#6d78ff",
      bandStrength: 0.04,
      turbulence: 1,
      meander: 0.18,
      refractionM: 0.08,
    },
    profile: { ...ROCKET_PROFILE, exposure: 1.2 },
  },

  // Hydrogen and liquid oxygen, a staged-combustion main engine at sea level
  //
  // Water is all it makes, and water barely glows: the plume is nearly clear,
  // and the air shimmers through it before you see any flame. A 69 to 1 bell
  // is badly overexpanded at sea level, so the first Mach disk is a hard,
  // white-hot standing shock just aft of the bell, the gas behind it heated
  // almost back to chamber temperature
  rocket_hydrolox: {
    propellant: { fuel: "hydrogen", mixtureRatio: 6 },
    params: {
      nozzleRadiusM: 1.15,
      exitMach: 4.4,
      pressureRatio: 0.35,
      exitTemperatureK: 1350,
      dryTemperatureK: 1350,
      gamma: 1.2,
      molarMassGPerMol: 13.5,
      sootPerM: 0,
      sootSurvival: 0,
      particlesPerM: 0,
      particleAlbedo: 0,
      afterburningK: 700,
      bandColor: "#b89cff",
      bandStrength: 0.9,
      turbulence: 0.5,
      meander: 0.04,
      refractionM: 0.3,
    },
    profile: { ...ROCKET_PROFILE, exposure: 8 },
  },

  // Methane and liquid oxygen, a full-flow staged-combustion engine at sea level
  //
  // Burns nearly clean, so the plume is translucent: the blue-violet of the
  // radicals in the core, a bright and sharply cut train of diamonds, and a
  // thin orange where a trace of soot burns out in the air
  rocket_methalox: {
    propellant: { fuel: "methane", mixtureRatio: 3.6 },
    params: {
      nozzleRadiusM: 0.65,
      exitMach: 3.6,
      pressureRatio: 0.85,
      exitTemperatureK: 1700,
      dryTemperatureK: 1700,
      gamma: 1.2,
      molarMassGPerMol: 21,
      sootPerM: 0.12,
      sootSurvival: 0.15,
      particlesPerM: 0,
      particleAlbedo: 0,
      afterburningK: 500,
      bandColor: "#7a5cff",
      bandStrength: 1.6,
      turbulence: 0.6,
      meander: 0.06,
      refractionM: 0.12,
    },
    profile: { ...ROCKET_PROFILE, exposure: 1.5 },
  },

  // A solid rocket booster, ammonium perchlorate with aluminium
  //
  // A fifth of the exhaust by mass is molten alumina, which is white and glows
  // at the gas's own temperature: the plume is an opaque white-yellow column
  // too dense to see into, and the smoke it leaves scatters the sky
  solid_booster: {
    params: {
      nozzleRadiusM: 1.9,
      exitMach: 3,
      pressureRatio: 0.9,
      exitTemperatureK: 2300,
      dryTemperatureK: 2300,
      gamma: 1.18,
      molarMassGPerMol: 28,
      sootPerM: 0,
      sootSurvival: 0,
      particlesPerM: 2.5,
      particleAlbedo: 0.92,
      afterburningK: 350,
      bandColor: "#ffcf8a",
      bandStrength: 0.1,
      turbulence: 1.15,
      meander: 0.22,
      refractionM: 0.12,
    },
    profile: {
      ...ROCKET_PROFILE,
      exposure: 0.35,
      skyLight: 0.02,
      sunLight: 1.5,
    },
  },

  // Nothing flying: an argon arcjet out of a lab, hot enough to ionise, glowing
  // in its own line spectrum. Strongly underexpanded, so the shock train is
  // crisp and long, and laminar all the way
  plasma: {
    params: {
      exitMach: 2,
      pressureRatio: 1.8,
      exitTemperatureK: 3200,
      dryTemperatureK: 1400,
      gamma: 1.67,
      molarMassGPerMol: 39.9,
      sootPerM: 0,
      sootSurvival: 0,
      particlesPerM: 0,
      particleAlbedo: 0,
      afterburningK: 0,
      bandColor: "#4ee2ff",
      bandStrength: 2.5,
      turbulence: 0.05,
      meander: 0.01,
      refractionM: 0.03,
    },
    profile: { burnerThreshold: 0.2, exposure: 2, activationK: 9000 },
  },
} satisfies Record<string, AfterburnerPreset>;

/**
 * The name of one of the shipped presets.
 */
export type AfterburnerPresetName = keyof typeof AFTERBURNER_PRESETS;

// The params set by the size of the engine, which scale with its nozzle
// Everything else is the gas, which is no different in a bigger engine
const METRIC_KEYS = ["refractionM"] as const;

/**
 * Look a preset up, by name or as given.
 * @param preset A preset's name, a preset, or nothing for the default look
 * @returns The preset
 */
export const get_afterburner_preset = (
  preset: AfterburnerPresetName | AfterburnerPreset | undefined,
): AfterburnerPreset =>
  preset === undefined
    ? AFTERBURNER_PRESETS.afterburner_turbulent
    : typeof preset === "string"
      ? AFTERBURNER_PRESETS[preset]
      : preset;

/**
 * Fill a partial set of params in, over a preset and the defaults.
 *
 * A `nozzleRadiusM` different from the preset's scales every length the
 * preset set with it, unless that length is given explicitly too.
 * @param input What to override
 * @param preset Which look to start from
 * @returns A complete set, with its own colour objects
 */
export const resolve_afterburner_params = (
  input?: AfterburnerParamsInput,
  preset?: AfterburnerPresetName | AfterburnerPreset,
): AfterburnerParams => {
  const params = default_afterburner_params();

  const look = get_afterburner_preset(preset);

  assign_params(params, look.params);

  const base_radius = params.nozzleRadiusM;

  if (input === undefined) {
    return params;
  }

  // The mix first, so anything given outright is written over what it made
  const { propellant, ...rest } = input;

  if (propellant !== undefined) {
    Object.assign(
      params,
      propellant_params(
        propellant,
        look.propellant && {
          params: { ...params },
          propellant: look.propellant,
        },
      ),
    );
  }

  assign_params(params, rest);

  if (
    input.nozzleRadiusM !== undefined &&
    base_radius > 0 &&
    input.nozzleRadiusM !== base_radius
  ) {
    const scale = input.nozzleRadiusM / base_radius;

    for (const key of METRIC_KEYS) {
      if (input[key] === undefined) {
        params[key] *= scale;
      }
    }
  }

  return params;
};

/**
 * Write a partial set of params over a complete one.
 * @param params The complete set, written in place
 * @param input What to write
 */
const assign_params = (
  params: AfterburnerParams,
  input: AfterburnerParamsInput,
) => {
  for (const key of Object.keys(input) as (keyof AfterburnerParamsInput)[]) {
    const value = input[key];

    if (value === undefined) {
      continue;
    }

    if ((COLOR_KEYS as readonly string[]).includes(key)) {
      params[key as ColorKey] = new Color(value as ColorRepresentation);
    } else {
      (params as Record<string, unknown>)[key] = value;
    }
  }
};

/**
 * Fill a partial profile in, over a preset and the defaults.
 * @param input What to override
 * @param preset Which look to start from
 * @returns A complete profile
 */
export const resolve_afterburner_profile = (
  input?: Partial<AfterburnerProfile>,
  preset?: AfterburnerPresetName | AfterburnerPreset,
): AfterburnerProfile => {
  const profile = {
    ...default_afterburner_profile(),
    ...get_afterburner_preset(preset).profile,
  };

  if (input !== undefined) {
    for (const key of Object.keys(input) as (keyof AfterburnerProfile)[]) {
      const value = input[key];

      if (value !== undefined) {
        (profile as Record<string, unknown>)[key] = value;
      }
    }
  }

  return profile;
};

/**
 * How much a frame may spend, by name.
 */
export const AFTERBURNER_QUALITY = {
  // A phone, or a sky full of distant plumes
  low: { nearSteps: 32, midSteps: 12, turbulenceOctaves: 1 },
  medium: { nearSteps: 48, midSteps: 16, turbulenceOctaves: 2 },
  high: default_afterburner_quality(),

  // For a still frame
  ultra: { nearSteps: 112, midSteps: 40, turbulenceOctaves: 3 },
} satisfies Record<string, AfterburnerQuality>;

/**
 * A quality setting, by name or in part.
 */
export type AfterburnerQualityInput =
  | keyof typeof AFTERBURNER_QUALITY
  | Partial<AfterburnerQuality>;

/**
 * Fill a quality setting in.
 * @param input A name, or what to override over `high`
 * @returns A complete quality, the step counts whole and in range
 */
export const resolve_afterburner_quality = (
  input?: AfterburnerQualityInput,
): AfterburnerQuality => {
  const quality =
    typeof input === "string"
      ? { ...AFTERBURNER_QUALITY[input] }
      : { ...default_afterburner_quality(), ...input };

  const near = Math.max(1, Math.round(quality.nearSteps));

  return {
    nearSteps: near,
    midSteps: Math.max(1, Math.min(near, Math.round(quality.midSteps))),
    turbulenceOctaves: Math.max(
      1,
      Math.min(3, Math.round(quality.turbulenceOctaves)),
    ),
  };
};
