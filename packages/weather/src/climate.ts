import { field_noise, pcg3d } from "./noise";
import type { AirMass } from "./physics";

// The air the clouds form in, different everywhere
//
// A day's weather is not one sky: a clear patch, then fair-weather cumulus
// thickening into a deck, a line of showers, a storm far off. What makes the
// difference is the air: how humid it is, how much the ground heats it, how
// high an inversion caps it, how humid it is aloft and whether it is rising.
// Each of those is a field over the ground, drifting with the wind and
// changing as it goes, and every cloud follows from them by the physics
// (diagnose.ts).
//
// Each field is its mean, plus a share of the pressure system's pattern, the
// meso-α scale of a few hundred kilometres (Orlanski 1975), shared by every
// field so that moist air is also rising air, plus a local pattern of its
// own, the meso-β scale of tens of kilometres, where one cumulus field ends
// and the next begins. Both change over hours, as such features do

/**
 * A field of the air: its mean, and how far the system and the local
 * pattern move it, each about ±1 of its amplitude.
 */
export type FieldSpec = {
  mean: number;
  system: number;
  local: number;
};

/**
 * The air over one point of the ground, as the clouds over it form in.
 */
export type AirColumn = {
  /** The relative humidity at the ground, 0 to 1 */
  humidity: number;

  /**
   * How much warmer than the air round it a parcel leaves the ground: the
   * ground's heating, kelvin. A thermal's half a kelvin to a couple
   */
  warmthK: number;

  /** How high the inversion capping the mixed layer is, metres above ground */
  capM: number;

  /** The relative humidity of the middle troposphere, 0 to 1 */
  midHumidity: number;

  /** The relative humidity over ice at cirrus levels, 0 to 1 and over */
  highHumidity: number;

  /** How fast the air is lifted on the large scale, metres a second */
  liftMPerS: number;
};

/** The air's fields, by name */
export type AirField = keyof AirColumn;

/**
 * The climate a sky is drawn from: the air's fields, and what holds over
 * the whole of it.
 */
export type Climate = {
  /** The air's fields */
  fields: Record<AirField, FieldSpec>;

  /** How much warmer than the standard day, kelvin, at every altitude */
  temperatureOffsetK: number;

  /** The ground's altitude, metres above sea level */
  groundM: number;

  /** What the droplets form on: over the sea, or over land */
  airMass: AirMass;

  /** The latitude, degrees: how many flashes strike the ground */
  latitudeDeg: number;

  /**
   * The wind carrying the low and middle clouds, metres a second, in the
   * scene's x and z
   */
  wind: readonly [number, number];

  /** The wind at the anvils and cirrus, metres a second */
  upperWind: readonly [number, number];

  /** The pressure system's scale, and the local patterns', metres */
  systemM: number;
  localM: number;

  /** How long the local patterns last before they are others, seconds */
  evolutionS: number;

  /**
   * How far apart storms may fire, metres: one at most in each square of
   * this side at a time
   */
  stormSpacingM: number;

  /** The altostratus's base and depth, metres above sea level and thick */
  altoBaseM: number;
  altoDepthM: number;

  /** The cirrus's base and depth */
  cirrusBaseM: number;
  cirrusDepthM: number;

  /** The tropopause, where the storms' anvils spread */
  tropopauseM: number;
};

/** The climates, by name */
export type ClimateName =
  | "clear"
  | "fair"
  | "unsettled"
  | "stormy"
  | "overcast"
  | "frontal";

const field = (mean: number, system: number, local: number): FieldSpec => ({
  mean,
  system,
  local,
});

