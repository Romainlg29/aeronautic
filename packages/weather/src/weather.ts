import {
  curved_altitude,
  erosion_at,
  hand_clouds,
  layer_column,
  layer_density,
  layer_extinction,
  noise_coordinates,
  noise_salts,
  resolve_layer,
  type Cloud,
  type ResolvedLayer,
} from "./field";
import { visibility } from "./microphysics";
import {
  default_weather_day,
  default_weather_look,
  type CloudLayer,
  type WeatherDay,
  type WeatherLook,
} from "./types";

/**
 * What the weather is made with.
 */
export type WeatherOptions = {
  /** Every cloud's seed: the same seed, the same sky */
  seed?: number;

  /** The layers, low to high or any order */
  layers?: readonly CloudLayer[];

  /** The day they form in */
  day?: Partial<WeatherDay>;

  /** How they are lit */
  look?: Partial<WeatherLook>;
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
};

/**
 * The weather: its layers of cloud, the day they formed in, how they are lit,
 * and where the scene is in them.
 *
 * Its own frame is metres, x and z along the ground and y up, and its clouds
 * drift through it with their winds. The scene's origin sits at `origin` in
 * it: its x and z, and its altitude. Move the origin, or give it a velocity,
 * and the scene flies through the weather; the clouds are drawn and sampled
 * round it.
 *
 * Change its layers, its day or its seed through `set`, or change them in
 * place and call `changed`, and whatever draws it rebuilds what it must.
 */
export class Weather {
  seed: number;
  layers: CloudLayer[];
  day: WeatherDay;
  look: WeatherLook;

  /** Its clock, seconds: the winds and the updrafts move with it */
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

  /** Counts every change to the layers, the day or the seed */
  version = 0;

  #resolved: { version: number; layers: ResolvedLayer[]; hand: Cloud[][] } = {
    version: -1,
    layers: [],
    hand: [],
  };

  /**
   * @param options Its seed, layers, day and look
   */
  constructor(options: WeatherOptions = {}) {
    this.seed = options.seed ?? 1;
    this.layers = [...(options.layers ?? [])];
    this.day = { ...default_weather_day(), ...options.day };
    this.look = { ...default_weather_look(), ...options.look };
  }

  /**
   * Change any of it.
   * @param options What to change
   * @returns This
   */
  set(options: WeatherOptions): this {
    if (options.seed !== undefined) this.seed = options.seed;
    if (options.layers) this.layers = [...options.layers];
    if (options.day) Object.assign(this.day, options.day);
    if (options.look) Object.assign(this.look, options.look);

    if (options.seed !== undefined || options.layers || options.day) {
      this.changed();
    }

    return this;
  }

  /**
   * Say the layers, the day or the seed were changed in place.
   */
  changed(): void {
    this.version++;
  }

  /**
   * Add a layer.
   * @param layer The layer
   * @returns Take it away again
   */
  add(layer: CloudLayer): () => void {
    this.layers.push(layer);
    this.changed();

    return () => {
      const index = this.layers.indexOf(layer);

      if (index >= 0) {
        this.layers.splice(index, 1);
        this.changed();
      }
    };
  }

  /**
   * Run the clock, and move the scene through the weather at its velocity.
   * @param delta_s Seconds
   */
  advance(delta_s: number): void {
    this.time += delta_s;
    this.origin[0] += this.velocity[0] * delta_s;
    this.origin[2] += this.velocity[1] * delta_s;
  }

  /**
   * The layers, worked out for the day, and the clouds placed by hand in
   * each; worked out again only when something changed.
   * @returns Them
   */
  resolve(): { layers: ResolvedLayer[]; hand: Cloud[][] } {
    const cache = this.#resolved;

    if (cache.version !== this.version) {
      cache.version = this.version;
      cache.layers = this.layers.map((layer, index) =>
        resolve_layer(layer, this.day, this.seed, index),
      );
      cache.hand = cache.layers.map(hand_clouds);
    }

    return cache;
  }

  /**
   * Where a point of the scene is in a layer's air: its x and z in the
   * weather, less how far the layer's wind has carried its clouds.
   * @param layer The layer
   * @param x The point, in the scene
   * @param z The point
   * @returns Its x and z in the layer's air
   */
  air(layer: CloudLayer, x: number, z: number): [number, number] {
    return [
      this.origin[0] + x - layer.windMPerS[0] * this.time,
      this.origin[2] + z - layer.windMPerS[1] * this.time,
    ];
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
    const { layers, hand } = this.resolve();
    const [shape_salt, detail_salt] = noise_salts(this.seed);
    const altitude = curved_altitude(x, this.origin[1] + y, z);

    let water = 0;
    let ice = 0;
    let rain = 0;

    for (const [index, resolved] of layers.entries()) {
      if (altitude < this.day.groundM || altitude > resolved.topM) continue;

      const [ax, az] = this.air(resolved.layer, x, z);
      const column = layer_column(resolved, hand[index], ax, az);

      if (column.height <= 0 && column.anvil <= 0 && column.rain <= 0) {
        continue;
      }

      let density = 0;

      if (altitude >= resolved.baseM) {
        density = layer_density(
          resolved,
          column,
          altitude,
          erosion_at(
            noise_coordinates(resolved, ax, altitude, az, this.time),
            shape_salt,
            detail_salt,
          ),
        );
      }

      const [w, i, r] = layer_extinction(
        resolved,
        column,
        altitude,
        density,
        this.day.groundM,
      );

      water += w;
      ice += i;
      rain = Math.max(rain, r);
    }

    const extinction = water + ice + rain;

    return {
      extinction,
      water,
      ice,
      rain,
      visibilityM: visibility(extinction),
      inCloud: water + ice > 0,
    };
  }
}
