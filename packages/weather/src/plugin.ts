import type { AirColumn, AirField, Climate } from "./climate";
import { tower_radius, type CellSpec, type Region } from "./convection";
import {
  condensation_level,
  parcel_top,
  UPDRAFT_SHARE,
  type CloudColumn,
  type Prepared,
} from "./diagnose";
import { pcg3d } from "./noise";

// What a weather is made of past its climate, each a plugin
//
// A plugin changes the weather at any of its stages, each optional:
//
// - `air`: the air over a point, before the clouds are worked out from it. A
//   front lifts and moistens it; a dry slot dries it.
// - `cells`: storms, added to those the climate fires. A storm placed by
//   hand; a squall line along a cold front.
// - `column`: the clouds over a point, once worked out. Anything the physics
//   does not make: a lone lenticular, a hole punched in a deck.
// - `update`: once a frame, before any of it, to move with the clock.
//
// Points are in the air's frame: metres, carried by the climate's wind, so a
// feature still in the air drifts with the clouds. One placed on the ground
// is at `ground_to_air` of its place. A plugin whose settings change calls
// `weather.changed()`, so the map is baked again

/**
 * What a plugin is handed: the weather as it is.
 */
export type WeatherContext = {
  /** The weather's clock, seconds */
  time: number;

  /** The seed */
  seed: number;

  climate: Climate;

  /** The climate's tables: the parcel's top and CAPE over the air */
  prepared: Prepared;
};

/**
 * A plugin: any of the stages the weather is made in, changed.
 */
export type WeatherPlugin = {
  /** Its name, for the weather's list */
  name: string;

  /** Change the air over a point */
  air?: (air: AirColumn, x: number, z: number, context: WeatherContext) => void;

  /** Add storms that reach into a region */
  cells?: (region: Region, context: WeatherContext, out: CellSpec[]) => void;

  /** Change the clouds over a point */
  column?: (
    column: CloudColumn,
    air: AirColumn,
    x: number,
    z: number,
    context: WeatherContext,
  ) => void;

  /** Move with the clock, once a frame */
  update?: (context: WeatherContext, delta_s: number) => void;
};

/**
 * Where a place on the ground is in the air's frame now.
 * @param context The weather
 * @param x The place, metres
 * @param z The place
 * @returns Its x and z in the air's frame
 */
export const ground_to_air = (
  context: WeatherContext,
  x: number,
  z: number,
): [number, number] => [
  x - context.climate.wind[0] * context.time,
  z - context.climate.wind[1] * context.time,
];

/**
 * A storm placed by hand.
 */
export type StormOptions = {
  /** Where it stands, x and z in metres, in the air's frame: it drifts with the wind */
  at: readonly [number, number];

  /** How wide its tower is. By default as wide as its depth makes it */
  diameterM?: number;

  /** Its top, metres above sea level. By default the tropopause */
  topM?: number;

  /** How hard it rains at its core, mm/h. By default what its updraft condenses */
  rainMmPerH?: number;

  /** How wide its anvil spreads at most, metres. By default 30 km */
  anvilDiameterM?: number;

  /**
   * How long it stays mature, seconds, from when the clock starts: then it
   * dissipates. By default for ever
   */
  lifeS?: number;

  /**
   * How long before the clock's start it began growing, seconds: by default
   * long enough to be mature at the start, with its anvil spread. Zero, and
   * it grows from a cumulus as you watch
   */
  ageS?: number;
};

// A placed storm's CAPE where the climate has too little for one: a strong
// storm's (Rasmussen and Blanchard 1998, supercells' median about 1500 J/kg)
const PLACED_CAPE = 1500;

/**
 * A storm, where it is told.
 * @param options Where, and how large
 * @returns The plugin
 */
