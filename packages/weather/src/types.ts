import type { AirMass } from "./microphysics";

// The dials split the way the physics does
//
// A `CloudLayer` is one genus of cloud across the sky: where it is, how much
// of the sky it covers, how its cells are sized and shaped, how much water it
// keeps and how fast it billows. Its base and its water come from the day, so
// the same cumulus sit lower on a humid morning and higher on a dry
// afternoon. `WeatherDay` is that day; `WeatherLook` is how it is lit
//
// Cumuliform layers are made of cells: each cloud a dome on a flat base at
// the condensation level, a seeded population of sizes. Stratiform layers are
// sheets, broken where their cover says. Either can rain

/**
 * A cloud placed by hand, in a cumuliform layer: a storm where it should be.
 */
export type CloudCell = {
  /** Where its centre is, in the scene's horizontal axes x and z, metres */
  at: readonly [number, number];

  /** How wide it is at its base, metres */
  diameterM: number;

  /**
   * How high its top is, metres above sea level. Left out, the layer's: its
   * aspect over the diameter, or the tropopause for a cumulonimbus
   */
  topM?: number;

  /** How wide its anvil spreads, metres. Left out, the layer's */
  anvilDiameterM?: number;

  /** How hard it rains under it, at its core, mm/h. Left out, the layer's */
  rainMmPerH?: number;
};

/**
 * A cumulonimbus's anvil: where its updraft meets the tropopause and spreads
 * out downwind.
 */
export type CloudAnvil = {
  /** How wide it spreads, metres */
  diameterM: number;

  /** How thick it is under the tropopause, metres */
  thicknessM: number;

  /**
   * How far downwind of the tower it is carried, as a share of its own
   * radius
   */
  drift: number;
};

/**
 * Whether a layer is made of cells or is a sheet.
 */
export type CloudForm = "cumuliform" | "stratiform";

/**
 * One layer of cloud, in SI units.
 */
export type CloudLayer = {
  /** What it is: a cumulus field, a sheet of stratus, a storm */
  form: CloudForm;

  /**
   * Its base, metres above sea level, or `"condensation"`: the lifted
   * condensation level, where the day's air saturates when lifted from the
   * ground
   */
  baseM: number | "condensation";

  /**
   * How deep it is above its base, metres: a sheet's thickness, or for a
   * cumuliform layer the deepest any of its clouds can grow. `"tropopause"`
   * for storms, which grow until the stable air there stops them
   */
  depthM: number | "tropopause";

  /** The share of the sky it covers, 0 to 1: oktas over eight */
  cover: number;

  /**
   * A cumuliform layer's clouds' diameters, smallest and largest, metres,
   * drawn from a power law: as many clouds of each size as D^-exponent
   */
  diameterM: readonly [number, number];
  sizeExponent: number;

  /** A cumuliform cloud's height over its diameter */
  aspect: number;

  /**
   * How square its top is: 2 a dome, more a tower that rounds off only at
   * its top
   */
  crown: number;

  /** A cumulonimbus's anvil, if it has one */
  anvil?: CloudAnvil;

  /**
   * How hard it rains under it, at the cores, mm/h: zero for none. Rain falls
   * from the base to the ground
   */
  rainMmPerH: number;

  /**
   * The share of the adiabatic water the cloud keeps, as it mixes with the
   * dry air round it and rains out: near one in a shallow sheet, a third in
   * a towering cumulus
   */
  adiabaticFraction: number;

  /** What its droplets formed on: fewer, larger droplets over the sea */
  airMass: AirMass;

  /** Its ice crystals' generalised effective size, metres */
  iceSizeM: number;

  /**
   * How fast its air rises, metres a second: its billows boil upward at it.
   * A fair-weather cumulus's few, a thunderstorm's tens
   */
  updraftMPerS: number;

  /**
   * How large its billows are: the length over which its shape's noise
   * repeats, and its detail's, metres
   */
  billowM: number;
  detailM: number;

  /**
   * How far its billows are drawn out along the wind: one for none, more for
   * cirrus's streaks
   */
  stretch: number;

  /** The wind carrying it, in the scene's x and z, metres a second */
  windMPerS: readonly [number, number];

  /** Clouds placed by hand, in a cumuliform layer */
  cells?: readonly CloudCell[];

  /** Its own seed, mixed with the weather's. Left out, its place in the sky */
  seed?: number;
};

