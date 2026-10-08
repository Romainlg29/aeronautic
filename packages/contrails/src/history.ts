import { Quaternion, Vector3 } from "three";
import { exhaust_offset, type Wake } from "./wake";

// Where each engine's exhaust is, laid in the air the aircraft flew through
//
// The exhaust is left in the air and stays there, sinking with the wake and
// spreading, while the aircraft flies on. So a trail is the engine's own path
// through the air: straight in level flight, a curve in a turn. The air, not
// the world, is what it is laid in: the path is the aircraft's attitude every
// frame and its airspeed along its flight path, integrated, so a model held
// still in a showcase trails the same as one flown through a game's world
//
// Unlike a tip vortex, a contrail is told by its age: how far it has mixed,
// how far it has sunk. So the history is kept by time, and each frame every
// puff is laid back along it at its own age, exactly where the exhaust of
// that age is, and handed to the shader in the aircraft's frame now

// The youngest age a point after the first is laid at, seconds: the first
// is at the engine itself
export const TRAIL_MIN_AGE_S = 0.02;

// The most frames of history kept: minutes at any frame rate
const MAX_SAMPLES = 8192;

// A gap longer than this, a tab in the background, and the history starts
// again rather than drawing the gap as a straight line
const MAX_GAP_S = 2;

// The longest one sample of history may stand for. A slow frame is split
// into steps this long, the attitude turned evenly from the frame before
const MAX_STEP_S = 1 / 30;

// Near the engine the plume changes by the e-fold of its age: its width
// grows as a power of it, so the points follow it evenly in ln(1 + t / t₀),
// at least this many to each e-fold, each a quarter older than the last. t₀
// is the age it forms at: before it there is nothing to draw
export const TRAIL_POINTS_PER_EFOLD = 4;

/**
 * How far the plume has aged, in e-folds of its age past the one it forms
 * at.
 * @param age_s The age, seconds
 * @param start_s The age it forms at, seconds
 * @returns ln(1 + t / t₀)
 */
const plume_cost = (age_s: number, start_s: number) =>
  Math.log1p(Math.max(age_s, 0) / start_s);

/**
 * The age the points start to spread from: the plume's, or the youngest
 * point's if it forms sooner or never.
 * @param start_s The age the plume forms at, seconds
 * @returns It, no younger than TRAIL_MIN_AGE_S
 */
const formation_age = (start_s: number) =>
  Number.isFinite(start_s)
    ? Math.max(start_s, TRAIL_MIN_AGE_S)
    : TRAIL_MIN_AGE_S;

/**
 * The ages the plume's width and ice are worked out at: evenly in its
 * ageing, ln(1 + t / t₀), from the engine out to the trail's length. They
 * stay put, so what is read between them for a puff of some age is the same
 * every frame.
 * @param points How many
 * @param length_s The oldest
 * @param start_s The age the plume forms at, seconds
 * @returns The ages, seconds
 */
export const trail_ages = (
  points: number,
  length_s: number,
  start_s = TRAIL_MIN_AGE_S,
): Float64Array => {
  const count = Math.max(Math.floor(points), 3);
  const oldest = Math.max(length_s, TRAIL_MIN_AGE_S * 2);
  const start = formation_age(start_s);
  const ages = new Float64Array(count);
  const total = plume_cost(oldest, start);

  for (let index = 1; index < count - 1; index++) {
    ages[index] = start * Math.expm1((total * index) / (count - 1));
  }

  ages[count - 1] = oldest;

  return ages;
};

/**
 * How the aircraft flies, the same for every sample of one frame.
 */
export type TrailFlight = {
  /** True airspeed, m/s */
  speedMPerS: number;

  /** The free stream's direction in the canonical frame: aft, up, left */
  cosAlpha: number;
  sinAlpha: number;
  flowZ: number;

  /** Its wake: where the exhaust is carried */
  wake: Wake;

  /** Fuel per metre each engine burns, kilograms */
  fuelPerMetreKg: number;
};

/**
 * One instant of the aircraft's flight through the air.
 */
type Sample = {
  /** Seconds, on the history's own clock */
  time: number;

  /** Where it was in the air, metres, in world axes */
  position: Vector3;

  /** How its canonical frame was turned in the world */
  attitude: Quaternion;

  /** Its flight, which the exhaust it left keeps */
  flight: TrailFlight;
};

/**
 * One point of a trail.
 */
export type TrailPoint = {
  /** Where, in the canonical frame now */
  x: number;
  y: number;
  z: number;

  /**
   * The fuel per metre its exhaust was left with, kilograms: what the ice in
   * it scales with
   */
  fuelPerMetreKg: number;

  /**
   * Which way the trail runs back through the air there, older, in the
   * canonical frame now: the way the aircraft flew when it left it
   */
  backX: number;
  backY: number;
  backZ: number;

  /** How fast it was left, metres of trail to a second of age */
  speedMPerS: number;
};

/**
 * The aircraft's path through the air, by time.
 */
export class TrailHistory {
  private _samples: Sample[] = [];
  private readonly _position = new Vector3();
  private _time = 0;

  /** Forget everything: the next frame starts a new trail */
  reset() {
    this._samples = [];
    this._time = 0;
    this._position.set(0, 0, 0);
  }

  /** Its clock, seconds: when the exhaust being left now is left */
  get timeS(): number {
    return this._time;
  }

  /** How the canonical frame is turned in the air now */
  get attitude(): Readonly<Quaternion> {
    const samples = this._samples;

    return samples.length > 0 ? samples[samples.length - 1].attitude : identity;
  }

  /** How many seconds of flight it holds */
  get spanS(): number {
    const samples = this._samples;

    return samples.length > 1
      ? samples[samples.length - 1].time - samples[0].time
      : 0;
  }

