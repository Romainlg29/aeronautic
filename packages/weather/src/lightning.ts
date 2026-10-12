import { speed_of_sound } from "@aeronautic/core";
import type { Cell } from "./convection";
import { air_temperature, ground_share } from "./physics";

// Lightning: flashes from the storms, as often as their height makes them
//
// Each storm flashes at random, as a Poisson process at its rate (Price and
// Rind 1992, convection.ts). A share strikes the ground (Prentice and
// Mackerras 1977); the rest stay in the cloud. A ground flash is about four
// strokes 60 ms apart (Rakov and Uman 2003), each as bright at its peak as
// Guo and Krider (1982) measured: 2.3 GW of light for the first, 0.48 GW for
// those after. An intracloud flash is one dimmer, longer glow. A flash's
// channel is a fractal path, made by displacing midpoints, its branches
// dimmer. Its thunder reaches a listener at the speed of sound, from the
// nearest part of the channel first and the farthest last

/** A stroke of a flash: when, and its peak light, watts */
export type Stroke = { atS: number; peakW: number };

/**
 * A lightning flash.
 */
export type Flash = {
  id: number;

  /** To the ground, or within the cloud */
  kind: "ground" | "cloud";

  /** Its strokes */
  strokes: Stroke[];

  /** When it began, seconds on the weather's clock */
  startS: number;

  /**
   * Its channel's points, in the air's frame: x, altitude, z, three numbers
   * a point
   */
  points: Float32Array;

  /** Its channel's segments: two points' indices each, and each's brightness */
  segments: Uint16Array;
  weights: Float32Array;

  /** Where its light comes from, the channel's middle, in the air's frame */
  centre: [number, number, number];

  /** The storm it came from */
  cell: number;
};

/**
 * A flash's thunder, as a listener hears it.
 */
export type Thunder = {
  flash: Flash;

  /** How far its nearest part is, metres */
  distanceM: number;

  /** How long it rolls, seconds: from its nearest part to its farthest */
  durationS: number;

  /** How loud, relative: one at a kilometre, falling as the distance */
  loudness: number;
};

// Guo and Krider (1982): the first stroke's peak optical power, and the
// subsequent strokes'
export const FIRST_STROKE_W = 2.3e9;
export const SUBSEQUENT_STROKE_W = 4.8e8;

// An intracloud flash's light: a tenth of a ground flash's first stroke, an
// estimate, its channel inside the cloud and its current weaker
const CLOUD_FLASH_W = 2.3e8;

// How fast a stroke's light falls: its continuing current and the eye's
// persistence leave it seen for some tens of milliseconds. An estimate
export const STROKE_DECAY_S = 0.025;

// Rakov and Uman (2003): about four strokes a ground flash, 60 ms apart
const STROKES_MEAN = 4;
const STROKE_INTERVAL_S = 0.06;

// An intracloud flash's glow lasts a few tenths of a second
const CLOUD_FLASH_S = 0.3;

// How long a flash is kept after its last stroke, for its light to fade
const KEEP_S = 0.5;

// The light's efficacy, lumens a watt: a hot channel's spectrum, an
// estimate, as no measurement was found
export const LIGHTNING_EFFICACY = 80;

// The channel's fractal: how far each midpoint strays, against its
// segment's length, and how often a branch leaves it. Estimates, after
// lightning's fractal dimension, about 1.3 (Tsonis and Elsner 1987)
const DISPLACEMENT = 0.28;
const BRANCHING = 0.3;
const LEVELS = 7;

/**
 * A small seeded random number generator: mulberry32.
 * @param seed The seed
 * @returns Numbers in [0, 1)
 */
export const random = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A flash's channel, from one point to another, its midpoints displaced
 * and its branches grown.
 * @param from Where it starts, x, altitude, z
 * @param to Where it ends
 * @param rng Random numbers
 * @returns Its points, segments and their weights
 */