/**
 * The day the clouds form in: the air at the ground, from which the
 * condensation level and every cloud's water follow.
 */
export type WeatherDay = {
  /** How much warmer than the standard day, kelvin, at every altitude */
  temperatureOffsetK: number;

  /** The relative humidity at the ground, 0 to 1 */
  surfaceHumidity: number;

  /** The ground's altitude, metres above sea level */
  groundM: number;
};

/**
 * How the clouds are lit. Linear RGB, in the scene's light units.
 */
export type WeatherLook = {
  /** Towards the sun, in world space */
  sunDirection: readonly [number, number, number];

  /** The sun's illuminance on a surface facing it, colour times strength */
  sun: readonly [number, number, number];

  /** The sky's radiance, the same from every direction above */
  sky: readonly [number, number, number];

  /** The ground's radiance, seen from above */
  ground: readonly [number, number, number];

  /** What one unit of the scene's light is drawn as */
  exposure: number;

  /**
   * The air between the camera and the clouds: its meteorological range,
   * metres, and the colour it fades a distant cloud to. Zero range for none:
   * an atmosphere's aerial perspective does it instead
   */
  visibilityM: number;
  haze: readonly [number, number, number];
};

/**
 * How finely the clouds are drawn, against how fast.
 */
export type WeatherQuality = {
  /** The clouds' resolution against the frame's, per axis */
  resolutionScale: number;

  /** The most steps a ray takes */
  steps: number;

  /** The shortest and longest step, metres */
  minStepM: number;
  maxStepM: number;

  /** How far the clouds are drawn to, metres */
  rangeM: number;

  /** The weather map's texels a side, and how much ground it spans, metres */
  mapSize: number;
  mapExtentM: number;

  /** The share of each frame's ray kept over the history: lower is smoother */
  blend: number;
};

/** Qualities, by name */
export type WeatherQualityName = "low" | "medium" | "high";

export const WEATHER_QUALITY: Record<WeatherQualityName, WeatherQuality> = {
  low: {
    resolutionScale: 0.35,
    steps: 64,
    minStepM: 8,
    maxStepM: 600,
    rangeM: 60_000,
    mapSize: 384,
    mapExtentM: 96_000,
    blend: 0.08,
  },
  medium: {
    resolutionScale: 0.5,
    steps: 96,
    minStepM: 5,
    maxStepM: 400,
    rangeM: 80_000,
    mapSize: 512,
    mapExtentM: 128_000,
    blend: 0.1,
  },
  high: {
    resolutionScale: 0.6,
    steps: 160,
    minStepM: 3,
    maxStepM: 250,
    rangeM: 120_000,
    mapSize: 1024,
    mapExtentM: 192_000,
    blend: 0.12,
  },
};

/**
 * A quality by name, or its own.
 * @param quality The quality, or its name
 * @returns The quality
 */
export const resolve_weather_quality = (
  quality: Partial<WeatherQuality> | WeatherQualityName | undefined,
): WeatherQuality =>
  typeof quality === "object"
    ? { ...WEATHER_QUALITY.medium, ...quality }
    : WEATHER_QUALITY[quality ?? "medium"];

/**
 * The standard day, humid enough for fair-weather cumulus at about a
 * kilometre.
 * @returns A fresh day
 */
export const default_weather_day = (): WeatherDay => ({
  temperatureOffsetK: 0,
  surfaceHumidity: 0.7,
  groundM: 0,
});

/**
 * A clear day's light, in the docs' plain stage's units.
 * @returns A fresh look
 */
export const default_weather_look = (): WeatherLook => ({
  sunDirection: [0.4, 0.75, 0.3],
  sun: [3, 2.9, 2.7],
  sky: [0.35, 0.5, 0.8],
  ground: [0.12, 0.12, 0.1],
  exposure: 1,
  visibilityM: 60_000,
  haze: [0.6, 0.7, 0.85],
});
