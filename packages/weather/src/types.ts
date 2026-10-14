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
  /**
   * The clouds' resolution against the frame's, per axis. A ray is marched
   * for one texel in every four by four each frame, the rest kept from the
   * last frames: a sixteenth of this many rays
   */
  resolutionScale: number;

  /** The most steps a ray takes to `shapeM` */
  steps: number;

  /** The most it takes past `shapeM`, to `rangeM` */
  farSteps: number;

  /** The shortest step, metres */
  minStepM: number;

  /**
   * How far the clouds are drawn as themselves, metres: past it, as their
   * mean, from the far map, lit as layers
   */
  shapeM: number;

  /** How far the clouds are drawn to at all, metres */
  rangeM: number;

  /** How near the detail noise wears the clouds' edges, metres */
  detailM: number;

  /** The weather map's texels a side, and how much of the air it spans */
  mapSize: number;
  mapExtentM: number;

  /** The far map's, for the clouds past `shapeM` */
  farMapSize: number;
  farMapExtentM: number;

  /** The share of a texel's ray kept over its history: lower is smoother */
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
 * @param start_m Where it starts, metres: by default at the eye
 * @returns The steps
 */
export const steps_to = (range_m: number, share: number, start_m = 0): number =>
  Math.ceil(
    Math.log((range_m + STEPS_FROM_M) / (start_m + STEPS_FROM_M)) /
      Math.log(1 + share),
  );

// The far steps' share of their distance. Past the clouds' shapes their mean
// is smooth over the far map's texels, kilometres, and a step 6 % of its
// distance long still finds a storm there two or three times
const FAR_SHARE = 0.06;

// How far a cloud is seen: over the horizon, √(2 R h) from the eye and as
// far again from the cloud's top. From the 13 km the examples fly to, to a
// storm's top as high, some 800 km; from a cruise's 11 km to a cumulus's
// 2 km top, 535 km. The far map spans the range on every side, and the fade
// at its edge past it
const FAR_EXTENT = 2.4;

// Each quality's `shapeM` is inside its near map, short of where its edge
// begins to fade, 0.88 of its half-width: the clouds' shapes never thin out
// before they hand over to their mean

export const WEATHER_QUALITY: Record<WeatherQualityName, WeatherQuality> = {
  low: {
    resolutionScale: 0.75,
    // A step at most 5 % of its distance: 150 m at 3 km
    steps: steps_to(60_000, 0.05),
    farSteps: steps_to(300_000, FAR_SHARE, 60_000),
    minStepM: 8,
    shapeM: 60_000,
    rangeM: 300_000,
    detailM: 4000,
    mapSize: 192,
    mapExtentM: 144_000,
    farMapSize: 160,
    farMapExtentM: 300_000 * FAR_EXTENT,
    blend: 0.08,
  },
  medium: {
    resolutionScale: 1,
    steps: steps_to(80_000, 0.04),
    farSteps: steps_to(500_000, FAR_SHARE, 80_000),
    minStepM: 5,
    shapeM: 80_000,
    rangeM: 500_000,
    detailM: 8000,
    mapSize: 256,
    mapExtentM: 192_000,
    farMapSize: 224,
    farMapExtentM: 500_000 * FAR_EXTENT,
    blend: 0.1,
  },
  high: {
    resolutionScale: 1,
    steps: steps_to(120_000, 0.03),
    farSteps: steps_to(800_000, FAR_SHARE, 120_000),
    minStepM: 3,
    shapeM: 120_000,
    rangeM: 800_000,
    detailM: 16_000,
    mapSize: 384,
    mapExtentM: 288_000,
    farMapSize: 352,
    farMapExtentM: 800_000 * FAR_EXTENT,
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