// What every climate shares, the standard mid-latitude day's: a tropopause at
// 11 km (ISA), cirrus from 8 km, altostratus from 3 km (WMO Cloud Atlas: the
// middle étage is 2 to 7 km at temperate latitudes, the high 5 to 13)
const BASE: Climate = {
  fields: {
    humidity: field(0.7, 0.06, 0.06),
    warmthK: field(1.2, 0.3, 0.5),
    capM: field(2000, 300, 300),
    midHumidity: field(0.4, 0.15, 0.1),
    highHumidity: field(0.5, 0.2, 0.15),
    liftMPerS: field(0, 0.02, 0.01),
  },
  temperatureOffsetK: 0,
  groundM: 0,
  airMass: "continental",
  latitudeDeg: 45,
  wind: [6, 2],
  upperWind: [25, 5],
  systemM: 400_000,
  localM: 30_000,
  // Meso-β features live for hours (Orlanski 1975)
  evolutionS: 3 * 3600,
  // Thunderstorms in a scattered outbreak stand a few tens of km apart
  stormSpacingM: 30_000,
  altoBaseM: 3500,
  altoDepthM: 1500,
  cirrusBaseM: 8500,
  cirrusDepthM: 1500,
  tropopauseM: 11_000,
};

const climate = (
  overrides: Partial<Climate> & {
    fields?: Partial<Record<AirField, FieldSpec>>;
  },
): Climate => ({
  ...BASE,
  ...overrides,
  fields: { ...BASE.fields, ...overrides.fields },
});

/**
 * The climates, each a day as its name says, and every point of it
 * different. Their means are estimates of such days' air: a humidity at the
 * ground, a thermal's warmth, an inversion's height.
 */
export const CLIMATES: Record<ClimateName, Climate> = {
  // Dry, high pressure: sinking air, the odd cumulus where it is moister.
  // Its subsidence inversion is low, about a kilometre (Wallace and Hobbs
  // 2006), under where its dry air condenses
  clear: climate({
    fields: {
      humidity: field(0.45, 0.08, 0.06),
      warmthK: field(0.8, 0.3, 0.4),
      capM: field(1000, 300, 200),
      midHumidity: field(0.25, 0.1, 0.05),
      highHumidity: field(0.35, 0.2, 0.1),
      liftMPerS: field(-0.02, 0.01, 0.005),
    },
  }),

  // Fair-weather cumulus, here dense, there thin, a patch of cirrus
  fair: climate({}),

  // Cumulus growing into congestus and showers, altocumulus aloft
  unsettled: climate({
    fields: {
      humidity: field(0.78, 0.06, 0.06),
      warmthK: field(1.8, 0.4, 0.6),
      capM: field(4500, 1500, 800),
      midHumidity: field(0.6, 0.15, 0.1),
      highHumidity: field(0.65, 0.2, 0.15),
      liftMPerS: field(0.01, 0.03, 0.01),
    },
    temperatureOffsetK: 4,
  }),

  // A warm, humid summer's day without a cap: storms
  stormy: climate({
    fields: {
      humidity: field(0.8, 0.06, 0.05),
      warmthK: field(2.2, 0.5, 0.6),
      capM: field(12_000, 0, 0),
      midHumidity: field(0.65, 0.15, 0.1),
      highHumidity: field(0.75, 0.2, 0.15),
      liftMPerS: field(0.03, 0.03, 0.01),
    },
    temperatureOffsetK: 12,
    tropopauseM: 12_000,
    stormSpacingM: 25_000,
  }),

  // A low, moist mixed layer under a strong inversion: a stratocumulus deck,
  // its top near a kilometre and its base a few hundred metres under it
  // (Wood 2012), broken where the cap rises away from the condensation level
  overcast: climate({
    fields: {
      humidity: field(0.82, 0.05, 0.03),
      warmthK: field(0.4, 0.2, 0.2),
      capM: field(900, 200, 120),
      midHumidity: field(0.55, 0.15, 0.1),
      highHumidity: field(0.5, 0.2, 0.1),
      liftMPerS: field(0, 0.01, 0.005),
    },
    airMass: "maritime",
    wind: [8, 3],
  }),

  // Lifted, moist air ahead of a front: altostratus thickening into
  // nimbostratus, cirrus above, and rain
  frontal: climate({
    fields: {
      humidity: field(0.85, 0.05, 0.04),
      warmthK: field(0.5, 0.2, 0.2),
      capM: field(1500, 400, 200),
      midHumidity: field(0.8, 0.12, 0.06),
      highHumidity: field(0.9, 0.15, 0.1),
      liftMPerS: field(0.06, 0.04, 0.015),
    },
    wind: [12, 4],
    upperWind: [35, 8],
  }),
};