export const bolt = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  rng: () => number,
): { points: Float32Array; segments: Uint16Array; weights: Float32Array } => {
  const points: number[] = [];
  const segments: number[] = [];
  const weights: number[] = [];

  const add = (p: readonly number[]) => {
    points.push(p[0], p[1], p[2]);

    return points.length / 3 - 1;
  };

  const grow = (
    a: readonly number[],
    b: readonly number[],
    ia: number,
    ib: number,
    level: number,
    weight: number,
  ) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

    if (level === 0 || length < 20) {
      segments.push(ia, ib);
      weights.push(weight);

      return;
    }

    const stray = length * DISPLACEMENT;
    const mid = [
      (a[0] + b[0]) / 2 + (rng() - 0.5) * stray,
      (a[1] + b[1]) / 2 + (rng() - 0.5) * stray * 0.5,
      (a[2] + b[2]) / 2 + (rng() - 0.5) * stray,
    ];
    const im = add(mid);

    grow(a, mid, ia, im, level - 1, weight);
    grow(mid, b, im, ib, level - 1, weight);

    // A branch, off downwards and aside, dimmer
    if (rng() < BRANCHING && level > 2 && weight > 0.1) {
      const reach = length * (0.3 + rng() * 0.4);
      const angle = rng() * Math.PI * 2;
      const end = [
        mid[0] + Math.cos(angle) * reach * 0.6,
        mid[1] - reach * 0.8 * Math.sign(a[1] - b[1] || 1),
        mid[2] + Math.sin(angle) * reach * 0.6,
      ];

      grow(mid, end, im, add(end), level - 2, weight * 0.35);
    }
  };

  const ia = add(from);
  const ib = add(to);

  grow(from, to, ia, ib, LEVELS, 1);

  return {
    points: new Float32Array(points),
    segments: new Uint16Array(segments),
    weights: new Float32Array(weights),
  };
};

/**
 * A flash's light now.
 * @param flash The flash
 * @param time_s The weather's clock
 * @returns Watts of light
 */
export const flash_power = (flash: Flash, time_s: number): number => {
  let power = 0;

  for (const stroke of flash.strokes) {
    const since = time_s - stroke.atS;

    if (since < 0) continue;

    power +=
      flash.kind === "ground"
        ? stroke.peakW * Math.exp(-since / STROKE_DECAY_S)
        : stroke.peakW *
          Math.max(1 - since / CLOUD_FLASH_S, 0) *
          (0.6 + 0.4 * Math.sin(since * 90));
  }

  return power;
};

/**
 * Listen for the weather's lightning.
 */
export type LightningEvents = {
  flash: (flash: Flash) => void;
  thunder: (thunder: Thunder) => void;
};

/**
 * The lightning of the weather's storms.
 */
export class Lightning {
  /** The flashes alight, or fading */
  flashes: Flash[] = [];