export const storm = (options: StormOptions): WeatherPlugin => {
  let spec: CellSpec | null = null;
  let made_for: Prepared | null = null;

  return {
    name: "storm",
    cells: (region, context, out) => {
      const { prepared, climate } = context;

      if (!spec || made_for !== prepared) {
        const mean = parcel_top(
          prepared,
          climate.fields.humidity.mean,
          climate.fields.warmthK.mean,
        );
        const cape = Math.max(mean.capeJPerKg, PLACED_CAPE);
        const base = condensation_level(
          climate,
          climate.fields.humidity.mean,
          climate.fields.warmthK.mean,
        );
        const top = options.topM ?? climate.tropopauseM;
        const updraft = UPDRAFT_SHARE * Math.sqrt(2 * cape);

        // Grown and mature by the clock's start, its anvil spread
        const age = options.ageS ?? (top - base) / (0.5 * updraft) + 30 * 60;

        spec = {
          id: pcg3d(options.at[0] | 0, options.at[1] | 0, 0x570e)[0],
          x: options.at[0],
          z: options.at[1],
          startS: -age,
          baseM: base,
          equilibriumM: top,
          capeJPerKg: cape,
          radiusM: options.diameterM
            ? options.diameterM / 2
            : tower_radius(top - base),
          matureS: options.lifeS !== undefined ? age + options.lifeS : Infinity,
          rainMmPerH: options.rainMmPerH,
          anvilRadiusM: (options.anvilDiameterM ?? 30_000) / 2,
        };
        made_for = prepared;
      }

      const reach = (spec.anvilRadiusM ?? 0) + spec.radiusM * 2;

      if (
        spec.x + reach > region.minX &&
        spec.x - reach < region.maxX &&
        spec.z + reach > region.minZ &&
        spec.z - reach < region.maxZ
      ) {
        out.push(spec);
      }
    },
  };
};

/**
 * A front.
 */
export type FrontOptions = {
  /**
   * A cold front, the cold air undercutting the warm, a line of storms along
   * it and clearing behind; or a warm front, the warm air overrunning the
   * cold, its cloud deepening from cirrus far ahead to nimbostratus at the
   * front
   */
  kind: "cold" | "warm";

  /** A point on the front at the clock's start, on the ground, metres */
  at: readonly [number, number];

  /** Which way it moves, degrees from the scene's x towards its z */
  headingDeg?: number;

  /** How fast it moves over the ground, m/s. By default 8 */
  speedMPerS?: number;
};

// The fronts' slopes: about 1 in 200 for a warm front, 1 in 100 for a cold
// (Wallace and Hobbs 2006)
const WARM_SLOPE = 1 / 200;

// How far ahead of a warm front each of its clouds reaches: nimbostratus to
// about 300 km, altostratus to 600, cirrostratus and cirrus to 1000 (Wallace
// and Hobbs 2006, the Norwegian model)
const NIMBOSTRATUS_M = 300_000;
const ALTOSTRATUS_M = 600_000;
const CIRRUS_M = 1_000_000;

// A squall line's storms stand about 15 km apart along it, and each lives
// about as long as a storm does, new ones forming ahead as it moves. Estimates
const SQUALL_SPACING_M = 15_000;
const SQUALL_EPOCH_S = 30 * 60;

// How far behind a cold front the air is dried by the subsiding cold air:
// a couple of hundred km. An estimate
const CLEARING_M = 200_000;

/**
 * A front, moving.
 * @param options Which, where, and how fast
 * @returns The plugin
 */
