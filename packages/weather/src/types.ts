// How the weather is lit, and how finely it is drawn

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
   * The air between the camera and the clouds: its meteorological range at
   * the ground, metres, thinning with height as the aerosols do: it fades a
   * distant cloud to what lies behind it. Zero range for none:
   * an atmosphere's aerial perspective does it instead
   */
  visibilityM: number;

  /**
   * The scene's light units in a lux, for the lightning, whose light is
   * physical. Left out, the sun's: its luminance over the 100 000 lux of
   * the sun at noon
   */
  lux?: number;
};

/**
 * How finely the clouds are drawn, against how fast.
 */
export type WeatherQuality = {
  /** The clouds' resolution against the frame's, per axis */
  resolutionScale: number;

  /** The most steps a ray takes */
  steps: number;

  /** The shortest step, metres */
  minStepM: number;

  /** How far the clouds are drawn to, metres */
  rangeM: number;

  /** How near the detail noise wears the clouds' edges, metres */
  detailM: number;

  /** The weather map's texels a side, and how much of the air it spans */
  mapSize: number;
  mapExtentM: number;

  /** The share of each frame's ray kept over the history: lower is smoother */
  blend: number;
};

/** Qualities, by name */
export type WeatherQualityName = "low" | "medium" | "high";

/**
 * Where the steps of a ray grow from: they grow with the distance past this,
 * so the first is a few metres and not nothing.
 */
export const STEPS_FROM_M = 100;

/**
 * How many steps a ray takes to its range, each no longer than a share of its
 * distance past `STEPS_FROM_M`: the steps grow by that share, so it takes
 * ln((range + from) / from) / ln(1 + share). Any fewer, and the far steps are
 * longer than the small clouds there, a cloud caught by one frame's ray and
 * missed by the next's, flickering as they go by.
 * @param range_m How far the ray goes, metres
 * @param share The longest step, as a share of its distance
 * @returns The steps
 */
export const steps_to = (range_m: number, share: number): number =>
  Math.ceil(
    Math.log((range_m + STEPS_FROM_M) / STEPS_FROM_M) / Math.log(1 + share),
  );

export const WEATHER_QUALITY: Record<WeatherQualityName, WeatherQuality> = {
  low: {
    resolutionScale: 0.35,
    // A step at most 5 % of its distance: 150 m at 3 km
    steps: steps_to(60_000, 0.05),
    minStepM: 8,
    rangeM: 60_000,
    detailM: 4000,
    mapSize: 192,
    mapExtentM: 144_000,
    blend: 0.08,
  },
  medium: {
    resolutionScale: 0.5,
    steps: steps_to(80_000, 0.04),
    minStepM: 5,
    rangeM: 80_000,
    detailM: 8000,
    mapSize: 256,
    mapExtentM: 192_000,
    blend: 0.1,
  },
  high: {
    resolutionScale: 0.6,
    steps: steps_to(120_000, 0.03),
    minStepM: 3,
    rangeM: 120_000,
    detailM: 16_000,
    mapSize: 384,
    mapExtentM: 288_000,
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
});

/**
 * The scene's light units in a lux, for a look.
 * @param look The look
 * @returns Units a lux
 */
export const look_lux = (look: WeatherLook): number =>
  look.lux ??
  (0.2126 * look.sun[0] + 0.7152 * look.sun[1] + 0.0722 * look.sun[2]) / 1e5;
