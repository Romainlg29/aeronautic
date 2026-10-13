import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
} from "three";
import { apply_cell, cell_reach, type Cell, type Region } from "./convection";
import { COLUMN_FIELDS, empty_column, type CloudColumn } from "./diagnose";

// The weather map: the clouds over every point round the camera, baked on the
// CPU into three textures the march reads
//
// It is in the air's frame, the clouds drifting with the wind, and centred
// on the camera's place in it, snapped to its texels so that a map baked
// again over the same air holds the very same values. The air's fields are
// smooth over tens of kilometres, so they are worked out on a coarser grid
// and interpolated; the storms are drawn at the map's own resolution. A bake
// is spread over frames, a few rows at a time, and shown whole once done:
// the clouds change a bake's worth at a time, a second or so, and a storm's
// tower rises a few metres in it. Towards its edge the map fades to no
// cloud, so the march never meets a hard edge

/** The map's channels: three textures of four */
export const MAP_CHANNELS = 12;

// The coarse grid's spacing, in texels
const COARSE = 4;

// The share of the map's half-width over which its edge fades
const EDGE_FADE = 0.12;

/**
 * Where a map is, and how fine.
 */
export type MapFrame = {
  /** Its centre, in the air's frame, metres */
  x: number;
  z: number;

  /** Its side, metres, and its texels a side */
  extentM: number;
  size: number;
};

/**
 * What a map is baked from: the column over a point of the air's frame, the
 * storms there, and when.
 */
export type MapSource = {
  /** The clouds over a point, from the air: before the storms */
  column: (x: number, z: number, out: CloudColumn) => CloudColumn;

  /** The storms over a region now */
  cells: (region: Region) => Cell[];
};

/**
 * The lowest and highest any cloud in a map reaches, and whether any rains.
 */
export type MapBounds = {
  lowM: number;
  highM: number;
  rain: boolean;
};

/**
 * A half-float texture of four channels, filtered and clamped.
 * @param size Its texels a side
 * @param name Its name
 * @returns It
 */
const half_texture = (size: number, name: string): DataTexture => {
  const texture = new DataTexture(
    new Uint16Array(size * size * 4),
    size,
    size,
    RGBAFormat,
    HalfFloatType,
  );

  texture.name = name;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
};

/**
 * The weather map.
 */
export class WeatherMap {
  readonly size: number;
  readonly extentM: number;

  /** The textures, as the GPU reads them: covers, heights, the rest */
  readonly textures: [DataTexture, DataTexture, DataTexture];

  /** The frame of what the textures hold, null before the first bake */
  frame: MapFrame | null = null;

  /** What the textures hold, as floats, for the CPU */
  values: Float32Array;

  /** The lowest and highest cloud the textures hold */
  bounds: MapBounds = { lowM: 0, highM: 0, rain: false };

  /** Counts every bake shown */
  version = 0;

  // The bake under way
  #next: Float32Array;
  #halves: Uint16Array[];
  #coarse: Float32Array;
  #frame: MapFrame | null = null;
  #cells: Cell[] = [];
  #row = 0;
  #coarse_row = 0;
  #column = empty_column();

  /**
   * @param size Its texels a side
   * @param extent_m Its side, metres
   */
  constructor(size: number, extent_m: number) {
    this.size = size;
    this.extentM = extent_m;
    this.textures = [
      half_texture(size, "weather.covers"),
      half_texture(size, "weather.heights"),
      half_texture(size, "weather.rest"),
    ];
    this.values = new Float32Array(size * size * MAP_CHANNELS);
    this.#next = new Float32Array(size * size * MAP_CHANNELS);
    this.#halves = [0, 1, 2].map(() => new Uint16Array(size * size * 4));

    const coarse = size / COARSE + 1;

    this.#coarse = new Float32Array(coarse * coarse * MAP_CHANNELS);
  }

  /** Whether a bake is under way */
  get baking(): boolean {
    return this.#frame !== null;
  }

