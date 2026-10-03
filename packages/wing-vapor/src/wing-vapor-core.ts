import {
  BoxGeometry,
  type Camera,
  type DataTexture,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";
import { canonical_frame, capture_views, type CaptureOptions } from "./capture";
import { condensation_table } from "./condensation";
import { measure_airframe, type MeasuredAirframe } from "./measure";
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
  type VaporLook,
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
  // Its origin, in the object's frame: where the airframe's stations are
  // measured from
  position?: readonly [number, number, number];

  // Which way the aircraft flies, in the object's frame. By default -Z
  forward?: readonly [number, number, number];

  // Which way is up for it. By default +Y
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

  // Which phenomena to draw. Compiled in
  effects?: Partial<VaporEffects>;

  // What it follows: the aircraft's model, or any node of it. None: the
  // world's origin, or wherever `frame` puts it
  object?: Object3D | null;

  frame?: WingVaporFrame;

  // The wing as a table, from `capture_airframe`, in place of the airframe's
  // trapezoid
  shape?: WingShape | null;

  // The most iterations a pixel's march may take
  max_steps?: number;
};

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
  time_scale = 1;

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
  private _last_ms = -1;

  constructor(options: WingVaporOptions = {}) {
    this._airframe = { ...default_vapor_airframe(), ...options.airframe };
    this._flight = { ...default_vapor_flight(), ...options.flight };
    this._air = { ...default_vapor_air(), ...options.air };
    this._look = { ...default_vapor_look(), ...options.look };
    this._effects = { ...default_vapor_effects(), ...options.effects };

    this.object = options.object ?? null;

    this.uniforms = create_vapor_uniforms();
    this.uniforms.seed.value = (seeds++ * 7.31) % 100;
    this.uniforms.max_steps.value = options.max_steps ?? 160;

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

    this.set_frame(options.frame ?? {});
    this.write_look();
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
  update_flight(flight: Partial<VaporFlight>) {
    if (unchanged(this._flight, flight)) return;

    this._flight = { ...this._flight, ...flight };
    this._state = this.refresh();
  }

  /**
   * Change some of the day and keep the rest. Rewrites the condensation
   * table, a few hundred moist adiabats: fine every frame, but not free.
   * @param air The altitude, the temperature offset or the humidity
   */
  update_air(air: Partial<VaporAir>) {
    if (unchanged(this._air, air)) return;

    this._air = { ...this._air, ...air };
    this._state = this.refresh();
  }

  /**
   * Change some of the airframe and keep the rest.
   * @param airframe What to change
   */
  update_airframe(airframe: Partial<VaporAirframe>) {
    this._airframe = { ...this._airframe, ...airframe };
    this._shape = null;
    this._state = this.refresh();
  }

  /**
   * Draw the wing from a table rather than the airframe's trapezoid, or go
   * back to the trapezoid with null.
   * @param shape The wing, as `capture_airframe` measures it
   */
  set_shape(shape: WingShape | null) {
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

    this._airframe = { ...this._airframe, ...measured.airframe };
    this.set_shape(measured.shape);

    return measured;
  }

  /**
   * Change some of the look and keep the rest.
   * @param look What to change
   */
  update_look(look: Partial<VaporLook>) {
    if (unchanged(this._look, look)) return;

    this._look = { ...this._look, ...look };
    this.write_look();
    this._state = this.refresh();
  }

  /**
   * Change which phenomena are drawn. Rebuilds the material.
   * @param effects Which to draw, over every one on
   */
  set_effects(effects: Partial<VaporEffects>) {
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
  set_frame(frame: WingVaporFrame) {
    this._frame_options = frame;
    this._frame.copy(canonical_frame(frame));
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

    const state = vapor_state(
      this._airframe,
      this._flight,
      this._air,
      this._look,
      this._shape,
      this._history,
    );

    write_trail_texture(this._trail_texture, state.trails);

    if (rebuilt) {
      write_shape_texture(this._shape_texture, state.shape, state.path);
    }

    write_vapor_field(this.uniforms, state.field, vapor_constants(state.field));

    // Nothing that can fog: a box of no size, which draws nothing. The mesh
    // stays in the scene, so its frames still lay the trails' history
    if (state.visible) {
      this.uniforms.box_min.value.set(...state.bounds.min);
      this.uniforms.box_max.value.set(...state.bounds.max);
    } else {
      this.uniforms.box_min.value.set(0, 0, 0);
      this.uniforms.box_max.value.set(0, 0, 0);
    }

    // The table only changes with the day, and the humidity's spread
    const key = [
      this._air.altitude_m,
      this._air.temperature_offset_k,
      this._air.relative_humidity,
      this._look.humidity_spread,
    ].join();

    if (key !== this._table_key) {
      this._table_key = key;
      write_vapor_table(
        this._table,
        condensation_table(state.air, this._look.humidity_spread),
      );
    }

    return state;
  }

  private write_look() {
    const look = this._look;
    const u = this.uniforms;

    const [sr, sg, sb] = look.sun_color;
    const [kr, kg, kb] = look.sky_color;

    u.sun.value.set(
      sr * look.sun_intensity,
      sg * look.sun_intensity,
      sb * look.sun_intensity,
    );
    u.sky.value.set(
      kr * look.sky_intensity,
      kg * look.sky_intensity,
      kb * look.sky_intensity,
    );

    u.exposure.value = look.exposure;

    // A gram per cubic metre of droplets this size: 3 w / 2 ρ r
    u.extinction.value =
      (3 * 1e-3) / (2 * 1000 * Math.max(look.droplet_radius_m, 1e-8));

    u.anisotropy.value = Math.min(Math.max(look.anisotropy, -0.95), 0.95);
    u.eddy_m.value = Math.max(look.eddy_m, 1e-3);
    u.shutter_s.value = Math.max(look.shutter_s, 0);
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

    this.uniforms.sun_direction.value
      .fromArray(this._look.sun_direction)
      .transformDirection(scratch_inverse);

    // The clock, once a frame however many cameras draw it
    if (renderer.info.frame === this._frame_number) {
      return;
    }

    this._frame_number = renderer.info.frame;

    const now = performance.now();
    const delta_s =
      this._last_ms >= 0 ? ((now - this._last_ms) / 1000) * this.time_scale : 0;

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

    this._history.advance(
      delta_s,
      scratch_rotation,
      field.speed_m_s,
      field.cos_alpha,
      field.sin_alpha,
      field.tip_reach_m,
    );

    this._state = this.refresh();
  }
}
