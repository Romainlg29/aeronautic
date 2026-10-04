import { Matrix4, type Object3D, Quaternion, Vector3 } from "three";
import {
  moist_air,
  ram_pressure,
  SEA_LEVEL_K,
  SEA_LEVEL_PA,
  type MoistAir,
} from "./atmosphere";
import { canonical_frame, type CaptureFrame } from "./capture";

// One aircraft's flight, shared by everything drawn from it
//
// The afterburner, the wing vapour, the control surfaces and whatever comes
// next all want the same handful of numbers: how fast, at what angle, how
// hard it pulls, how high, and the air it is in. `Flight` holds them once, in
// one flat object whose identity never changes, so reading it in a frame
// costs a property access and allocates nothing
//
// It is written in two ways, which mix freely: by hand, from a flight model,
// with `set`; or by watching an object move, with `track`, which works out
// the airspeed, the angles, the load factor and the rates from its world
// transform frame by frame. Either way the air and everything that follows
// from it (Mach, dynamic pressure, density) is worked out at once, the
// atmosphere only when the altitude or the day changes

const G0 = 9.80665;

// How long the tracked velocity and acceleration take to follow the object:
// finite differences of a position are noisy, twice so for an acceleration
const VELOCITY_RESPONSE_S = 0.05;
const ACCELERATION_RESPONSE_S = 0.15;
const RATE_RESPONSE_S = 0.08;

// Frames further apart than this are a tab coming back from the background,
// not a flight: tracking starts over rather than see a jump
const MAX_TRACK_DELTA_S = 0.25;

/**
 * What can be written to a flight. Everything else follows from it.
 */
export type FlightInput = {
  /** True airspeed, in metres per second */
  airspeedMPerS: number;

  /**
   * The angle between the aircraft's forward axis and the oncoming air, in
   * the plane of its up axis, in radians. Positive with the nose above the
   * flight path
   */
  angleOfAttackRad: number;

  /**
   * How far the oncoming air comes from one side, in radians. Positive when
   * it blows from the right, the nose left of the flight path
   */
  sideslipRad: number;

  /** Lift over weight, in g: one in level flight, more in a pull */
  loadFactor: number;

  /**
   * Roll, pitch and yaw rates in the aircraft's own frame, in radians per
   * second: right wing down, nose up and nose right positive
   */
  rollRateRadPerS: number;
  pitchRateRadPerS: number;
  yawRateRadPerS: number;

  /**
   * How hard the engines run: 0 at idle, 1 at military power, on to 1.1 at
   * full reheat, as the afterburner reads it
   */
  throttle: number;

  /**
   * The pilot's controls. Stick and pedals from -1 to 1: right, aft (nose
   * up) and right pedal positive
   */
  roll: number;
  pitch: number;
  yaw: number;

  /**
   * Flaps, air brake and landing gear from 0 to 1: 1 is fully down, out and
   * down
   */
  flaps: number;
  airbrake: number;
  gear: number;

  /** Metres above sea level */
  altitudeM: number;

  /** How much warmer the day is than the standard one, in kelvin */
  temperatureOffsetK: number;

  /** Relative humidity, 0 to 1 */
  relativeHumidity: number;
};

/**
 * Everything a flight knows: what was written, and the air and the speeds
 * that follow from it.
 */
export type FlightValues = FlightInput & {
  /** The flight Mach number */
  mach: number;

  /** ½ρV², in pascals */
  dynamicPressurePa: number;

  /**
   * The air: its temperature in kelvin, its pressure in pascals and as a share
   * of sea level's, its density in kg/m³ and as a share of sea level's on a
   * standard day, and the speed of sound in it
   */
  temperatureK: number;
  pressurePa: number;
  pressureRatio: number;
  densityKgPerM3: number;
  densityRatio: number;
  soundMPerS: number;

  /** Where its vapour would condense, in kelvin */
  dewPointK: number;

  /** The stagnation over static pressure an inlet recovers */
  ram: number;
};

/**
 * How `track` reads an object.
 */
export type FlightTrackOptions = CaptureFrame & {
  /**
   * Where sea level is on the world's y axis, in metres. Left out, the
   * altitude is not tracked and keeps whatever was written
   */
  seaLevelY?: number;

  /**
   * The wind, in world space, metres per second: the airspeed is the
   * object's speed through the air, not over the ground
   */
  wind?: readonly [number, number, number];

  /**
   * Which way is up in the world, for the gravity in the load factor. +Y by
   * default
   */
  worldUp?: readonly [number, number, number];
};

/**
 * Level at sea level on a standard, middling-humid day, at full reheat.
 * @returns Fresh inputs
 */
export const default_flight_input = (): FlightInput => ({
  airspeedMPerS: 0,
  angleOfAttackRad: 0,
  sideslipRad: 0,
  loadFactor: 1,
  rollRateRadPerS: 0,
  pitchRateRadPerS: 0,
  yawRateRadPerS: 0,
  throttle: 1.1,
  roll: 0,
  pitch: 0,
  yaw: 0,
  flaps: 0,
  airbrake: 0,
  gear: 0,
  altitudeM: 0,
  temperatureOffsetK: 0,
  relativeHumidity: 0.6,
});

