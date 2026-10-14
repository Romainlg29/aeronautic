import {
  air_column,
  clamp_air,
  CLIMATES,
  field_salts,
  make_climate,
  type AirColumn,
  type Climate,
  type ClimateName,
} from "./climate";
import {
  Convection,
  evolve_cell,
  type Cell,
  type CellSpec,
  type Region,
} from "./convection";
import {
  cloud_extinction,
  EARTH_RADIUS_M,
  noise_scales,
  water_table,
  type CloudExtinction,
  type NoiseScales,
  type ShapeFrame,
} from "./density";
import {
  diagnose,
  empty_column,
  prepare,
  type CloudColumn,
  type Prepared,
} from "./diagnose";
import { Lightning, type LightningEvents } from "./lightning";
import { cells_in, WeatherMap, type MapSource } from "./map";
import { seed_offset } from "./noise";
import { visibility } from "./physics";
import type { WeatherContext, WeatherPlugin } from "./plugin";
import {
  default_weather_look,
  WEATHER_QUALITY,
  type WeatherLook,
} from "./types";

/**
 * What the weather is made with.
 */
export type WeatherOptions = {
  /** Every cloud's seed: the same seed, the same sky */
  seed?: number;

  /** The climate the sky is drawn from: its name, or its own */
  climate?: ClimateName | Climate;

  /** How it is lit */
  look?: Partial<WeatherLook>;

  /** What it is made of past its climate: storms, fronts, anything */
  plugins?: readonly WeatherPlugin[];
};

/**
 * The air at a point, as the clouds make it.
 */
export type WeatherSample = {
  /** Its extinction, per metre: droplets, ice and rain together */
  extinction: number;

  /** Each's share of it, per metre */
  water: number;
  ice: number;
  rain: number;

  /** How far one sees through it, metres: Koschmieder's range */
  visibilityM: number;

  /** Whether it is inside a cloud: its droplets or ice, rain left out */
  inCloud: boolean;

  /**
   * About how much cloud is over it and under it: optical depths to its
   * cloud's top and base, at its own extinction, as the clouds' shader takes
   * them to light it by the sky and the ground
   */
  up: number;
  down: number;

  /** How hard it rains there, mm/h, under the cloud or not */
  rainMmPerH: number;
};

// How long a frame may spend baking the map, ms: the rest of the bake waits
// for the next
const BAKE_BUDGET_MS = 1.5;

// One frame in this many bakes the far map instead of the near: its clouds
// are kilometres a texel, and change slowly there
const FAR_BAKE_EVERY = 4;

/**
 * The weather: a climate, the seed its sky is drawn with, the plugins that
 * add to it, how it is lit, and where the scene is in it.
 *
 * Its own frame is metres, x and z along the ground and y up. The scene's
 * origin sits at `origin` in it: its x and z, and its altitude. Its clouds
 * drift through it with the climate's wind, and change as they go: call
 * `advance` every frame, and it runs the clock, moves the scene at its
 * velocity, bakes the map round the camera, and flashes the lightning.
 *
 * Change its climate, its seed or its plugins through `set` and `use`, or
 * in place and call `changed`, and the map is baked again at once.
 */
export class Weather {
  seed: number;
  climate: Climate;
  look: WeatherLook;
  plugins: WeatherPlugin[];

  /** Its clock, seconds */
  time = 0;

  /**
   * Where the scene's origin is in the weather: x, altitude in metres above
   * sea level, z
   */
  origin: [number, number, number] = [0, 0, 0];

  /**
   * How fast the scene's origin moves through the weather, metres a second,
   * in x and z, as `advance` moves it
   */
  velocity: [number, number] = [0, 0];

  /**
   * Where the scene's camera is, in the scene: the map is baked round it,
   * and the thunder heard there
   */
  listener: [number, number, number] = [0, 0, 0];

  /** Counts every change to the climate, the seed or the plugins */
  version = 0;

  /** The lightning */
  readonly lightning: Lightning;

  /** The map round the camera */
  map: WeatherMap;

  /** The far map round it: coarser, as far as the clouds are seen */
  farMap: WeatherMap;