  #rng: () => number;
  #pending: { atS: number; thunder: Thunder }[] = [];
  #listeners: { [K in keyof LightningEvents]: Set<LightningEvents[K]> } = {
    flash: new Set(),
    thunder: new Set(),
  };
  #count = 0;

  /**
   * @param seed The seed its draws are made from
   */
  constructor(seed: number) {
    this.#rng = random(seed ^ 0x11647);
  }

  /**
   * Listen.
   * @param event What for
   * @param listener What to call
   * @returns Stop listening
   */
  on<K extends keyof LightningEvents>(
    event: K,
    listener: LightningEvents[K],
  ): () => void {
    this.#listeners[event].add(listener);

    return () => this.#listeners[event].delete(listener);
  }

  /**
   * Flash, for a while.
   * @param cells The storms
   * @param time_s The weather's clock, at the end of the while
   * @param delta_s How long a while
   * @param context The ground, the day and the latitude, and where the
   *   listener is in the air's frame
   */
  update(
    cells: readonly Cell[],
    time_s: number,
    delta_s: number,
    context: {
      groundM: number;
      temperatureOffsetK: number;
      latitudeDeg: number;
      listener: readonly [number, number, number];
    },
  ): void {
    const rng = this.#rng;

    this.flashes = this.flashes.filter(
      (flash) =>
        time_s - flash.strokes[flash.strokes.length - 1].atS <
        KEEP_S + CLOUD_FLASH_S,
    );

    if (delta_s > 0) {
      for (const cell of cells) {
        const expected = (cell.flashesPerMin / 60) * delta_s;

        // Poisson's: at most one a frame, the rest of a long frame dropped
        if (expected <= 0 || rng() >= 1 - Math.exp(-expected)) continue;

        const flash = this.#flash(cell, time_s, context, rng);

        this.flashes.push(flash);

        for (const listener of this.#listeners.flash) listener(flash);

        const thunder = this.#thunder(flash, context);

        this.#pending.push({
          atS:
            flash.startS +
            thunder.distanceM /
              speed_of_sound(
                air_temperature(context.groundM, context.temperatureOffsetK),
              ),
          thunder,
        });
      }
    }

    // The thunder that has reached the listener
    if (this.#pending.length > 0) {
      const due = this.#pending.filter((p) => p.atS <= time_s);

      if (due.length > 0) {
        this.#pending = this.#pending.filter((p) => p.atS > time_s);

        for (const { thunder } of due) {
          for (const listener of this.#listeners.thunder) listener(thunder);
        }
      }
    }
  }

  #flash(
    cell: Cell,
    time_s: number,
    context: { groundM: number; latitudeDeg: number },
    rng: () => number,
  ): Flash {
    const { spec } = cell;
    const ground = rng() < ground_share(context.latitudeDeg);
    const r = spec.radiusM * Math.sqrt(rng()) * 0.8;
    const angle = rng() * Math.PI * 2;
    const x = spec.x + Math.cos(angle) * r;
    const z = spec.z + Math.sin(angle) * r;

    // The charge: the negative region near −10 to −20 °C, about 40 % of the
    // way up a deep storm, the positive above it
    const depth = cell.topM - spec.baseM;
    const negative = spec.baseM + depth * 0.4;

    let from: [number, number, number];
    let to: [number, number, number];
    const strokes: Stroke[] = [];

    if (ground) {
      const reach = spec.radiusM * rng();
      const a = rng() * Math.PI * 2;

      from = [x, negative, z];
      to = [x + Math.cos(a) * reach, context.groundM, z + Math.sin(a) * reach];

      // Poisson's number of strokes about the mean, at least one
      let count = 1;

      while (count < 12 && rng() < 1 - 1 / STROKES_MEAN) count++;

      for (let i = 0; i < count; i++) {
        strokes.push({
          atS: time_s + i * STROKE_INTERVAL_S * (0.5 + rng()),
          peakW: i === 0 ? FIRST_STROKE_W : SUBSEQUENT_STROKE_W,
        });
      }
    } else {
      const span = spec.radiusM * (1 + rng() * 2);
      const a = rng() * Math.PI * 2;

      from = [x, negative, z];
      to = [
        x + Math.cos(a) * span,
        spec.baseM + depth * (0.6 + rng() * 0.25),
        z + Math.sin(a) * span,
      ];
      strokes.push({ atS: time_s, peakW: CLOUD_FLASH_W });
    }

    const channel = bolt(from, to, rng);

    return {
      id: this.#count++,
      kind: ground ? "ground" : "cloud",
      strokes,
      startS: time_s,
      ...channel,
      centre: [
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        (from[2] + to[2]) / 2,
      ],
      cell: spec.id,
    };
  }

  #thunder(
    flash: Flash,
    context: {
      listener: readonly [number, number, number];
      groundM: number;
      temperatureOffsetK: number;
    },
  ): Thunder {
    const [lx, ly, lz] = context.listener;
    const { points } = flash;
    let near = Infinity;
    let far = 0;

    for (let i = 0; i < points.length; i += 3) {
      const d = Math.hypot(
        points[i] - lx,
        points[i + 1] - ly,
        points[i + 2] - lz,
      );

      near = Math.min(near, d);
      far = Math.max(far, d);
    }

    const sound = speed_of_sound(
      air_temperature(context.groundM, context.temperatureOffsetK),
    );

    return {
      flash,
      distanceM: near,
      durationS: (far - near) / sound,
      loudness: 1000 / Math.max(near, 50),
    };
  }

  /**
   * The flashes alight now, brightest first.
   * @param time_s The weather's clock
   * @param count How many at most
   * @returns Them, with their light
   */
  brightest(time_s: number, count: number): { flash: Flash; powerW: number }[] {
    return this.flashes
      .map((flash) => ({ flash, powerW: flash_power(flash, time_s) }))
      .filter((f) => f.powerW > 0)
      .sort((a, b) => b.powerW - a.powerW)
      .slice(0, count);
  }
}