/**
 * A climate by name, with any of it changed.
 * @param name The climate it starts from
 * @param overrides What to change; its fields one by one
 * @returns A fresh climate
 */
export const make_climate = (
  name: ClimateName = "fair",
  overrides: Partial<Omit<Climate, "fields">> & {
    fields?: Partial<Record<AirField, Partial<FieldSpec>>>;
  } = {},
): Climate => {
  const from = CLIMATES[name];
  const fields = { ...from.fields };

  for (const [key, spec] of Object.entries(overrides.fields ?? {})) {
    fields[key as AirField] = { ...fields[key as AirField], ...spec };
  }

  return {
    ...from,
    ...overrides,
    fields,
  };
};

const FIELDS: AirField[] = [
  "humidity",
  "warmthK",
  "capM",
  "midHumidity",
  "highHumidity",
  "liftMPerS",
];

// How far each field may go, whatever its noise
const LIMITS: Record<AirField, [number, number]> = {
  humidity: [0.05, 1],
  warmthK: [0, 6],
  capM: [100, 20_000],
  midHumidity: [0.02, 1.2],
  highHumidity: [0.02, 1.5],
  liftMPerS: [-0.5, 0.5],
};

/**
 * The salts of a seed's fields: one for the system, one for each field.
 * @param seed The seed
 * @returns Them
 */
export const field_salts = (seed: number): Uint32Array => {
  const salts = new Uint32Array(FIELDS.length + 1);

  for (let i = 0; i < salts.length; i++) {
    salts[i] = pcg3d(seed | 0, 0x7f4a7c15 + i, 0x94d049bb)[0];
  }

  return salts;
};

/**
 * The air over a point, from the climate and the seed.
 * @param climate The climate
 * @param salts The seed's salts, from `field_salts`
 * @param x Where, in the air's frame: metres, carried by the wind
 * @param z Where
 * @param time_s When, seconds
 * @param out Where to write it
 * @returns out
 */
export const air_column = (
  climate: Climate,
  salts: Uint32Array,
  x: number,
  z: number,
  time_s: number,
  out: AirColumn = {
    humidity: 0,
    warmthK: 0,
    capM: 0,
    midHumidity: 0,
    highHumidity: 0,
    liftMPerS: 0,
  },
): AirColumn => {
  const evolution = time_s / climate.evolutionS;

  // The system's pattern changes four times as slowly as the local ones: a
  // system lasts days, its features hours
  const system = field_noise(
    x / climate.systemM,
    z / climate.systemM,
    evolution / 4,
    salts[0],
  );

  for (let i = 0; i < FIELDS.length; i++) {
    const name = FIELDS[i];
    const spec = climate.fields[name];
    const local =
      spec.local === 0
        ? 0
        : field_noise(
            x / climate.localM,
            z / climate.localM,
            evolution,
            salts[i + 1],
          );
    const [low, high] = LIMITS[name];

    out[name] = Math.min(
      Math.max(spec.mean + spec.system * system + spec.local * local, low),
      high,
    );
  }

  return out;
};

/**
 * Keep the air's fields within what air can be, after plugins changed them.
 * @param air The air
 * @returns air
 */
export const clamp_air = (air: AirColumn): AirColumn => {
  for (const name of FIELDS) {
    const [low, high] = LIMITS[name];

    air[name] = Math.min(Math.max(air[name], low), high);
  }

  return air;
};