  #built = -1;
  #prepared!: Prepared;
  #salts!: Uint32Array;
  #convection!: Convection;
  #table!: Float32Array;
  #scales!: NoiseScales;
  #shape!: ShapeFrame;
  #context!: WeatherContext;
  #source: MapSource;
  #air: AirColumn = {
    humidity: 0,
    warmthK: 0,
    capM: 0,
    midHumidity: 0,
    highHumidity: 0,
    liftMPerS: 0,
  };
  #column = empty_column();
  #extinction: CloudExtinction = { water: 0, ice: 0, rain: 0, up: 0, down: 0 };
  #specs: CellSpec[] = [];
  #cells: Cell[] = [];
  #bakes = 0;

  /**
   * @param options Its seed, climate, look and plugins
   */
  constructor(options: WeatherOptions = {}) {
    this.seed = options.seed ?? 1;
    this.climate = resolve_climate(options.climate);
    this.look = { ...default_weather_look(), ...options.look };
    this.plugins = [...(options.plugins ?? [])];
    this.lightning = new Lightning(this.seed);
    this.map = new WeatherMap(
      WEATHER_QUALITY.medium.mapSize,
      WEATHER_QUALITY.medium.mapExtentM,
    );
    this.farMap = new WeatherMap(
      WEATHER_QUALITY.medium.farMapSize,
      WEATHER_QUALITY.medium.farMapExtentM,
    );

    this.#source = {
      column: (x, z, out) => this.#compute_column(x, z, out),
      cells: (region) => this.#cells_over(region),
    };
  }

  /**
   * Change any of it.
   * @param options What to change
   * @returns This
   */
  set(options: WeatherOptions): this {
    if (options.seed !== undefined) this.seed = options.seed;
    if (options.climate !== undefined) {
      this.climate = resolve_climate(options.climate);
    }
    if (options.look) Object.assign(this.look, options.look);
    if (options.plugins) this.plugins = [...options.plugins];

    if (
      options.seed !== undefined ||
      options.climate !== undefined ||
      options.plugins
    ) {
      this.changed();
    }

    return this;
  }

  /**
   * Say the climate, the seed or a plugin was changed in place.
   */
  changed(): void {
    this.version++;
  }

  /**
   * Add a plugin.
   * @param plugin The plugin
   * @returns Take it away again
   */
  use(plugin: WeatherPlugin): () => void {
    this.plugins.push(plugin);
    this.changed();

    return () => {
      const index = this.plugins.indexOf(plugin);

      if (index >= 0) {
        this.plugins.splice(index, 1);
        this.changed();
      }
    };
  }

  /**
   * Listen for its lightning: each flash as it strikes, and its thunder as
   * it reaches the listener.
   * @param event What for
   * @param listener What to call
   * @returns Stop listening
   */
  on<K extends keyof LightningEvents>(
    event: K,
    listener: LightningEvents[K],
  ): () => void {
    return this.lightning.on(event, listener);
  }

  /**
   * Size the map: as large as the farthest cloud drawn, and as fine.
   * @param size Its texels a side
   * @param extent_m Its side, metres
   */
  resize_map(size: number, extent_m: number): void {
    if (this.map.size === size && this.map.extentM === extent_m) return;

    this.map.dispose();
    this.map = new WeatherMap(size, extent_m);
  }

  /**
   * Size the far map: as large as the farthest cloud seen, and as fine.
   * @param size Its texels a side
   * @param extent_m Its side, metres
   */
  resize_far_map(size: number, extent_m: number): void {
    if (this.farMap.size === size && this.farMap.extentM === extent_m) return;

    this.farMap.dispose();
    this.farMap = new WeatherMap(size, extent_m);
  }

  /** The climate's tables, as built for it */
  get prepared(): Prepared {
    this.#build();

    return this.#prepared;
  }

  /** The clouds' water table */
  get table(): Float32Array {
    this.#build();

    return this.#table;
  }

  /** What the clouds' shapes are sampled with */
  get shapes(): ShapeFrame {
    this.#build();
    this.#update_shapes();

    return this.#shape;
  }

  /** The storms now, round the camera */
  get cells(): readonly Cell[] {
    return this.#cells;
  }

  /**
   * Where a point of the scene is in the low clouds' air: its x and z in the
   * weather, less how far the wind has carried the clouds.
   * @param x The point, in the scene
   * @param z The point
   * @returns Its x and z in the air
   */
  air_at(x: number, z: number): [number, number] {
    const [wx, wz] = this.climate.wind;

    return [
      this.origin[0] + x - wx * this.time,
      this.origin[2] + z - wz * this.time,
    ];
  }

  /**
   * Where a point of the low clouds' air is in the scene: the inverse of
   * `air_at`, its altitude to the scene's height.
   * @param x The point, in the air
   * @param altitude_m Its altitude
   * @param z The point
   * @returns It, in the scene
   */
  to_scene(x: number, altitude_m: number, z: number): [number, number, number] {
    const [wx, wz] = this.climate.wind;

    return [
      x - this.origin[0] + wx * this.time,
      altitude_m - this.origin[1],
      z - this.origin[2] + wz * this.time,
    ];
  }

  /**
   * Run the clock, move the scene through the weather at its velocity, bake
   * the map round the camera, and flash the lightning.
   * @param delta_s Seconds
   */
  advance(delta_s: number): void {
    this.time += delta_s;
    this.origin[0] += this.velocity[0] * delta_s;
    this.origin[2] += this.velocity[1] * delta_s;

    const rebuilt = this.#build();
    const context = this.#context;

    context.time = this.time;

    for (const plugin of this.plugins) plugin.update?.(context, delta_s);

    this.#bake(rebuilt);

    // The storms now: those the map was baked with, evolved to the clock
    this.#cells.length = 0;

    for (const cell of this.map.cells) {
      const now = evolve_cell(cell.spec, this.#prepared, this.time);

      if (now) this.#cells.push(now);
    }

    const [lx, ly, lz] = this.listener;
    const [ax, az] = this.air_at(lx, lz);

    this.lightning.update(this.#cells, this.time, delta_s, {
      groundM: this.climate.groundM,
      temperatureOffsetK: this.climate.temperatureOffsetK,
      latitudeDeg: this.climate.latitudeDeg,
      listener: [ax, this.origin[1] + ly, az],
    });
  }

  /**
   * The air over a point of the scene, as the clouds form in it.
   * @param x The point, in the scene
   * @param z The point
   * @returns The air, in a scratch object
   */
  air(x: number, z: number): AirColumn {
    this.#build();

    const [ax, az] = this.air_at(x, z);

    return this.#air_over(ax, az, this.#air);
  }

  /**
   * The clouds over a point of the scene, as the map holds them.
   * @param x The point, in the scene
   * @param z The point
   * @param out Where to write them
   * @returns out
   */
  column(x: number, z: number, out: CloudColumn = empty_column()): CloudColumn {
    this.#build();

    const [ax, az] = this.air_at(x, z);

    return this.map.column(ax, az, out) ?? this.#compute_column(ax, az, out);
  }

  /**
   * The air at a point of the scene, as the clouds make it: what an aircraft
   * there flies through.
   * @param x The point, in the scene
   * @param y The point
   * @param z The point
   * @returns Its extinction, and whether it is in cloud
   */
  sample(x: number, y: number, z: number): WeatherSample {
    this.#build();
    this.#update_shapes();

    const [ax, az] = this.air_at(x, z);
    const column =
      this.map.column(ax, az, this.#column) ??
      this.#compute_column(ax, az, this.#column);
    const altitude =
      this.origin[1] + y + (x * x + z * z) / (2 * EARTH_RADIUS_M);
    const e = cloud_extinction(
      column,
      ax,
      altitude,
      az,
      this.climate,
      this.#table,
      this.#shape,
      this.#extinction,
    );
    const extinction = e.water + e.ice + e.rain;

    return {
      extinction,
      water: e.water,
      ice: e.ice,
      rain: e.rain,
      visibilityM: visibility(extinction),
      inCloud: e.water + e.ice > 0,
      up: e.up,
      down: e.down,
      rainMmPerH: altitude < column.baseM ? column.rainMmPerH : 0,
    };
  }

  /**
   * Build what the climate, the seed and the plugins make, if they changed.
   * @returns Whether it was built again
   */
  #build(): boolean {
    if (this.#built === this.version) return false;

    this.#built = this.version;
    this.#prepared = prepare(this.climate);
    this.#salts = field_salts(this.seed);
    this.#table = water_table(this.#prepared);
    this.#scales = noise_scales(this.#prepared);
    this.#context = {
      time: this.time,
      seed: this.seed,
      climate: this.climate,
      prepared: this.#prepared,
    };
    this.#convection = new Convection(
      this.#prepared,
      this.#salts,
      this.seed,
      (air, x, z, t) => {
        const time = this.#context.time;

        this.#context.time = t;

        for (const plugin of this.plugins)
          plugin.air?.(air, x, z, this.#context);

        this.#context.time = time;
        clamp_air(air);
      },
    );

    const [ux, uz] = this.climate.upperWind;
    const upper = Math.hypot(ux, uz) || 1;

    this.#shape = {
      scales: this.#scales,
      offset: seed_offset(this.seed),
      upper: [ux / upper, uz / upper],
      drift: [0, 0],
    };

    return true;
  }

  #update_shapes(): void {
    const [ux, uz] = this.climate.upperWind;
    const [wx, wz] = this.climate.wind;

    this.#shape = {
      ...this.#shape,
      drift: [(ux - wx) * this.time, (uz - wz) * this.time],
    };
  }

  /**
   * The air over a point of the air's frame: the climate's, and the plugins'.
   */
  #air_over(x: number, z: number, out: AirColumn): AirColumn {
    air_column(this.climate, this.#salts, x, z, this.time, out);

    const context = this.#context;

    context.time = this.time;

    for (const plugin of this.plugins) plugin.air?.(out, x, z, context);

    return clamp_air(out);
  }

  /**
   * The clouds over a point of the air's frame, before the storms.
   */
  #compute_column(x: number, z: number, out: CloudColumn): CloudColumn {
    const air = this.#air_over(x, z, this.#air);

    diagnose(this.#prepared, air, out);

    for (const plugin of this.plugins) {
      plugin.column?.(out, air, x, z, this.#context);
    }

    return out;
  }

  /**
   * The storms over a region now: the climate's and the plugins'.
   */
  #cells_over(region: Region): Cell[] {
    const specs = this.#specs;

    specs.length = 0;
    this.#convection.cells(region, this.time, specs);

    const context = this.#context;

    context.time = this.time;

    for (const plugin of this.plugins) plugin.cells?.(region, context, specs);

    const cells: Cell[] = [];

    for (const spec of specs) {
      const cell = evolve_cell(spec, this.#prepared, this.time);

      if (cell) cells.push(cell);
    }

    return cells_in(cells, region);
  }

  /**
   * Bake the map round the camera: at once when the weather changed or the
   * camera is near its edge, else a little each frame, again and again, as
   * the clouds change.
   * @param urgent Whether the weather changed
   */
  #bake(urgent: boolean): void {
    const [ax, az] = this.air_at(this.listener[0], this.listener[2]);
    const source = this.#source;

    // Either map at once if it is not round the camera
    const behind = (map: WeatherMap): boolean => {
      const shown = map.frame;

      if (urgent || !shown) return true;

      return (
        Math.max(Math.abs(ax - shown.x), Math.abs(az - shown.z)) >
        map.extentM * 0.3
      );
    };

    let baked = false;

    for (const map of [this.map, this.farMap]) {
      if (behind(map)) {
        map.bake(map.frame_at(ax, az), source);
        baked = true;
      }
    }

    if (baked) return;

    // Else one of them a little, again and again
    const map = ++this.#bakes % FAR_BAKE_EVERY === 0 ? this.farMap : this.map;

    if (!map.baking) map.start(map.frame_at(ax, az), source);

    map.step(source, BAKE_BUDGET_MS);
  }
}

/**
 * A climate by name, or its own.
 * @param climate The climate
 * @returns It
 */
const resolve_climate = (
  climate: ClimateName | Climate | undefined,
): Climate =>
  typeof climate === "object"
    ? climate
    : climate
      ? make_climate(climate)
      : { ...CLIMATES.fair };
