import { air_column, type AirColumn, type Climate } from "./climate";
import {
  condensation_level,
  condensation_rain,
  CORE_AREA,
  parcel_top,
  PRECIPITATION_EFFICIENCY,
  UPDRAFT_SHARE,
  type CloudColumn,
  type Prepared,
} from "./diagnose";
import { pcg3d, unit } from "./noise";
import { flash_rate } from "./physics";

// Thunderstorms, each a cell with a life (Byers and Braham 1949)
//
// - Cumulus stage: a tower rising from the condensation level at about half
//   its updraft, √(2 CAPE) halved, until it reaches its equilibrium level.
// - Mature stage, 15 to 30 minutes: it rains, it flashes as often as Price
//   and Rind (1992) find a storm of its height does, and its anvil spreads
//   under the tropopause, drifting downwind with the wind's shear.
// - Dissipating stage, about half an hour: the downdraft takes over, the
//   tower and the rain fade, and the anvil, spreading still, outlives it.
//
// Storms fire on a jittered grid, each square of the climate's storm spacing
// giving one at most at a time, where the air there is unstable enough and
// rising: the same squares, the same seed, the same storms. Placed storms
// and fronts add cells of their own, through plugins

/**
 * A storm, as it was when it fired: what its life follows from.
 */
export type CellSpec = {
  /** Its own number, for the lightning's random draws */
  id: number;

  /** Where its tower stands, in the air's frame, metres */
  x: number;
  z: number;

  /** When it fired, seconds on the weather's clock */
  startS: number;

  /** Its base and its equilibrium level, metres above sea level */
  baseM: number;
  equilibriumM: number;

  /** Its CAPE, J/kg */
  capeJPerKg: number;

  /** Its tower's radius, metres */
  radiusM: number;

  /** How long its mature stage lasts, seconds: Infinity for one that never ends */
  matureS: number;

  /** Its core's rain, mm/h; left out, what its updraft condenses */
  rainMmPerH?: number;

  /** Its anvil's largest radius, metres; left out, as far as it spreads */
  anvilRadiusM?: number;
};

/** A storm's stage */
export type CellStage = "cumulus" | "mature" | "dissipating" | "anvil";

/**
 * A storm now.
 */
export type Cell = {
  spec: CellSpec;
  stage: CellStage;

  /** Its tower's top now, metres above sea level */
  topM: number;

  /** How much of its tower is left, 0 to 1: one until it dissipates */
  strength: number;

  /** Its updraft, m/s */
  updraftMPerS: number;

  /** Its core's rain, mm/h */
  rainMmPerH: number;

  /** Its flashes a minute */
  flashesPerMin: number;

  /** Its anvil's centre in the air's frame, radius and thickness, metres */
  anvilX: number;
  anvilZ: number;
  anvilRadiusM: number;
  anvilM: number;
};

// How fast a tower's top rises against its updraft: a thermal's cap rises at
// about half the speed of the air in it (Scorer 1957). An estimate
const RISE_SHARE = 0.5;

// The stages' lengths (Byers and Braham 1949)
const MATURE_S = 20 * 60;
const DISSIPATING_S = 30 * 60;

// An anvil outlives its storm by an hour or so before it thins to nothing.
// An estimate
const ANVIL_AFTER_S = 60 * 60;

// How fast an anvil spreads: the outflow under the tropopause is a gravity
// current of about 10 m/s. An estimate
const ANVIL_SPREAD_M_S = 10;

// An anvil's thickness against its storm's depth: a couple of kilometres for
// a deep storm. An estimate
const ANVIL_SHARE = 0.2;
const ANVIL_MOST_M = 2500;

// A storm's tower's radius against its depth: a 10 km storm a few km across.
// An estimate
const TOWER_ASPECT = 0.25;
const TOWER_LEAST_M = 1500;
const TOWER_MOST_M = 6000;

// What a storm needs to fire: buoyancy for a deep tower, and a depth the
// storm can electrify in. Estimates
const FIRE_CAPE = 300;
const FIRE_DEPTH_M = 4000;

// The chance a square fires, at its CAPE and its ascent: likelier the more
// unstable and the faster the air rises. An estimate
const fire_chance = (air: AirColumn, cape: number): number =>
  Math.min(Math.max((cape - FIRE_CAPE) / 2500, 0), 1) *
  Math.min(Math.max(0.5 + air.liftMPerS / 0.04, 0), 1);

/**
 * How long a storm lives, its anvil included.
 * @param spec The storm
 * @returns Seconds
 */
const lifetime = (spec: CellSpec): number =>
  rise_time(spec) + spec.matureS + DISSIPATING_S + ANVIL_AFTER_S;

/**
 * How long a storm's tower takes to reach its equilibrium level.
 * @param spec The storm
 * @returns Seconds
 */
const rise_time = (spec: CellSpec): number =>
  (spec.equilibriumM - spec.baseM) /
  Math.max(RISE_SHARE * UPDRAFT_SHARE * Math.sqrt(2 * spec.capeJPerKg), 1);

/**
 * A tower's radius for a storm's depth.
 * @param depth_m Its depth
 * @returns Metres
 */