export const front = (options: FrontOptions): WeatherPlugin => {
  const heading = ((options.headingDeg ?? 0) * Math.PI) / 180;
  const nx = Math.cos(heading);
  const nz = Math.sin(heading);
  const speed = options.speedMPerS ?? 8;

  // How far ahead of the front a point of the air is now: positive ahead
  const ahead = (x: number, z: number, context: WeatherContext): number => {
    const [wx, wz] = context.climate.wind;
    const t = context.time;
    const gx = x + wx * t - options.at[0];
    const gz = z + wz * t - options.at[1];

    return gx * nx + gz * nz - speed * t;
  };

  const fall = (d: number, reach: number) =>
    d <= 0 ? 0 : Math.max(1 - d / reach, 0);

  if (options.kind === "warm") {
    return {
      name: "warm-front",
      air: (air, x, z, context) => {
        const d = ahead(x, z, context);

        if (d <= -50_000) return;

        air.liftMPerS += 0.08 * fall(d, NIMBOSTRATUS_M);
        air.midHumidity += 0.5 * fall(d, ALTOSTRATUS_M);
        air.highHumidity += 0.5 * fall(d, CIRRUS_M);
        air.humidity = Math.min(
          air.humidity + 0.1 * fall(d, NIMBOSTRATUS_M),
          1,
        );
      },
      column: (column, _air, x, z, context) => {
        const d = ahead(x, z, context);

        if (d <= 0) return;

        // The overrunning cloud's base sits on the frontal surface
        const surface = context.climate.groundM + d * WARM_SLOPE;

        column.altoBaseM = Math.max(column.altoBaseM, surface + 300);
        column.altoTopM = Math.max(column.altoTopM, column.altoBaseM + 1500);
      },
    };
  }

  return {
    name: "cold-front",
    air: (air, x, z, context) => {
      const d = ahead(x, z, context);

      // Lifted at the front, dried by the sinking cold air behind it
      air.liftMPerS += 0.1 * Math.exp(-((d / 30_000) ** 2));

      if (d < 0) {
        const behind = Math.max(1 + d / CLEARING_M, 0);

        air.humidity -= 0.15 * (1 - behind) * Math.min(-d / 30_000, 1);
        air.midHumidity -= 0.3 * Math.min(-d / 50_000, 1) * (1 - behind * 0.5);
      }
    },
    cells: (region, context, out) => {
      const { prepared, climate } = context;
      const [wx, wz] = climate.wind;
      const along_x = -nz;
      const along_z = nx;
      const epoch_now = Math.floor(context.time / SQUALL_EPOCH_S);
      const base = condensation_level(
        climate,
        climate.fields.humidity.mean + 0.05,
        climate.fields.warmthK.mean,
      );
      const top = climate.tropopauseM;
      const cape = Math.max(
        parcel_top(
          prepared,
          climate.fields.humidity.mean,
          climate.fields.warmthK.mean,
        ).capeJPerKg,
        PLACED_CAPE * 0.6,
      );

      for (let e = epoch_now - 2; e <= epoch_now; e++) {
        const start = e * SQUALL_EPOCH_S;

        // The front's line then, in the air's frame
        const cx = options.at[0] + nx * speed * start - wx * start;
        const cz = options.at[1] + nz * speed * start - wz * start;

        // Its slots along the line that fall in the region
        const project = (x: number, z: number) =>
          (x - cx) * along_x + (z - cz) * along_z;
        const corners = [
          project(region.minX, region.minZ),
          project(region.maxX, region.minZ),
          project(region.minX, region.maxZ),
          project(region.maxX, region.maxZ),
        ];
        const k0 = Math.floor(
          (Math.min(...corners) - 60_000) / SQUALL_SPACING_M,
        );
        const k1 = Math.ceil(
          (Math.max(...corners) + 60_000) / SQUALL_SPACING_M,
        );

        for (let k = k0; k <= k1; k++) {
          const h = pcg3d(k, e, 0xc01d);
          const jitter =
            ((h[0] >>> 8) / 16777216 - 0.5) * SQUALL_SPACING_M * 0.6;
          const s = k * SQUALL_SPACING_M + jitter;

          out.push({
            id: h[1],
            x: cx + along_x * s,
            z: cz + along_z * s,
            startS: start - 20 * 60,
            baseM: base,
            equilibriumM: top,
            capeJPerKg: cape,
            radiusM: tower_radius(top - base) * 0.8,
            matureS: SQUALL_EPOCH_S * 1.5,
          });
        }
      }
    },
  };
};

/**
 * A patch of different air: moister, drier, warmer, lifted, as a bell
 * round a point.
 */
export type PatchOptions = {
  /** Its centre, in the air's frame, metres: it drifts with the wind */
  at: readonly [number, number];

  /** Its radius, metres: the change falls to e⁻¹ there */
  radiusM: number;

  /** What it adds to each field of the air, at its centre */
  change: Partial<Record<AirField, number>>;
};

/**
 * A patch of different air.
 * @param options Where, how large, and what
 * @returns The plugin
 */
export const patch = (options: PatchOptions): WeatherPlugin => {
  const entries = Object.entries(options.change) as [AirField, number][];
  const r2 = options.radiusM * options.radiusM;

  return {
    name: "patch",
    air: (air, x, z) => {
      const dx = x - options.at[0];
      const dz = z - options.at[1];
      const weight = Math.exp(-(dx * dx + dz * dz) / r2);

      if (weight < 1e-3) return;

      for (const [field, change] of entries) air[field] += change * weight;
    },
  };
};
