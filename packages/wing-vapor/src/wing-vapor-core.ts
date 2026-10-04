import {
  BoxGeometry,
  Color,
  type Camera,
  type ColorRepresentation,
  type DataTexture,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";
import {
  canonical_frame,
  capture_views,
  type CaptureOptions,
  type Flight,
} from "@aeronautic/core";
import { condensation_table } from "./condensation";
import {
  capture_airframe_async,
  measure_airframe,
  type MeasuredAirframe,
} from "./measure";
import {
  default_vapor_air,
  default_vapor_airframe,
  default_vapor_effects,
  default_vapor_flight,
  default_vapor_look,
  type VaporAir,
  type VaporAirframe,
  type VaporEffects,
  type VaporFlight,
  resolve_vapor_quality,
  type VaporColor,
  type VaporLook,
  type VaporQuality,
  type VaporQualityName,
} from "./types";
import { vapor_constants, vapor_state, type VaporState } from "./vapor-field";
import {
  create_shape_texture,
  create_trail_texture,
  create_vapor_material,
  create_vapor_table,
  create_vapor_uniforms,
  write_shape_texture,
  write_trail_texture,
  write_vapor_field,
  write_vapor_table,
  type VaporUniforms,
} from "./vapor-material";
import { TrailHistory } from "./trails";
import { trapezoid_shape, type WingShape } from "./wing-shape";

// One aircraft's vapour, drawn as one mesh in the scene
//
// The mesh carries itself, as the afterburner's batch does: it reads the
// object it follows and the camera from its own onBeforeRender, which three
// calls just before it draws it. The physics is worked out whenever a dial
// changes, on the CPU, into a few dozen uniforms; nothing is worked out per
// frame but where the aircraft and the camera are

/**
 * Where the airframe's frame sits on the object it follows.
 */
export type WingVaporFrame = {
  /**
   * Its origin, in the object's frame: where the airframe's stations are
   * measured from
   */
  position?: readonly [number, number, number];

  /** Which way the aircraft flies, in the object's frame. By default -Z */
  forward?: readonly [number, number, number];

  /** Which way is up for it. By default +Y */
  up?: readonly [number, number, number];
};

/**
 * How one aircraft's vapour is set up. Every group over its defaults.
 */
export type WingVaporOptions = {
  airframe?: Partial<VaporAirframe>;
  flight?: Partial<VaporFlight>;
  air?: Partial<VaporAir>;
  look?: Partial<VaporLook>;

  /** Which phenomena to draw. Compiled in */
  effects?: Partial<VaporEffects>;

  /**
   * What it follows: the aircraft's model, or any node of it. None: the
   * world's origin, or wherever `frame` puts it
   */
  object?: Object3D | null;

  frame?: WingVaporFrame;

  /**
   * The wing as a table, from `capture_airframe`, in place of the airframe's
   * trapezoid
   */
  shape?: WingShape | null;

  /** What a frame may spend: a preset's name, or the fields. `high` by default */
  quality?: VaporQualityName | Partial<VaporQuality>;

  /**
   * A shared flight to read the airspeed, the angles, the altitude and the
   * day from, every frame. What it gives wins over `flight` and `air`
   */
  source?: Flight | null;
};

// The condensation table is rebuilt for every change of the air, so a shared
// flight's altitude is read to the nearest this many metres
const SOURCE_ALTITUDE_STEP_M = 10;

// The longest a frame may advance the noise's clock, so a tab coming back
// from the background does not jump the patches a kilometre downstream
const MAX_DELTA_S = 0.1;

const scratch_matrix = new Matrix4();
const scratch_inverse = new Matrix4();
const scratch_position = new Vector3();
const scratch_rotation = new Quaternion();
const scratch_scale = new Vector3();
const scratch_vector = new Vector3();
const unit_scale = new Vector3(1, 1, 1);

let seeds = 0;

// How much of the screen the vapour's box may cover before its steps
// coarsen; how coarse they may get; and how small it may get on screen, as a
// share of its height, before its patches are dropped
const STEP_AREA = 0.15;
const MAX_STEP_SCALE = 3;
const DETAIL_HEIGHT = 0.06;

// How long the measured roll rate takes to follow the attitude, so a frame's
// jitter does not flick the loading from side to side
const ROLL_RESPONSE_S = 0.15;

const scratch_turn = new Quaternion();
const scratch_project = new Matrix4();
const scratch_view = new Matrix4();
const scratch_corner = new Vector3();

/**
 * Whether a change would change nothing.
 * @param current What there is
 * @param change What is asked for
 * @returns Whether every field asked for already has that value
 */
const unchanged = <T extends object>(current: T, change: Partial<T>) =>
  (Object.keys(change) as (keyof T)[]).every(
    (key) => current[key] === change[key],
  );

/**
 * One aircraft's wing vapour: tip and leading-edge vortices, the sheet over
 * the wing, and the vapour cone.
 *
 * Add `vapor.mesh` to the scene, or let the React component do it. It needs
 * three's `WebGPURenderer` (either backend) and reads the scene's depth, so
 * the vapour stops at the wing it sits on.
 */
export class WingVapor {
  /** The mesh to put in the scene */
  readonly mesh: Mesh<BoxGeometry, MeshBasicNodeMaterial>;

  /** The uniforms the material is driven by */
  readonly uniforms: VaporUniforms;

  /** What it follows */
  object: Object3D | null;

  /** How fast the moisture's clock runs, one being real time */
  timeScale = 1;

  /**
   * A shared flight, read every frame: its airspeed, angle of attack and
   * sideslip win over `flight`, and its altitude and day over `air`. null
   * flies only what is written
   */
  source: Flight | null;

  private _airframe: VaporAirframe;
  private _flight: VaporFlight;
  private _air: VaporAir;
  private _look: VaporLook;
  private _effects: VaporEffects;

  private readonly _frame = new Matrix4();
  private _frame_options: WingVaporFrame = {};
  private readonly _table: DataTexture;
  private readonly _shape_texture: DataTexture;
  private readonly _trail_texture: DataTexture;

  // The aircraft's path through the air, for the trails to follow
  private readonly _history = new TrailHistory();
  private _state: VaporState;
  private _table_key = "";

  // The wing given as a table, if any, and the one being drawn
  private _captured: WingShape | null;
  private _shape: WingShape | null = null;

  private _frame_number = -1;

  // The source last read, and at which of its writes
  private _read_from: Flight | null = null;
  private _read_version = -1;

  // The attitude last frame, and the roll rate measured from it
  private readonly _attitude = new Quaternion();
  private _attitude_set = false;
  private _roll_rate = 0;
  private _last_ms = -1;

  constructor(options: WingVaporOptions = {}) {
    this._airframe = { ...default_vapor_airframe(), ...options.airframe };
    this._flight = { ...default_vapor_flight(), ...options.flight };
    this._air = { ...default_vapor_air(), ...options.air };
    this._look = { ...default_vapor_look(), ...options.look };
    this._effects = { ...default_vapor_effects(), ...options.effects };

    this.object = options.object ?? null;
    this.source = options.source ?? null;

    this.uniforms = create_vapor_uniforms();
    this.uniforms.seed.value = (seeds++ * 7.31) % 100;
    this.setQuality(options.quality);

    this._table = create_vapor_table();
    this._shape_texture = create_shape_texture();
    this._trail_texture = create_trail_texture();
    this._captured = options.shape ?? null;

    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      create_vapor_material({
        uniforms: this.uniforms,
        table: this._table,
        shape: this._shape_texture,
        trails: this._trail_texture,
        effects: this._effects,
      }),
    );

    mesh.name = "WingVapor";
    mesh.frustumCulled = false;

    // Placed in world space by hand, whatever it is parented to
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;

    // Drawn with the transparent things, after the opaque scene it reads
    mesh.renderOrder = 1;

    mesh.onBeforeRender = (renderer, _scene, camera) =>
      this.update(renderer as unknown as { info: { frame: number } }, camera);

    this.mesh = mesh;

    this.setFrame(options.frame ?? {});
    this.writeLook();
    this._state = this.refresh();
  }

  /** Everything the vapour is drawn from: the air, the lift, the field */
  get state(): Readonly<VaporState> {
    return this._state;
  }

  get airframe(): Readonly<VaporAirframe> {
    return this._airframe;
  }

  get flight(): Readonly<VaporFlight> {
    return this._flight;
  }

  get air(): Readonly<VaporAir> {
    return this._air;
  }

  get look(): Readonly<VaporLook> {
    return this._look;
  }

  get effects(): Readonly<VaporEffects> {
    return this._effects;
  }

  /**
   * Change some of the flight and keep the rest. Cheap enough for every frame.
   * @param flight The airspeed, the angle of attack, or both
   */
  updateFlight(flight: Partial<VaporFlight>) {
    if (unchanged(this._flight, flight)) return;

    this._flight = { ...this._flight, ...flight };
    this._state = this.refresh();
  }

  /**
   * Change some of the day and keep the rest. Rewrites the condensation
   * table, a few hundred moist adiabats: fine every frame, but not free.
   * @param air The altitude, the temperature offset or the humidity
   */
  updateAir(air: Partial<VaporAir>) {
    if (unchanged(this._air, air)) return;

    this._air = { ...this._air, ...air };
    this._state = this.refresh();
  }

  /**
   * Change some of the airframe and keep the rest.
   * @param airframe What to change
   */
  updateAirframe(airframe: Partial<VaporAirframe>) {
    this._airframe = { ...this._airframe, ...airframe };
    this._shape = null;
    this._state = this.refresh();
  }

  /**
   * Draw the wing from a table rather than the airframe's trapezoid, or go
   * back to the trapezoid with null.
   * @param shape The wing, as `capture_airframe` measures it
   */
  setShape(shape: WingShape | null) {
    this._captured = shape;
    this._shape = null;
    this._state = this.refresh();
  }

  /** The wing being drawn, as a table */
  get shape(): Readonly<WingShape> {
    return this._state.shape;
  }

  /**
   * Measure a model from six depth views and fly that: its wing station by
   * station, and its planform and body fitted into the airframe. What cannot
   * be seen, the mass and how sharp the leading edge is, is kept.
   *
   * Tens of milliseconds for a few hundred thousand triangles. Hide the
   * landing gear and the stores first, or leave them out with `filter`.
   * @param object The model
   * @param options Which meshes to keep and the resolution; the frame is
   *   this vapour's own unless given
   * @returns What was measured
   */
  capture(object: Object3D, options: CaptureOptions = {}): MeasuredAirframe {
    const measured = measure_airframe(
      capture_views(object, { ...this._frame_options, ...options }),
    );

    this.applyCapture(measured);

    return measured;
  }

  /**
   * `capture`, a few milliseconds a frame, so a big model doesn't drop one.
   * Until it is done the vapour flies the shape it had. Nothing is applied
   * if the signal aborts first.
   * @param object The model
   * @param options As for `capture`, plus how long each slice may run and a
   *   signal to give up on
   * @returns What was measured
   */
  async captureAsync(
    object: Object3D,
    options: CaptureOptions & { budgetMs?: number; signal?: AbortSignal } = {},
  ): Promise<MeasuredAirframe> {
    const measured = await capture_airframe_async(object, {
      ...this._frame_options,
      ...options,
    });

    options.signal?.throwIfAborted();
    this.applyCapture(measured);

    return measured;
  }

  /**
   * Fly a measured airframe: from a capture, or baked ahead of time and read
   * back with `deserialize_capture`.
   * @param measured The fitted dials and the wing's table
   */
  applyCapture(measured: MeasuredAirframe) {
    this._airframe = { ...this._airframe, ...measured.airframe };
    this.setShape(measured.shape);
  }

  /**
   * Change some of the look and keep the rest.
   * @param look What to change
   */
  updateLook(look: Partial<VaporLook>) {
    if (unchanged(this._look, look)) return;

    this._look = { ...this._look, ...look };
    this.writeLook();
    this._state = this.refresh();
  }

  /**
   * Change what a frame may spend. Live, nothing rebuilds.
   * @param quality A preset's name, or the fields, over `high`
   */
  setQuality(quality?: VaporQualityName | Partial<VaporQuality>) {
    this.uniforms.maxSteps.value = resolve_vapor_quality(quality).maxSteps;
  }

  /**
   * Change which phenomena are drawn. Rebuilds the material.
   * @param effects Which to draw, over every one on
   */
  setEffects(effects: Partial<VaporEffects>) {
    const next = { ...default_vapor_effects(), ...effects };

    if (
      (Object.keys(next) as (keyof VaporEffects)[]).every(
        (key) => next[key] === this._effects[key],
      )
    ) {
      return;
    }

    this._effects = next;

    const previous = this.mesh.material;

    this.mesh.material = create_vapor_material({
      uniforms: this.uniforms,
      table: this._table,
      shape: this._shape_texture,
      trails: this._trail_texture,
      effects: next,
    });

    previous.dispose();
  }

  /**
   * Move the airframe's frame on what it follows.
   * @param frame Its origin, and which ways are forward and up
   */
  setFrame(frame: WingVaporFrame) {
    this._frame_options = frame;
    this._frame.copy(canonical_frame(frame));
  }

  /** The airframe's frame on what it follows, as last set */
  get frameOptions(): Readonly<WingVaporFrame> {
    return this._frame_options;
  }

  /** Free the GPU resources. It cannot be used afterwards */
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this._table.dispose();
    this._shape_texture.dispose();
    this._trail_texture.dispose();
  }

  /**
   * Work the physics out again, and hand it to the shader.
   * @returns The state
   */
  private refresh(): VaporState {
    // The wing's table only changes with the airframe or a capture, and its
    // lattice is the one thing here that is not free
    const rebuilt = this._shape === null;

    this._shape ??= this._captured ?? trapezoid_shape(this._airframe);

    // A roll the flight does not give is the one the attitude shows
    const flight =
      this._flight.rollRateRadPerS === undefined
        ? { ...this._flight, roll_rate_rad_s: this._roll_rate }
        : this._flight;

    const state = vapor_state(
      this._airframe,
      flight,
      this._air,
      this._look,
      this._shape,
      this._history,
    );

    write_trail_texture(this._trail_texture, state.trails, state.secondTrails);

    if (rebuilt) {
      write_shape_texture(this._shape_texture, state.shape, state.path);
    }

    write_vapor_field(this.uniforms, state.field, vapor_constants(state.field));

    // Nothing that can fog: a box of no size, which draws nothing. The mesh
    // stays in the scene, so its frames still lay the trails' history
    if (state.visible) {
      this.uniforms.boxMin.value.set(...state.bounds.min);
      this.uniforms.boxMax.value.set(...state.bounds.max);
    } else {
      this.uniforms.boxMin.value.set(0, 0, 0);
      this.uniforms.boxMax.value.set(0, 0, 0);
    }

    // The table only changes with the day, and the humidity's spread
    const key = [
      this._air.altitudeM,
      this._air.temperatureOffsetK,
      this._air.relativeHumidity,
      this._look.humiditySpread,
    ].join();

    if (key !== this._table_key) {
      this._table_key = key;
      write_vapor_table(
        this._table,
        condensation_table(state.air, this._look.humiditySpread),
      );
    }

    return state;
  }

  private writeLook() {
    const look = this._look;
    const u = this.uniforms;

    const [sr, sg, sb] = linear_rgb(look.sunColor);
    const [kr, kg, kb] = linear_rgb(look.skyColor);

    u.sun.value.set(
      sr * look.sunIntensity,
      sg * look.sunIntensity,
      sb * look.sunIntensity,
    );
    u.sky.value.set(
      kr * look.skyIntensity,
      kg * look.skyIntensity,
      kb * look.skyIntensity,
    );

    u.exposure.value = look.exposure;

    // A gram per cubic metre of droplets this size: 3 w / 2 ρ r
    u.extinction.value =
      (3 * 1e-3) / (2 * 1000 * Math.max(look.dropletRadiusM, 1e-8));

    u.anisotropy.value = Math.min(Math.max(look.anisotropy, -0.95), 0.95);
    u.eddyM.value = Math.max(look.eddyM, 1e-3);
    u.shutterS.value = Math.max(look.shutterS, 0);
  }

  /**
   * Share the march out by how much of the screen the vapour covers, for the
   * camera about to draw it.
   *
   * A pixel's cost is its steps, and a near view has many more pixels in it:
   * past `STEP_AREA` of the screen the steps coarsen as the square root of
   * the area, so a frame costs about the same however close the camera comes,
   * and the features a step resolves are many pixels across by then anyway.
   * Smaller than `DETAIL_HEIGHT` of the screen, the moisture's patches are
   * finer than a pixel, and are dropped.
   * @param camera The camera
   */
  private budget(camera: Camera) {
    const min = this.uniforms.boxMin.value;
    const max = this.uniforms.boxMax.value;

    // The box's eight corners on screen, as the rectangle round them
    scratch_project.multiplyMatrices(
      camera.projectionMatrix,
      scratch_view.multiplyMatrices(
        camera.matrixWorldInverse,
        this.mesh.matrixWorld,
      ),
    );

    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    let behind = false;

    for (let corner = 0; corner < 8; corner++) {
      scratch_corner
        .set(
          corner & 1 ? max.x : min.x,
          corner & 2 ? max.y : min.y,
          corner & 4 ? max.z : min.z,
        )
        .applyMatrix4(scratch_project);

      // applyMatrix4 divides by w; a corner behind the camera has none
      const w =
        scratch_project.elements[3] * (corner & 1 ? max.x : min.x) +
        scratch_project.elements[7] * (corner & 2 ? max.y : min.y) +
        scratch_project.elements[11] * (corner & 4 ? max.z : min.z) +
        scratch_project.elements[15];

      if (w <= 0) {
        behind = true;
        break;
      }

      left = Math.min(left, scratch_corner.x);
      right = Math.max(right, scratch_corner.x);
      bottom = Math.min(bottom, scratch_corner.y);
      top = Math.max(top, scratch_corner.y);
    }

    // A share of the screen, clipped to it: all of it when the camera is in
    // or beside the box
    const width = behind
      ? 2
      : Math.max(Math.min(right, 1) - Math.max(left, -1), 0);
    const height = behind
      ? 2
      : Math.max(Math.min(top, 1) - Math.max(bottom, -1), 0);

    const covered = (width * height) / 4;

    this.uniforms.stepScale.value = Math.min(
      Math.max(Math.sqrt(covered / STEP_AREA), 1),
      MAX_STEP_SCALE,
    );
    this.uniforms.detail.value = height / 2 > DETAIL_HEIGHT ? 1 : 0;
  }

  /**
   * How fast the aircraft rolls, from how its attitude turned since the last
   * frame, about the flight path's own axis, eased over `ROLL_RESPONSE_S`.
   * A flight that gives its own roll rate keeps it.
   * @param attitude Its attitude now
   * @param delta_s How long since the last frame
   */
  private measureRoll(attitude: Quaternion, delta_s: number) {
    if (this._attitude_set && delta_s > 1e-4 && delta_s < 1) {
      // The turn since the last frame, in the aircraft's own frame then
      const turn = scratch_turn
        .copy(this._attitude)
        .invert()
        .multiply(attitude);

      if (turn.w < 0) {
        turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
      }

      // About the canonical x, aft: positive puts the +z wing down
      const rate = (2 * Math.atan2(turn.x, turn.w)) / delta_s;
      const follow = 1 - Math.exp(-delta_s / ROLL_RESPONSE_S);

      this._roll_rate += (rate - this._roll_rate) * follow;
    }

    this._attitude.copy(attitude);
    this._attitude_set = true;
  }

  /**
   * Take the flight and the day from the shared flight, if there is one and
   * it changed. Written in place: the refresh at the end of the frame picks
   * it up, and nothing is allocated.
   */
  private readSource() {
    const source = this.source;

    if (
      !source ||
      (source === this._read_from && source.version === this._read_version)
    ) {
      return;
    }

    this._read_from = source;
    this._read_version = source.version;

    const values = source.values;
    const flight = this._flight;
    const air = this._air;

    flight.airspeedMPerS = values.airspeedMPerS;
    flight.angleOfAttackRad = values.angleOfAttackRad;

    // The flight's sideslip is from the right; the vapour's from +z, the left
    flight.sideslipRad = -values.sideslipRad;

    air.altitudeM =
      Math.round(values.altitudeM / SOURCE_ALTITUDE_STEP_M) *
      SOURCE_ALTITUDE_STEP_M;
    air.temperatureOffsetK = values.temperatureOffsetK;
    air.relativeHumidity = values.relativeHumidity;
  }

  /**
   * Follow the aircraft and the camera, just before the mesh is drawn.
   * @param renderer The renderer drawing it
   * @param camera The camera it is drawn from
   */
  private update(renderer: { info: { frame: number } }, camera: Camera) {
    // Rigid and in metres: a scaled model scales where the frame sits, not
    // the aircraft's size, which the airframe gives
    const base = this.object?.matrixWorld;

    if (base) {
      base.decompose(scratch_position, scratch_rotation, scratch_scale);

      const origin = scratch_vector
        .setFromMatrixPosition(this._frame)
        .applyMatrix4(base);

      scratch_matrix.compose(origin, scratch_rotation, unit_scale);
      scratch_inverse.copy(this._frame).setPosition(0, 0, 0);
      this.mesh.matrixWorld.multiplyMatrices(scratch_matrix, scratch_inverse);
    } else {
      this.mesh.matrixWorld.copy(this._frame);
    }

    // The camera, and the sun, in the airframe's frame
    scratch_inverse.copy(this.mesh.matrixWorld).invert();

    this.uniforms.camera.value
      .setFromMatrixPosition(camera.matrixWorld)
      .applyMatrix4(scratch_inverse);

    this.uniforms.sunDirection.value
      .fromArray(this._look.sunDirection)
      .transformDirection(scratch_inverse);

    this.budget(camera);

    // The clock, once a frame however many cameras draw it
    if (renderer.info.frame === this._frame_number) {
      return;
    }

    this._frame_number = renderer.info.frame;

    this.readSource();

    const now = performance.now();
    const delta_s =
      this._last_ms >= 0 ? ((now - this._last_ms) / 1000) * this.timeScale : 0;

    this._last_ms = now;
    this.uniforms.time.value += Math.min(MAX_DELTA_S, delta_s);

    // One more frame of flight through the air, and the trails laid back
    // along it, in the frame the aircraft has now
    this.mesh.matrixWorld.decompose(
      scratch_position,
      scratch_rotation,
      scratch_scale,
    );

    const field = this._state.field;

    this.measureRoll(scratch_rotation, delta_s);

    this._history.advance(
      delta_s,
      scratch_rotation,
      field.speedMPerS,
      field.cosAlpha,
      field.sinAlpha,
      Math.max(field.tipReachM, field.secondReachM),
      field.flowZ,
    );

    this._state = this.refresh();
  }
}

const scratch_color = new Color();

/**
 * A look's colour as linear RGB.
 * @param color Three numbers, or anything three's `Color` takes
 * @returns The three
 */
const linear_rgb = (color: VaporColor): readonly [number, number, number] =>
  Array.isArray(color)
    ? (color as readonly [number, number, number])
    : (scratch_color.set(color as ColorRepresentation).toArray() as [
        number,
        number,
        number,
      ]);