export const tower_radius = (depth_m: number): number =>
  Math.min(Math.max(TOWER_ASPECT * depth_m, TOWER_LEAST_M), TOWER_MOST_M);

/**
 * A storm now.
 * @param spec The storm
 * @param prepared Its climate's tables
 * @param time_s The weather's clock
 * @param out Where to write it
 * @returns out, or null before it fires or after it is gone
 */
export const evolve_cell = (
  spec: CellSpec,
  prepared: Prepared,
  time_s: number,
  out?: Cell,
): Cell | null => {
  const age = time_s - spec.startS;

  if (age < 0 || age > lifetime(spec)) return null;

  const { climate } = prepared;
  const updraft = UPDRAFT_SHARE * Math.sqrt(2 * spec.capeJPerKg);
  const rise = rise_time(spec);
  const mature_end = rise + spec.matureS;
  const dissipated = mature_end + DISSIPATING_S;
  const depth = spec.equilibriumM - spec.baseM;

  const cell = out ?? ({ spec } as Cell);

  cell.spec = spec;
  cell.topM = spec.baseM + Math.min(RISE_SHARE * updraft * age, depth);
  cell.updraftMPerS = updraft;

  let rain_share = 0;

  if (age < rise) {
    cell.stage = "cumulus";
    cell.strength = 1;
  } else if (age < mature_end) {
    cell.stage = "mature";
    cell.strength = 1;
    rain_share = 1;
  } else if (age < dissipated) {
    const f = (age - mature_end) / DISSIPATING_S;

    cell.stage = "dissipating";
    cell.strength = 1 - f;
    cell.updraftMPerS *= 1 - f;
    rain_share = (1 - f) * (1 - f);
  } else {
    cell.stage = "anvil";
    cell.strength = 0;
    cell.updraftMPerS = 0;
  }

  const rain =
    spec.rainMmPerH ??
    condensation_rain(
      spec.baseM,
      spec.equilibriumM,
      climate.temperatureOffsetK,
      updraft,
      PRECIPITATION_EFFICIENCY,
    ) * CORE_AREA;

  cell.rainMmPerH = rain * rain_share;
  cell.flashesPerMin =
    flash_rate((cell.topM - climate.groundM) / 1000, climate.airMass) *
    rain_share;

  // The anvil: spreading from when the tower reached the top, drifting with
  // the shear, thinning after the storm is gone
  const spreading = Math.max(
    Math.min(age, spec.matureS === Infinity ? age : dissipated) - rise,
    0,
  );
  const most = spec.anvilRadiusM ?? Infinity;
  const radius = Math.min(spec.radiusM + ANVIL_SPREAD_M_S * spreading, most);
  const shear_x = climate.upperWind[0] - climate.wind[0];
  const shear_z = climate.upperWind[1] - climate.wind[1];
  const shear = Math.hypot(shear_x, shear_z) || 1;

  // Blown downwind as far as the shear carries it, but never off its
  // tower while the storm feeds it: half its radius at most
  const drift = Math.min(shear * Math.max(age - rise, 0), radius * 0.5);

  cell.anvilX = spec.x + (shear_x / shear) * drift;
  cell.anvilZ = spec.z + (shear_z / shear) * drift;
  cell.anvilRadiusM = radius;
  cell.anvilM =
    age < rise || spec.equilibriumM < climate.tropopauseM - 3000
      ? 0
      : Math.min(ANVIL_SHARE * depth, ANVIL_MOST_M) *
        Math.min(Math.max(1 - (age - dissipated) / ANVIL_AFTER_S, 0), 1);

  return cell;
};

/**
 * A storm's cloud, over a point of its column.
 * @param cell The storm
 * @param x The point, in the air's frame
 * @param z The point
 * @param column The column, to add it to
 */
export const apply_cell = (
  cell: Cell,
  x: number,
  z: number,
  column: CloudColumn,
): void => {
  const { spec } = cell;

  if (cell.strength > 0) {
    const dx = x - spec.x;
    const dz = z - spec.z;
    const r2 = (dx * dx + dz * dz) / (spec.radiusM * spec.radiusM);

    if (r2 < 1) {
      // A dome, flat-topped as a tower is: (1 − r²)^¼
      const q = 1 - r2;
      const top = spec.baseM + (cell.topM - spec.baseM) * Math.pow(q, 0.25);

      column.cumulus = Math.max(column.cumulus, cell.strength);
      column.cumulusTopM = Math.max(column.cumulusTopM, top);
      column.baseM =
        column.cumulus > 0 ? Math.min(column.baseM, spec.baseM) : spec.baseM;
      column.updraftMPerS = Math.max(column.updraftMPerS, cell.updraftMPerS);
    }

    // The rain under it, heaviest at the core
    if (cell.rainMmPerH > 0 && r2 < 4) {
      column.rainMmPerH = Math.max(
        column.rainMmPerH,
        cell.rainMmPerH * Math.exp(-r2 * 2),
      );
    }
  }

  if (cell.anvilM > 0) {
    const dx = x - cell.anvilX;
    const dz = z - cell.anvilZ;
    const r2 = (dx * dx + dz * dz) / (cell.anvilRadiusM * cell.anvilRadiusM);

    if (r2 < 1) {
      // A lens, thickest over the storm
      column.anvilM = Math.max(column.anvilM, cell.anvilM * Math.sqrt(1 - r2));
    }
  }
};