// Dry air's density at sea level on a standard day, kg/m³
const STANDARD_DENSITY = 1.225;

const scratch_position = new Vector3();
const scratch_velocity = new Vector3();
const scratch_axis = new Vector3();
const scratch_turn = new Quaternion();
const scratch_rotation = new Quaternion();
const scratch_scale = new Vector3();
const scratch_basis = new Matrix4();

/**
 * One aircraft's flight: a mutable store, read every frame for free.
 *
 * `values` is one object for the flight's life, written in place: hold on to
 * it and read it in a frame callback. `version` counts the writes, so a
 * reader can skip work when nothing changed, and `subscribe` hears every one.
 */
export class Flight {
  /** Everything it knows. Written in place: read it, don't write it */
  readonly values: FlightValues;

  /** Counts every write, so a reader can tell when something changed */
  version = 0;

  private readonly _listeners = new Set<() => void>();

  // The moist air last worked out, and what it was worked out for
  private _air: MoistAir;
  private _air_key = [Number.NaN, Number.NaN, Number.NaN];

  // What tracking last saw, in world space
  private _tracking = false;
  private readonly _last_position = new Vector3();
  private readonly _last_rotation = new Quaternion();
  private readonly _velocity = new Vector3();
  private readonly _last_velocity = new Vector3();
  private readonly _acceleration = new Vector3();
  private readonly _rates = new Vector3();

  // The tracked object's frame, its inverse, and the forward and up it was
  // made for, NaN until the first track
  private readonly _frame = new Matrix4();
  private readonly _frame_inverse = new Matrix4();
  private readonly _frame_for = new Float64Array(6).fill(Number.NaN);

  constructor(input: Partial<FlightInput> = {}) {
    const start = { ...default_flight_input(), ...input };

    this._air = moist_air(
      start.altitudeM,
      start.relativeHumidity,
      start.temperatureOffsetK,
    );

    this.values = {
      ...start,
      mach: 0,
      dynamicPressurePa: 0,
      temperatureK: SEA_LEVEL_K,
      pressurePa: SEA_LEVEL_PA,
      pressureRatio: 1,
      densityKgPerM3: 0,
      densityRatio: 1,
      soundMPerS: 0,
      dewPointK: 0,
      ram: 1,
    };

    this.derive();
  }

  /** The moist air it flies through, as the atmosphere gives it */
  get air(): Readonly<MoistAir> {
    return this._air;
  }

  /**
   * Write some of the flight and keep the rest. Cheap enough for every frame,
   * and for several writes a frame: the air is only worked out again when the
   * altitude or the day changes.
   * @param input What to change
   * @returns The flight
   */
  set(input: Partial<FlightInput>): this {
    const values = this.values as Record<keyof FlightInput, number>;
    let changed = false;

    for (const key in input) {
      const value = input[key as keyof FlightInput];

      if (value === undefined || values[key as keyof FlightInput] === value) {
        continue;
      }

      values[key as keyof FlightInput] = value;
      changed = true;
    }

    if (changed) {
      this.derive();
      this.notify();
    }

    return this;
  }