  /**
   * The frame a map round a point would have.
   * @param x The point, in the air's frame
   * @param z The point
   * @returns The frame, its centre on a texel's corner
   */
  frame_at(x: number, z: number): MapFrame {
    const texel = this.extentM / this.size;

    // Snapped to the coarse grid, so the same air gives the same values
    const snap = texel * COARSE;

    return {
      x: Math.round(x / snap) * snap,
      z: Math.round(z / snap) * snap,
      extentM: this.extentM,
      size: this.size,
    };
  }

  /**
   * Start a bake round a point.
   * @param frame Where
   * @param source What from
   */
  start(frame: MapFrame, source: MapSource): void {
    const half = frame.extentM / 2;

    this.#frame = frame;
    this.#row = 0;
    this.#coarse_row = 0;
    this.#cells = source.cells({
      minX: frame.x - half,
      maxX: frame.x + half,
      minZ: frame.z - half,
      maxZ: frame.z + half,
    });
  }

  /**
   * Bake for a while.
   * @param source What from
   * @param budget_ms How long, at most: at least a row is done
   * @returns Whether the bake finished, and is shown
   */
  step(source: MapSource, budget_ms: number): boolean {
    const frame = this.#frame;

    if (!frame) return false;

    const until = performance.now() + budget_ms;
    const { size } = this;
    const coarse_size = size / COARSE + 1;
    const texel = frame.extentM / size;
    const left = frame.x - frame.extentM / 2;
    const top = frame.z - frame.extentM / 2;
    const column = this.#column;

    // The air's clouds on the coarse grid first
    while (this.#coarse_row < coarse_size) {
      const j = this.#coarse_row++;

      for (let i = 0; i < coarse_size; i++) {
        source.column(
          left + i * COARSE * texel,
          top + j * COARSE * texel,
          column,
        );

        const at = (j * coarse_size + i) * MAP_CHANNELS;

        for (let c = 0; c < MAP_CHANNELS; c++) {
          this.#coarse[at + c] = column[COLUMN_FIELDS[c]];
        }
      }

      if (performance.now() > until) return false;
    }

    // Then every texel: interpolated, the storms drawn over, faded at the edge
    const coarse = this.#coarse;
    const next = this.#next;
    const cells = this.#cells;

    while (this.#row < size) {
      const j = this.#row++;
      const z = top + (j + 0.5) * texel;
      const cj = (j + 0.5) / COARSE;
      const j0 = Math.min(Math.floor(cj), coarse_size - 2);
      const fj = cj - j0;
      const edge_z = Math.abs((j + 0.5) / size - 0.5) * 2;

      for (let i = 0; i < size; i++) {
        const x = left + (i + 0.5) * texel;
        const ci = (i + 0.5) / COARSE;
        const i0 = Math.min(Math.floor(ci), coarse_size - 2);
        const fi = ci - i0;
        const a = (j0 * coarse_size + i0) * MAP_CHANNELS;
        const b = a + MAP_CHANNELS;
        const c = a + coarse_size * MAP_CHANNELS;
        const d = c + MAP_CHANNELS;

        for (let k = 0; k < MAP_CHANNELS; k++) {
          column[COLUMN_FIELDS[k]] =
            (coarse[a + k] * (1 - fi) + coarse[b + k] * fi) * (1 - fj) +
            (coarse[c + k] * (1 - fi) + coarse[d + k] * fi) * fj;
        }

        for (const cell of cells) apply_cell(cell, x, z, column);

        // Faded to nothing towards the edge
        const edge = Math.max(Math.abs((i + 0.5) / size - 0.5) * 2, edge_z);
        const fade = Math.min(Math.max((1 - edge) / EDGE_FADE, 0), 1);

        column.cumulus *= fade;
        column.stratus *= fade;
        column.alto *= fade;
        column.cirrus *= fade;
        column.anvilM *= fade;
        column.rainMmPerH *= fade;

        const at = (j * size + i) * MAP_CHANNELS;

        for (let k = 0; k < MAP_CHANNELS; k++) {
          next[at + k] = column[COLUMN_FIELDS[k]];
        }
      }

      if (performance.now() > until && this.#row < size) return false;
    }

    this.#show(frame);

    return true;
  }

  /**
   * Bake round a point at once.
   * @param frame Where
   * @param source What from
   */
  bake(frame: MapFrame, source: MapSource): void {
    this.start(frame, source);
    this.step(source, Infinity);
  }

  /**
   * Show the bake: its floats for the CPU, its halves for the GPU.
   * @param frame Its frame
   */
  #show(frame: MapFrame): void {
    const { size } = this;
    const next = this.#next;
    const [covers, heights, rest] = this.#halves;
    let low = Infinity;
    let high = -Infinity;
    let rain = false;

    for (let t = 0; t < size * size; t++) {
      const at = t * MAP_CHANNELS;
      const h = t * 4;

      for (let k = 0; k < 4; k++) {
        covers[h + k] = DataUtils.toHalfFloat(next[at + k]);
        heights[h + k] = DataUtils.toHalfFloat(next[at + 4 + k]);
        rest[h + k] = DataUtils.toHalfFloat(next[at + 8 + k]);
      }

      // The shell the clouds fill
      if (next[at] > 0.001 || next[at + 1] > 0.001) {
        low = Math.min(low, Math.min(next[at + 4], next[at + 6] - 150));
        high = Math.max(high, next[at + 5], next[at + 6]);
      }

      if (next[at + 2] > 0.001) {
        low = Math.min(low, next[at + 7]);
        high = Math.max(high, next[at + 8]);
      }

      if (next[at + 3] > 0.001) high = Infinity;
      if (next[at + 9] > 0.5) high = Infinity;
      if (next[at + 10] > 0.01) rain = true;
    }

    this.bounds = { lowM: low, highM: high, rain };

    // Swap: the textures take the new halves, the next bake the old
    for (let k = 0; k < 3; k++) {
      const texture = this.textures[k];
      const data = texture.image.data as Uint16Array;

      texture.image.data = this.#halves[k];
      this.#halves[k] = data;
      texture.needsUpdate = true;
    }

    this.#next = this.values;
    this.values = next;
    this.frame = frame;
    this.#frame = null;
    this.version++;
  }

  /**
   * The clouds over a point the map holds, bilinearly, as the GPU samples
   * them.
   * @param x The point, in the air's frame
   * @param z The point
   * @param out Where to write them
   * @returns out, or null outside the map
   */
  column(x: number, z: number, out: CloudColumn): CloudColumn | null {
    const frame = this.frame;

    if (!frame) return null;

    const { size } = this;
    const u = ((x - frame.x) / frame.extentM + 0.5) * size - 0.5;
    const v = ((z - frame.z) / frame.extentM + 0.5) * size - 0.5;

    if (u < 0 || v < 0 || u > size - 1 || v > size - 1) return null;

    const i = Math.min(Math.floor(u), size - 2);
    const j = Math.min(Math.floor(v), size - 2);
    const fi = u - i;
    const fj = v - j;
    const values = this.values;
    const a = (j * size + i) * MAP_CHANNELS;
    const b = a + MAP_CHANNELS;
    const c = a + size * MAP_CHANNELS;
    const d = c + MAP_CHANNELS;

    for (let k = 0; k < MAP_CHANNELS; k++) {
      out[COLUMN_FIELDS[k]] =
        (values[a + k] * (1 - fi) + values[b + k] * fi) * (1 - fj) +
        (values[c + k] * (1 - fi) + values[d + k] * fi) * fj;
    }

    return out;
  }

  /**
   * The storms in the bake shown or under way.
   * @returns Them
   */
  get cells(): readonly Cell[] {
    return this.#cells;
  }

  dispose(): void {
    for (const texture of this.textures) texture.dispose();
  }
}

/**
 * The storms whose cloud reaches into a region.
 * @param cells The storms
 * @param region The region
 * @returns Those that reach it
 */
export const cells_in = (cells: readonly Cell[], region: Region): Cell[] =>
  cells.filter((cell) => {
    const reach = cell_reach(cell);

    return (
      cell.spec.x + reach > region.minX &&
      cell.spec.x - reach < region.maxX &&
      cell.spec.z + reach > region.minZ &&
      cell.spec.z - reach < region.maxZ
    );
  });