  /**
   * Fly one frame.
   * @param delta_s How long the frame was, in seconds
   * @param attitude How the canonical frame is turned in the world now
   * @param flight How it flies
   * @param keep_s How many seconds of trail to keep
   */
  advance(
    delta_s: number,
    attitude: Quaternion,
    flight: TrailFlight,
    keep_s: number,
  ) {
    if (delta_s > MAX_GAP_S) {
      this.reset();
    }

    const previous = this._samples[this._samples.length - 1];
    const step_s = Math.max(delta_s, 0);

    if (previous && step_s <= 0) {
      previous.attitude.copy(attitude);
      previous.flight = flight;

      return;
    }

    const steps = previous
      ? Math.min(Math.max(Math.ceil(step_s / MAX_STEP_S), 1), 120)
      : 1;

    for (let step = 1; step <= steps; step++) {
      const turned = previous
        ? scratch_turned.slerpQuaternions(
            previous.attitude,
            attitude,
            step / steps,
          )
        : scratch_turned.copy(attitude);

      // The aircraft flies against the free stream
      const velocity = scratch_vector
        .set(-flight.cosAlpha, -flight.sinAlpha, -flight.flowZ)
        .applyQuaternion(turned)
        .multiplyScalar(flight.speedMPerS);

      if (previous) {
        this._position.addScaledVector(velocity, step_s / steps);
        this._time += step_s / steps;
      }

      this._samples.push({
        time: this._time,
        position: this._position.clone(),
        attitude: turned.clone(),
        flight,
      });
    }

    // Older than the trail is long, but one, so the end always has a sample
    // behind it to lay from
    while (
      this._samples.length > 2 &&
      (this._time - this._samples[1].time > keep_s ||
        this._samples.length > MAX_SAMPLES)
    ) {
      this._samples.shift();
    }
  }

  /**
   * Lay one engine's trail back along the history, in the canonical frame
   * now. Past what the history covers it carries on straight, as the oldest
   * sample flew.
   * @param engine The exhaust's position in the canonical frame
   * @param ages The ages to lay points at, youngest first: each is laid
   *   where the exhaust of that age is, whatever the others are
   * @param fallback How it flies, if there is no history yet
   * @param target One point per age
   */
  lay(
    engine: readonly [number, number, number],
    ages: Float64Array,
    fallback: TrailFlight,
    target: TrailPoint[],
  ) {
    const samples = this._samples;
    const now = samples[samples.length - 1];
    const into_now = scratch_inverse
      .copy(now ? now.attitude : identity)
      .invert();

    let older = samples.length - 1;

    for (let index = 0; index < ages.length; index++) {
      const age = ages[index];
      const point = target[index];

      if (!now) {
        // Steady flight: straight back along the stream
        const flight = fallback;
        const offset = exhaust_offset(flight.wake, engine, age, scratch_offset);

        point.x = offset[0] + age * flight.speedMPerS * flight.cosAlpha;
        point.y = offset[1] + age * flight.speedMPerS * flight.sinAlpha;
        point.z = offset[2] + age * flight.speedMPerS * flight.flowZ;
        point.fuelPerMetreKg = flight.fuelPerMetreKg;
        point.backX = flight.cosAlpha;
        point.backY = flight.sinAlpha;
        point.backZ = flight.flowZ;
        point.speedMPerS = flight.speedMPerS;
        continue;
      }

      const time = now.time - age;

      // The two samples either side of when this exhaust was left
      while (older > 0 && samples[older].time > time) {
        older--;
      }

      const before = samples[older];
      const after = samples[Math.min(older + 1, samples.length - 1)];
      const span = after.time - before.time;
      const t =
        span > 1e-9 ? Math.min(Math.max((time - before.time) / span, 0), 1) : 0;

      const attitude = scratch_attitude.slerpQuaternions(
        before.attitude,
        after.attitude,
        t,
      );
      const where = scratch_where.lerpVectors(
        before.position,
        after.position,
        t,
      );
      const flight = t < 0.5 ? before.flight : after.flight;

      // Past the oldest sample: straight on, back along its flight path
      const beyond = Math.max(before.time - time, 0);

      if (beyond > 0) {
        where.addScaledVector(
          scratch_vector
            .set(flight.cosAlpha, flight.sinAlpha, flight.flowZ)
            .applyQuaternion(before.attitude),
          beyond * flight.speedMPerS,
        );
      }

      // The exhaust where the engine left it, carried by the wake it was
      // left in, then into the frame the aircraft has now
      const offset = exhaust_offset(flight.wake, engine, age, scratch_offset);
      const placed = scratch_point
        .set(offset[0], offset[1], offset[2])
        .applyQuaternion(attitude)
        .add(where)
        .sub(now.position)
        .applyQuaternion(into_now);

      point.x = placed.x;
      point.y = placed.y;
      point.z = placed.z;
      point.fuelPerMetreKg = flight.fuelPerMetreKg;

      // Back along the stream it was flown against, then
      const back = scratch_vector
        .set(flight.cosAlpha, flight.sinAlpha, flight.flowZ)
        .applyQuaternion(attitude)
        .applyQuaternion(into_now);

      point.backX = back.x;
      point.backY = back.y;
      point.backZ = back.z;
      point.speedMPerS = flight.speedMPerS;
    }
  }
}

const identity = new Quaternion();
const scratch_vector = new Vector3();
const scratch_where = new Vector3();
const scratch_point = new Vector3();
const scratch_attitude = new Quaternion();
const scratch_turned = new Quaternion();
const scratch_inverse = new Quaternion();
const scratch_offset: [number, number, number] = [0, 0, 0];