  /**
   * Hear every write.
   * @param listener Called after each one
   * @returns How to stop hearing them
   */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);

    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Work the flight out from how an object moved since the last call: the
   * airspeed and the angles from its velocity in its own frame, the load
   * factor from its acceleration and gravity, the rates from how it turned,
   * and the altitude from its height if `seaLevelY` is given.
   *
   * Call it once a frame. The first call, and one after a long gap, only
   * starts watching. What it cannot see, the throttle, the controls and the
   * day, keeps whatever was written.
   * @param object What flies: its world transform, in metres
   * @param delta_s How long since the last call
   * @param options Which way the object faces, sea level, and the wind
   * @returns The flight
   */
  track(
    object: Object3D,
    delta_s: number,
    options: FlightTrackOptions = {},
  ): this {
    object.updateWorldMatrix(true, false);
    object.matrixWorld.decompose(
      scratch_position,
      scratch_rotation,
      scratch_scale,
    );

    // Compared by value, so arrays written inline do not rebuild it
    const [fx, fy, fz] = options.forward ?? [0, 0, -1];
    const [ux, uy, uz] = options.up ?? [0, 1, 0];
    const held = this._frame_for;

    if (
      held[0] !== fx ||
      held[1] !== fy ||
      held[2] !== fz ||
      held[3] !== ux ||
      held[4] !== uy ||
      held[5] !== uz
    ) {
      this._frame.copy(canonical_frame(options)).setPosition(0, 0, 0);
      this._frame_inverse.copy(this._frame).transpose();
      held.set([fx, fy, fz, ux, uy, uz]);
    }

    if (!this._tracking || !(delta_s > 0) || delta_s > MAX_TRACK_DELTA_S) {
      this._tracking = true;
      this._last_position.copy(scratch_position);
      this._last_rotation.copy(scratch_rotation);
      this._velocity.set(0, 0, 0);
      this._last_velocity.set(0, 0, 0);
      this._acceleration.set(0, 0, 0);
      this._rates.set(0, 0, 0);

      return this;
    }

    // Through the air, eased so a frame's jitter does not show
    scratch_velocity
      .subVectors(scratch_position, this._last_position)
      .divideScalar(delta_s);

    if (options.wind) {
      scratch_velocity.x -= options.wind[0];
      scratch_velocity.y -= options.wind[1];
      scratch_velocity.z -= options.wind[2];
    }

    this._velocity.lerp(
      scratch_velocity,
      1 - Math.exp(-delta_s / VELOCITY_RESPONSE_S),
    );

    scratch_velocity
      .subVectors(this._velocity, this._last_velocity)
      .divideScalar(delta_s);

    this._acceleration.lerp(
      scratch_velocity,
      1 - Math.exp(-delta_s / ACCELERATION_RESPONSE_S),
    );

    this._last_velocity.copy(this._velocity);
    this._last_position.copy(scratch_position);

    // The airframe's axes in the world: x aft, y up, z out along the left
    // wing, as the canonical frame has them
    scratch_basis.makeRotationFromQuaternion(scratch_rotation);
    scratch_basis.multiply(this._frame);

    const e = scratch_basis.elements;
    const v = this._velocity;

    const forward = -(v.x * e[0] + v.y * e[1] + v.z * e[2]);
    const up = v.x * e[4] + v.y * e[5] + v.z * e[6];
    const left = v.x * e[8] + v.y * e[9] + v.z * e[10];

    const speed = v.length();

    // Gravity felt as an acceleration upward, plus the one the path makes
    const [gx, gy, gz] = options.worldUp ?? [0, 1, 0];
    const ax = this._acceleration.x + gx * G0;
    const ay = this._acceleration.y + gy * G0;
    const az = this._acceleration.z + gz * G0;

    // The turn since the last frame, in the object's own frame, then in the
    // airframe's
    scratch_turn.copy(this._last_rotation).invert().multiply(scratch_rotation);

    if (scratch_turn.w < 0) {
      scratch_turn.set(
        -scratch_turn.x,
        -scratch_turn.y,
        -scratch_turn.z,
        -scratch_turn.w,
      );
    }

    const angle = 2 * Math.acos(Math.min(scratch_turn.w, 1));
    const sin = Math.sqrt(Math.max(1 - scratch_turn.w * scratch_turn.w, 0));

    scratch_axis.set(0, 0, 0);

    if (sin > 1e-9) {
      scratch_axis
        .set(scratch_turn.x, scratch_turn.y, scratch_turn.z)
        .transformDirection(this._frame_inverse)
        .multiplyScalar(angle / delta_s);
    }

    this._rates.lerp(scratch_axis, 1 - Math.exp(-delta_s / RATE_RESPONSE_S));
    this._last_rotation.copy(scratch_rotation);

    const input: Partial<FlightInput> = {
      airspeedMPerS: speed,
      angleOfAttackRad: speed > 1e-3 ? Math.atan2(-up, forward) : 0,
      sideslipRad:
        speed > 1e-3 ? Math.asin(Math.min(Math.max(-left / speed, -1), 1)) : 0,
      loadFactor: (ax * e[4] + ay * e[5] + az * e[6]) / G0,

      // About aft, up and left: right wing down is a turn about forward, nose
      // up about right, nose right about down
      rollRateRadPerS: -this._rates.x,
      pitchRateRadPerS: -this._rates.z,
      yawRateRadPerS: -this._rates.y,
    };

    if (options.seaLevelY !== undefined) {
      input.altitudeM = scratch_position.y - options.seaLevelY;
    }

    return this.set(input);
  }

  /** Start tracking over: the next `track` only starts watching */
  resetTracking() {
    this._tracking = false;
  }

  /**
   * Work out what follows from the inputs: the air if the day or the altitude
   * changed, and the speeds.
   */
  private derive() {
    const values = this.values;

    if (
      values.altitudeM !== this._air_key[0] ||
      values.temperatureOffsetK !== this._air_key[1] ||
      values.relativeHumidity !== this._air_key[2]
    ) {
      this._air = moist_air(
        values.altitudeM,
        values.relativeHumidity,
        values.temperatureOffsetK,
      );

      this._air_key[0] = values.altitudeM;
      this._air_key[1] = values.temperatureOffsetK;
      this._air_key[2] = values.relativeHumidity;

      const air = this._air;

      values.temperatureK = air.temperatureK;
      values.pressurePa = air.pressurePa;
      values.pressureRatio = air.pressurePa / SEA_LEVEL_PA;
      values.densityKgPerM3 = air.densityKgPerM3;
      values.densityRatio = air.densityKgPerM3 / STANDARD_DENSITY;
      values.soundMPerS = air.soundMPerS;
      values.dewPointK = air.dewPointK;
    }

    const speed = Math.max(values.airspeedMPerS, 0);

    values.mach = speed / values.soundMPerS;
    values.dynamicPressurePa = 0.5 * values.densityKgPerM3 * speed * speed;
    values.ram = ram_pressure(values.mach);
  }

  private notify() {
    this.version++;

    for (const listener of this._listeners) {
      listener();
    }
  }
}