/**
 * How far past its tower a storm's cloud may reach, for finding the storms
 * over a region.
 * @param cell The storm
 * @returns Metres from its tower
 */
export const cell_reach = (cell: Cell): number =>
  Math.max(
    cell.spec.radiusM * 2,
    Math.hypot(cell.anvilX - cell.spec.x, cell.anvilZ - cell.spec.z) +
      cell.anvilRadiusM,
  );

/**
 * A region of the air's frame: x and z, least and most.
 */
export type Region = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
};

// How far past a region a storm's anvil may still reach into it
const REACH_M = 60_000;

/**
 * The storms the climate fires, round a region at a time: the grid's squares,
 * each its own epochs, the storm of each epoch if it fires. Remembered once
 * found, as the air they fired in is the same however often they are asked
 * for.
 */
export class Convection {
  #specs = new Map<string, CellSpec | null>();
  #air: AirColumn = {
    humidity: 0,
    warmthK: 0,
    capM: 0,
    midHumidity: 0,
    highHumidity: 0,
    liftMPerS: 0,
  };

  /**
   * @param prepared The climate's tables
   * @param salts The seed's salts for the air
   * @param seed The seed
   * @param air_hook The plugins' changes to the air, at a point
   */
  readonly prepared: Prepared;
  readonly salts: Uint32Array;
  readonly seed: number;
  readonly air_hook: (air: AirColumn, x: number, z: number, t: number) => void;

  constructor(
    prepared: Prepared,
    salts: Uint32Array,
    seed: number,
    air_hook: (air: AirColumn, x: number, z: number, t: number) => void,
  ) {
    this.prepared = prepared;
    this.salts = salts;
    this.seed = seed;
    this.air_hook = air_hook;
  }

  /**
   * The storms the climate fires that reach into a region now.
   * @param region The region, in the air's frame
   * @param time_s The weather's clock
   * @param out Where to add them
   */
  cells(region: Region, time_s: number, out: CellSpec[]): void {
    const climate: Climate = this.prepared.climate;
    const spacing = climate.stormSpacingM;
    const epoch = MATURE_S * 2 + DISSIPATING_S + ANVIL_AFTER_S + 30 * 60;

    // Forget storms long gone, now and then
    if (this.#specs.size > 4096) this.#specs.clear();

    const i0 = Math.floor((region.minX - REACH_M) / spacing);
    const i1 = Math.floor((region.maxX + REACH_M) / spacing);
    const j0 = Math.floor((region.minZ - REACH_M) / spacing);
    const j1 = Math.floor((region.maxZ + REACH_M) / spacing);

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        // Each square's epochs start at their own phase
        const phase = unit(pcg3d(i, j, this.seed ^ 0x51ed)[0]) * epoch;
        const k = Math.floor((time_s + phase) / epoch);

        for (let e = k - 1; e <= k; e++) {
          const key = `${i},${j},${e}`;
          let spec = this.#specs.get(key);

          if (spec === undefined) {
            spec = this.#fire(i, j, e, epoch, phase, spacing);
            this.#specs.set(key, spec);
          }

          if (spec) out.push(spec);
        }
      }
    }
  }

  /**
   * The storm a square fires in an epoch, if it does.
   */
  #fire(
    i: number,
    j: number,
    e: number,
    epoch: number,
    phase: number,
    spacing: number,
  ): CellSpec | null {
    const { prepared } = this;
    const { climate } = prepared;
    const h = pcg3d(i * 7919 + e, j * 104729 - e, this.seed);
    const chance = unit(h[2]);

    // Somewhere in the square, at some time in the epoch's first half
    const x = (i + 0.1 + 0.8 * unit(h[0])) * spacing;
    const z = (j + 0.1 + 0.8 * unit(h[1])) * spacing;
    const start =
      e * epoch - phase + unit(pcg3d(h[2], h[0], e)[0]) * epoch * 0.5;

    const air = air_column(climate, this.salts, x, z, start, this.#air);

    this.air_hook(air, x, z, start);

    const base = condensation_level(climate, air.humidity, air.warmthK);
    const { topM, capeJPerKg: cape } = parcel_top(
      prepared,
      air.humidity,
      air.warmthK,
    );
    const equilibrium = Math.min(topM, climate.tropopauseM);

    // Too shallow, held down by the inversion, or not this time
    if (
      equilibrium - base < FIRE_DEPTH_M ||
      climate.groundM + air.capM < equilibrium - 1000 ||
      chance >= fire_chance(air, cape)
    ) {
      return null;
    }

    return {
      id: h[0] ^ h[1],
      x,
      z,
      startS: start,
      baseM: base,
      equilibriumM: equilibrium,
      capeJPerKg: cape,
      radiusM: tower_radius(equilibrium - base),
      matureS: MATURE_S,
    };
  }
}
