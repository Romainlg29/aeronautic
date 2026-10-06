import {
  type Camera,
  DynamicDrawUsage,
  Euler,
  Frustum,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";
import {
  write_scene_fog,
  type Flight,
  type FlightValues,
} from "@aeronautic/core";
import {
  AFTERBURNER_ATTRIBUTES,
  create_afterburner_material,
  create_afterburner_uniforms,
  write_afterburner_profile,
  type AfterburnerBackdrop,
  type AfterburnerHooks,
  type AfterburnerUniforms,
} from "./afterburner-material";
import { clamp_nozzle_squareness, nozzle_outline_fit } from "./nozzle-outline";
import { anchor_adrift } from "./plume-anchor";
import { build_plume_hull } from "./plume-hull";
import {
  AFTERBURNER_MAX_THROTTLE,
  clamp_throttle,
  jet_state,
  plume_lod,
  PLUME_LOD_FAR,
  PLUME_LOD_MID,
  PLUME_LOD_NEAR,
} from "./plume-profile";
import {
  resolve_afterburner_params,
  resolve_afterburner_profile,
  resolve_afterburner_quality,
  type AfterburnerParamsInput,
  type AfterburnerPreset,
  type AfterburnerPresetName,
  type AfterburnerQualityInput,
} from "./presets";
import type {
  AfterburnerParams,
  AfterburnerProfile,
  AfterburnerQuality,
} from "./types";

// Every plume in one batch, drawn as one instanced mesh in the scene
//
// The mesh carries itself: it reads its nozzles' world matrices and advances
// its clock from its own onBeforeRender, which three calls just before it
// uploads the instance buffers. So nothing has to be called every frame, and
// nothing written there is a frame late

const HULL_SIDES = 10;

// One nozzle's instance, as the material reads it
//
// Static: everything a moving throttle cannot change, one interleaved buffer
// written when a nozzle is added or retuned, and never otherwise
const STATIC_STRIDE = 28;

const SHAPE = 0;
const THERMO = 4;
const OPTICS = 8;
const BAND = 12;
const MOTION = 16;
const OUTLINE = 20;
const OUTLINE_FIT = 24;

// Dynamic: where the nozzle is, which way it points, and how hard it runs
const DYNAMIC_STRIDE = 8;

const PLACE = 0;
const ROTATION = 4;

const DEFAULT_CAPACITY = 64;

// The longest a frame may advance the flame, so a tab coming back from the
// background does not jump the plume a minute downstream
const MAX_DELTA_S = 0.1;

// How long a plume takes to follow its throttle, about as long as a burner
// takes to light
const DEFAULT_RESPONSE_S = 0.25;

// Close enough to the throttle asked for to stop easing
const RESPONSE_SETTLED = 1e-4;

// How much nearer, as a share, a plume must be than the one drawn after it
// before the two are swapped
const SORT_TOLERANCE = 0.02;

/**
 * Where a nozzle is: following an object, or held at a fixed matrix.
 */
/**
 * Where a nozzle sits on what it follows, in that object's own frame.
 */
export type AfterburnerOffset = {
  /** Where the nozzle's exit is */
  position?: Vector3Like | readonly [number, number, number];

  /** How it is turned: the plume streams along the turned +Z */
  rotation?:
    | Euler
    | Quaternion
    | readonly [number, number, number]
    | readonly [number, number, number, number];

  /**
   * Or which way the plume streams, which is usually what is known. It wins
   * over `rotation`
   */
  direction?: Vector3Like | readonly [number, number, number];
};

type Vector3Like = { x: number; y: number; z: number };

export type AfterburnerNozzleOptions = {
  /**
   * The plume leaves this object's origin along its local +Z, and follows it:
   * any mesh, group or bone, wherever it is in the scene
   */
  object?: Object3D;

  /** Or a world matrix, for a nozzle with no object of its own */
  matrix?: Matrix4;

  /** Where on the object (or on `matrix`) the nozzle sits. None: its origin */
  offset?: AfterburnerOffset;

  params?: AfterburnerParamsInput;

  /** Which look to start from, under `params`. Defaults to the batch's */
  preset?: AfterburnerPresetName | AfterburnerPreset;

  /** How hard the engine runs: 0 to 1 dry, on to 1.1 at full reheat */
  throttle?: number;

  /**
   * Read the throttle from the batch's source with this, each time the
   * source changes, rather than run at what is written to it
   */
  throttleFrom?: ((values: Readonly<FlightValues>) => number) | null;
};

/**
 * One nozzle in a batch.
 */
export class AfterburnerNozzle {
  /** @internal */
  _slot = -1;

  /** @internal */
  _batch: AfterburnerBatch | null;

  /** @internal */
  _params: AfterburnerParams;

  /** @internal What it was last tuned with, for `updateParams` to merge over */
  _input: AfterburnerParamsInput | undefined;

  /** @internal The preset that was resolved under it */
  _preset: AfterburnerPresetName | AfterburnerPreset | undefined;

  /** @internal What was asked for */
  _throttle: number;

  /** @internal What is drawn, easing toward what was asked for */
  _drawn: number;

  /** @internal */
  readonly _seed: number;

  /** @internal The world matrix last written, to see when it moves */
  readonly _written = new Float64Array(16);

  /** @internal The world scale the static instance was written at */
  _scale = 1;

  /** @internal How far its plume is from the camera, for the draw order */
  _depth = 0;

  /** @internal The world matrix turned into the plume's own frame, +X down it */
  readonly _drawn_frame = new Float64Array(16);

  /** The object the plume follows, if any */
  object: Object3D | null;

  /**
   * Read the throttle from the batch's `source` with this, each time the
   * source changes, rather than run at what is written to `throttle`: the
   * flight's own throttle, or one engine's
   */
  throttleFrom: ((values: Readonly<FlightValues>) => number) | null;

  /** The world matrix, when there is no object */
  readonly matrix = new Matrix4();

  /**
   * Where the nozzle sits in the frame of what it follows. Write it directly
   * or through `setOffset`; either is picked up the next frame
   */
  readonly position = new Vector3();

  /** How it is turned in that frame; the plume streams along the turned +Z */
  readonly quaternion = new Quaternion();

  /** @internal The world matrix with the offset applied */
  readonly _world = new Matrix4();

  constructor(
    batch: AfterburnerBatch,
    options: AfterburnerNozzleOptions,
    seed: number,
  ) {
    this._batch = batch;
    this._seed = seed;
    this.object = options.object ?? null;
    this.throttleFrom = options.throttleFrom ?? null;
    this._throttle = clamp_throttle(
      options.throttle ?? AFTERBURNER_MAX_THROTTLE,
    );
    this._drawn = this._throttle;
    this._input = options.params;
    this._preset = options.preset;
    this._params = resolve_afterburner_params(
      options.params,
      options.preset ?? batch.preset,
    );

    if (options.matrix) {
      this.matrix.copy(options.matrix);
    }

    if (options.offset) {
      this.setOffset(options.offset);
    }

    // NaN, so the first frame always writes it
    this._written.fill(Number.NaN);
  }

  /**
   * How hard the engine is asked to run, 0 to 1.1. Cheap to write every frame.
   * The plume eases toward it over the batch's `responseS`
   */
  get throttle(): number {
    return this._throttle;
  }

  set throttle(value: number) {
    const throttle = clamp_throttle(value);

    if (throttle === this._throttle) {
      return;
    }

    this._throttle = throttle;

    if (!this._batch || this._batch.responseS <= 0) {
      this._drawn = throttle;
      this._batch?._write_throttle(this);
    }
  }

  /** The throttle the plume is drawn at, on its way to `throttle` */
  get drawnThrottle(): number {
    return this._drawn;
  }

  /** The params this nozzle is drawn with. Read-only: use `setParams` */
  get params(): Readonly<AfterburnerParams> {
    return this._params;
  }

  /**
   * Retune this nozzle.
   * @param params What to change, over the preset and defaults
   * @param preset Which look to start from
   */
  setParams(
    params?: AfterburnerParamsInput,
    preset?: AfterburnerPresetName | AfterburnerPreset,
  ) {
    this._input = params;
    this._preset = preset;
    this._params = resolve_afterburner_params(
      params,
      preset ?? this._batch?.preset,
    );
    this._batch?._write_static(this);
  }

  /**
   * Change some params and keep the rest, such as the nozzle opening up with
   * the throttle or the soot it makes. Re-resolves the nozzle, so it costs more than `throttle`, but a
   * few nozzles a frame is nothing.
   * @param params What to change, over what it was last tuned with
   */
  updateParams(params: AfterburnerParamsInput) {
    this.setParams({ ...this._input, ...params }, this._preset);
  }

  /**
   * Follow an object, such as a mesh, group or bone, from wherever it is in
   * the scene. It need not be in the batch's scene graph's branch, only drawn.
   * @param object What to follow. null stops following, and the nozzle stays
   *   where it is in the world
   * @param offset Where on it the nozzle sits. Left out, the offset is kept
   * @returns The nozzle
   */
  attach(object: Object3D | null, offset?: AfterburnerOffset): this {
    if (object === null && this.object !== null) {
      // Hold the world pose it had, with the offset folded in
      this.matrix.copy(this.worldMatrix(scratch_matrix));
      this.position.set(0, 0, 0);
      this.quaternion.identity();
    }

    this.object = object;

    if (offset) {
      this.setOffset(offset);
    }

    return this;
  }

  /**
   * Move the nozzle on what it follows. Only the fields given change.
   * @param offset Where it sits, and how it is turned
   * @returns The nozzle
   */
  setOffset(offset: AfterburnerOffset): this {
    write_offset(this, offset);

    return this;
  }

  /**
   * Point the plume, in the frame of what it follows.
   * @param direction Which way the exhaust streams; need not be unit length
   * @returns The nozzle
   */
  setDirection(
    direction: Vector3Like | readonly [number, number, number],
  ): this {
    write_offset(this, { direction });

    return this;
  }

  /**
   * The world matrix the plume is drawn at: what it follows, then its offset.
   * Read off the object as the renderer last left it.
   * @param target Where to write it
   * @returns target
   */
  worldMatrix(target: Matrix4 = new Matrix4()): Matrix4 {
    return target.fromArray(world_elements(this));
  }

  /** Take the plume out of its batch */
  remove() {
    this._batch?.remove(this);
  }
}

/**
 * What one batch did in its last frame, by tier.
 */
export type AfterburnerStats = {
  nozzles: number;
  near: number;
  mid: number;
  far: number;
  culled: number;
};

/**
 * How a batch is set up.
 */
export type AfterburnerBatchOptions = {
  /** Which look nozzles start from, and the profile it brings */
  preset?: AfterburnerPresetName | AfterburnerPreset;

  /** The plume shape every nozzle shares, over the preset's. Applies live */
  profile?: Partial<AfterburnerProfile>;

  /** What a frame may spend. Only the octave count rebuilds the material */
  quality?: AfterburnerQualityInput;

  /** Whether to bend what is behind the plumes. Rebuilds the material */
  haze?: boolean;

  /** TSL to change what the plume is made of. Rebuilds the material */
  hooks?: AfterburnerHooks;

  /** How many nozzles to make room for up front. It grows past this */
  capacity?: number;

  /** How long, in seconds, a plume takes to follow its throttle. Zero is at once */
  responseS?: number;

  /**
   * A shared flight: its altitude, airspeed and day win over the profile's,
   * and nozzles with a `throttleFrom` read their throttle from it
   */
  source?: Flight | null;

  /**
   * The opaque scene drawn in a pass of its own, for plumes drawn in another,
   * as `afterburner_pass` sets up. Fixed for the batch's life
   */
  backdrop?: AfterburnerBackdrop;
};

const scratch_position = new Vector3();
const scratch_rotation = new Quaternion();
const scratch_scale = new Vector3();
const scratch_matrix = new Matrix4();
const scratch_frustum = new Frustum();
const scratch_offset = new Matrix4();
const scratch_euler = new Euler();
const scratch_direction = new Vector3();
const unit_scale = new Vector3(1, 1, 1);

// The plume streams along a nozzle's local +Z, aft of an aircraft that flies
// along its -Z. The shader runs it down its own +X: `drawn_elements` turns one
// into the other
const PLUME_AXIS = new Vector3(0, 0, 1);

/**
 * Any number of afterburner plumes, drawn as one instanced mesh.
 *
 * Add `batch.mesh` to the scene and add nozzles to the batch. It renders with
 * three's `WebGPURenderer` (either backend), reading the scene's depth so the
 * flame stops at whatever is in front of it.
 */
export class AfterburnerBatch {
  /**
   * The mesh to put in the scene. Its `userData.afterburnerBatch` is this, for finding
   * every one in a scene
   */
  readonly mesh: Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial>;

  /** The uniforms every variant of the material shares */
  readonly uniforms: AfterburnerUniforms;

  /** How fast the flame's clock runs, one being real time */
  timeScale = 1;

  /**
   * How long, in seconds, a plume takes to follow its throttle: the time
   * constant it eases in by, so a burner lights over a few tenths of a second
   * as a real one does, rather than in a frame. Zero follows at once
   */
  responseS = DEFAULT_RESPONSE_S;

  /**
   * A shared flight, read every frame: its altitude, airspeed and day win
   * over the profile's, and nozzles with a `throttleFrom` read theirs from it
   * throttle. null leaves the batch to what is written to it
   */
  source: Flight | null;

  /** Plumes shorter than this share of the screen height are not drawn */
  minScreenFraction = 0.001;

  /** Past this, in metres, the eddies are dropped */
  detailDistanceM = 900;

  /** Past this, a plume is one sample */
  cheapDistanceM = 3000;

  /** Which look nozzles start from */
  readonly preset: AfterburnerPresetName | AfterburnerPreset | undefined;

  private _profile: AfterburnerProfile;
  private _quality: AfterburnerQuality;
  private _haze: boolean;
  private _hooks: AfterburnerHooks | undefined;
  private readonly _backdrop: AfterburnerBackdrop | undefined;

  private _materials = new Map<boolean, MeshBasicNodeMaterial>();

  private _nozzles: AfterburnerNozzle[] = [];
  private _capacity = 0;
  private _added = 0;

  private _static!: InstancedInterleavedBuffer;
  private _dynamic!: InstancedInterleavedBuffer;

  private _static_from = Infinity;
  private _static_to = 0;
  private _dynamic_from = Infinity;
  private _dynamic_to = 0;

  private _anchor = new Vector3();
  private _anchored = false;

  private _frame = -1;
  private _last_ms = -1;

  // The source last read, and at which of its writes
  private _read_from: Flight | null = null;
  private _read_version = -1;

  private _camera: Camera | null = null;

  private _stats: AfterburnerStats = {
    nozzles: 0,
    near: 0,
    mid: 0,
    far: 0,
    culled: 0,
  };

  constructor(options: AfterburnerBatchOptions = {}) {
    this.preset = options.preset;
    this.responseS = options.responseS ?? DEFAULT_RESPONSE_S;
    this.source = options.source ?? null;
    this._profile = resolve_afterburner_profile(
      options.profile,
      options.preset,
    );
    this._quality = resolve_afterburner_quality(options.quality);
    this._haze = options.haze ?? true;
    this._hooks = options.hooks;
    this._backdrop = options.backdrop;

    this.uniforms = create_afterburner_uniforms(this._profile);
    this.writeQuality();

    const geometry = new InstancedBufferGeometry();
    const hull = build_plume_hull(HULL_SIDES);

    geometry.setAttribute("position", hull.getAttribute("position"));
    geometry.setIndex(hull.getIndex());
    geometry.instanceCount = 0;

    const mesh = new Mesh(geometry, this.materialFor(false));

    mesh.name = "AfterburnerBatch";
    mesh.userData.afterburnerBatch = this;
    mesh.frustumCulled = false;

    // The mesh's world matrix is the anchor and nothing else, whatever it is
    // parented to: the nozzles are placed in world space
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;

    // Drawn with the transparent things, after the opaque scene it reads
    mesh.renderOrder = 1;

    mesh.onBeforeRender = (renderer, scene, camera) =>
      this.update(
        renderer as unknown as { info: { frame: number } },
        scene,
        camera,
      );

    this.mesh = mesh;

    this.grow(options.capacity ?? DEFAULT_CAPACITY);
  }

  /** Every nozzle in the batch, in slot order */
  get nozzles(): readonly AfterburnerNozzle[] {
    return this._nozzles;
  }

  /** How the plumes are shaped */
  get profile(): Readonly<AfterburnerProfile> {
    return this._profile;
  }

  /**
   * Reshape every plume. Live: nothing rebuilds.
   * @param profile What to change, over the batch's preset and the defaults
   */
  setProfile(profile?: Partial<AfterburnerProfile>) {
    this._profile = resolve_afterburner_profile(profile, this.preset);

    write_afterburner_profile(this.uniforms, this._profile);
  }

  /**
   * Change some of the profile and keep the rest, such as `altitudeM` as the
   * formation climbs. Uniforms only, so cheap to call every frame.
   * @param profile What to change, over the profile as it stands
   */
  updateProfile(profile: Partial<AfterburnerProfile>) {
    this.setProfile({ ...this._profile, ...profile });
  }

  /** What a frame may spend */
  get quality(): Readonly<AfterburnerQuality> {
    return this._quality;
  }

  /**
   * Change what a frame may spend. Only a new octave count rebuilds.
   * @param quality A name, or step counts and octaves
   */
  setQuality(quality?: AfterburnerQualityInput) {
    const next = resolve_afterburner_quality(quality);
    const rebuild = next.turbulenceOctaves !== this._quality.turbulenceOctaves;

    this._quality = next;
    this.writeQuality();

    if (rebuild) {
      this.rebuild();
    }
  }

  /**
   * Change whether the plumes bend what is behind them. Rebuilds.
   * @param haze On or off
   */
  setHaze(haze: boolean) {
    if (haze !== this._haze) {
      this._haze = haze;
      this.rebuild();
    }
  }

  /**
   * Change the TSL hooks. Rebuilds.
   * @param hooks The new hooks
   */
  setHooks(hooks: AfterburnerHooks | undefined) {
    if (hooks !== this._hooks) {
      this._hooks = hooks;
      this.rebuild();
    }
  }

  /**
   * Add a nozzle.
   * @param options Where it is, how it looks and how hard it runs
   * @returns The nozzle, to drive or remove
   */
  add(options: AfterburnerNozzleOptions = {}): AfterburnerNozzle {
    const nozzle = new AfterburnerNozzle(
      this,
      options,
      (this._added++ * 7.31) % 1000,
    );

    if (this._nozzles.length >= this._capacity) {
      this.grow(this._capacity * 2);
    }

    nozzle._slot = this._nozzles.length;
    this._nozzles.push(nozzle);

    this.mesh.geometry.instanceCount = this._nozzles.length;

    this.writeStatic(nozzle);
    this._write_throttle(nozzle);

    // Placed on the next frame, when its object's matrix is current
    this.chooseMaterial();

    return nozzle;
  }

  /**
   * Take a nozzle out. The last nozzle moves into its slot.
   * @param nozzle The nozzle
   */
  remove(nozzle: AfterburnerNozzle) {
    if (nozzle._batch !== this) {
      return;
    }

    const slot = nozzle._slot;
    const last = this._nozzles.length - 1;

    nozzle._batch = null;
    nozzle._slot = -1;

    if (slot !== last) {
      const moved = this._nozzles[last];

      this._nozzles[slot] = moved;
      moved._slot = slot;

      copy_slot(this._static, last, slot, STATIC_STRIDE);
      copy_slot(this._dynamic, last, slot, DYNAMIC_STRIDE);

      this.markStatic(slot);
      this.markDynamic(slot);
    }

    this._nozzles.pop();
    this.mesh.geometry.instanceCount = this._nozzles.length;

    if (this._nozzles.length === 0) {
      this._anchored = false;
    }

    this.chooseMaterial();
  }

  /**
   * How the last frame's plumes split across the tiers, worked out on demand.
   * @returns The stats, one object reused between calls
   */
  stats(): Readonly<AfterburnerStats> {
    const stats = this._stats;

    stats.nozzles = this._nozzles.length;
    stats.near = stats.mid = stats.far = stats.culled = 0;

    const camera = this._camera;

    if (camera === null) {
      return stats;
    }

    const projection = camera.projectionMatrix.elements;
    const screen_scale = 2 / projection[5];

    scratch_frustum.setFromProjectionMatrix(
      scratch_matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );

    camera.getWorldPosition(scratch_position);

    for (const nozzle of this._nozzles) {
      const elements = nozzle._written;

      const reach = jet_state(
        nozzle._params,
        nozzle._drawn,
        this._profile,
        nozzle._scale,
      ).reachM;

      const x = elements[12];
      const y = elements[13];
      const z = elements[14];

      const distance_m = Math.hypot(
        x - scratch_position.x,
        y - scratch_position.y,
        z - scratch_position.z,
      );

      let inside = true;

      for (const plane of scratch_frustum.planes) {
        if (
          plane.normal.x * x +
            plane.normal.y * y +
            plane.normal.z * z +
            plane.constant <
          -reach
        ) {
          inside = false;
          break;
        }
      }

      const tier = inside
        ? plume_lod(
            reach,
            distance_m,
            screen_scale,
            this.minScreenFraction,
            this.detailDistanceM,
            this.cheapDistanceM,
          )
        : -1;

      if (tier === PLUME_LOD_NEAR) {
        stats.near++;
      } else if (tier === PLUME_LOD_MID) {
        stats.mid++;
      } else if (tier === PLUME_LOD_FAR) {
        stats.far++;
      } else {
        stats.culled++;
      }
    }

    return stats;
  }

  /** Free the GPU resources. The batch cannot be used afterwards */
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();

    for (const material of this._materials.values()) {
      material.dispose();
    }

    this._materials.clear();

    for (const nozzle of this._nozzles) {
      nozzle._batch = null;
    }

    this._nozzles = [];
  }

  /** @internal */
  _write_static(nozzle: AfterburnerNozzle) {
    this.writeStatic(nozzle);
    this.chooseMaterial();
  }

  /** @internal */
  _write_throttle(nozzle: AfterburnerNozzle) {
    this._dynamic.array[nozzle._slot * DYNAMIC_STRIDE + PLACE + 3] =
      nozzle._drawn;

    this.markDynamic(nozzle._slot);
  }

  /**
   * Bring the instances up to date, just before the mesh is drawn.
   * @param renderer The renderer drawing it
   * @param scene The scene it is drawn in, for its fog
   * @param camera The camera it is drawn from
   */
  private update(
    renderer: { info: { frame: number } },
    scene: Object3D,
    camera: Camera,
  ) {
    // Per camera: what the projection makes of a metre
    const projection = camera.projectionMatrix.elements;
    const screen_scale = projection[15] === 0 ? 2 / projection[5] : 1;

    this.uniforms.screenScale.value = screen_scale;
    this.uniforms.minScreenSpan.value = screen_scale * this.minScreenFraction;
    this.uniforms.detailDistance.value = this.detailDistanceM;
    this.uniforms.cheapDistance.value = this.cheapDistanceM;

    // Per scene: one batch may be drawn into more than one
    write_scene_fog(this.uniforms.fog, scene);

    this._camera = camera;

    // Per frame, however many cameras draw it
    const frame = renderer.info.frame;

    if (frame === this._frame) {
      return;
    }

    this._frame = frame;

    this.readSource();

    const now = performance.now();

    if (this._last_ms >= 0) {
      const delta_s =
        Math.min(MAX_DELTA_S, (now - this._last_ms) / 1000) * this.timeScale;

      this.uniforms.time.value += delta_s;
      this.respond(delta_s);
    }

    this._last_ms = now;

    this.place();
    this.sort(camera);
    this.upload();
  }

  /**
   * Put the instances in draw order, furthest plume first.
   *
   * The plumes blend over one another in instance order with no depth test, so
   * a near plume drawn first is painted over by the far one behind it. A clean
   * jet's glow barely shows it; a sooty cluster seen obliquely does. Each plume
   * is measured by the nearest point of its axis, and the slots are only
   * rewritten when two are out of order by more than a little, so plumes side
   * by side do not swap back and forth every frame.
   * @param camera The camera the frame is drawn from
   */
  private sort(camera: Camera) {
    const nozzles = this._nozzles;

    if (nozzles.length < 2) {
      return;
    }

    camera.getWorldPosition(scratch_position);

    for (const nozzle of nozzles) {
      const reach = jet_state(
        nozzle._params,
        nozzle._drawn,
        this._profile,
        nozzle._scale,
      ).reachM;

      nozzle._depth = axis_distance(nozzle._written, reach, scratch_position);
    }

    let ordered = true;

    for (let index = 1; index < nozzles.length; index++) {
      const before = nozzles[index - 1]._depth;
      const after = nozzles[index]._depth;

      if (after > before * (1 + SORT_TOLERANCE)) {
        ordered = false;
        break;
      }
    }

    if (ordered) {
      return;
    }

    const count = nozzles.length;
    const statics = this._static.array.slice(0, count * STATIC_STRIDE);
    const dynamics = this._dynamic.array.slice(0, count * DYNAMIC_STRIDE);

    const sorted = nozzles.slice().sort((a, b) => b._depth - a._depth);

    sorted.forEach((nozzle, slot) => {
      const from = nozzle._slot;

      this._static.array.set(
        statics.subarray(from * STATIC_STRIDE, (from + 1) * STATIC_STRIDE),
        slot * STATIC_STRIDE,
      );
      this._dynamic.array.set(
        dynamics.subarray(from * DYNAMIC_STRIDE, (from + 1) * DYNAMIC_STRIDE),
        slot * DYNAMIC_STRIDE,
      );

      nozzle._slot = slot;
    });

    this._nozzles = sorted;

    this.markStatic(0);
    this.markStatic(count - 1);
    this.markDynamic(0);
    this.markDynamic(count - 1);
  }

  /**
   * Take the air and the throttle from the shared flight, if there is one and
   * it changed since the last frame.
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

    for (const nozzle of this._nozzles) {
      const from = nozzle.throttleFrom;

      if (from) {
        nozzle.throttle = from(values);
      }
    }

    const profile = this._profile;

    if (
      profile.altitudeM !== values.altitudeM ||
      profile.airspeedMPerS !== values.airspeedMPerS ||
      profile.temperatureOffsetK !== values.temperatureOffsetK
    ) {
      // The batch's own copy, made when it was set: written in place, so a
      // flight that climbs every frame allocates nothing
      profile.altitudeM = values.altitudeM;
      profile.airspeedMPerS = values.airspeedMPerS;
      profile.temperatureOffsetK = values.temperatureOffsetK;

      write_afterburner_profile(this.uniforms, profile);
    }
  }

  /**
   * Ease every nozzle's drawn throttle toward the one asked for.
   * @param delta_s How far the flame's clock moved this frame
   */
  private respond(delta_s: number) {
    const follow =
      this.responseS > 0 ? 1 - Math.exp(-delta_s / this.responseS) : 1;

    for (const nozzle of this._nozzles) {
      const gap = nozzle._throttle - nozzle._drawn;

      if (gap === 0) {
        continue;
      }

      nozzle._drawn =
        Math.abs(gap) < RESPONSE_SETTLED
          ? nozzle._throttle
          : nozzle._drawn + gap * follow;

      this._write_throttle(nozzle);
    }
  }

  /** Follow every nozzle's world matrix, writing only the ones that moved */
  private place() {
    const nozzles = this._nozzles;

    if (nozzles.length === 0) {
      return;
    }

    // Measured from an anchor near the nozzles, so a float resolves
    // millimetres even when the scene is planet sized
    const first = drawn_elements(nozzles[0]);

    if (
      !this._anchored ||
      anchor_adrift(
        this._anchor.x,
        this._anchor.y,
        this._anchor.z,
        first[12],
        first[13],
        first[14],
      )
    ) {
      this._anchor.set(first[12], first[13], first[14]);
      this._anchored = true;

      this.mesh.matrixWorld.makeTranslation(this._anchor);

      // Every origin is measured from the anchor, so all of them move
      for (const nozzle of nozzles) {
        nozzle._written.fill(Number.NaN);
      }
    }

    for (const nozzle of nozzles) {
      const elements = drawn_elements(nozzle);
      const written = nozzle._written;

      let moved = false;

      for (let index = 0; index < 16; index++) {
        if (elements[index] !== written[index]) {
          moved = true;
          break;
        }
      }

      if (!moved) {
        continue;
      }

      written.set(elements);

      scratch_matrix.fromArray(elements);
      scratch_matrix.decompose(
        scratch_position,
        scratch_rotation,
        scratch_scale,
      );

      const offset = nozzle._slot * DYNAMIC_STRIDE;
      const array = this._dynamic.array;

      array[offset + PLACE] = scratch_position.x - this._anchor.x;
      array[offset + PLACE + 1] = scratch_position.y - this._anchor.y;
      array[offset + PLACE + 2] = scratch_position.z - this._anchor.z;

      array[offset + ROTATION] = scratch_rotation.x;
      array[offset + ROTATION + 1] = scratch_rotation.y;
      array[offset + ROTATION + 2] = scratch_rotation.z;
      array[offset + ROTATION + 3] = scratch_rotation.w;

      this.markDynamic(nozzle._slot);

      // A scaled nozzle is a bigger engine: every length in it scales
      const scale = (scratch_scale.x + scratch_scale.y + scratch_scale.z) / 3;

      if (scale !== nozzle._scale) {
        nozzle._scale = scale;
        this.writeStatic(nozzle);
      }
    }
  }

  /** Hand whatever changed to the GPU, and no more */
  private upload() {
    if (this._static_to > this._static_from) {
      this._static.clearUpdateRanges();
      this._static.addUpdateRange(
        this._static_from * STATIC_STRIDE,
        (this._static_to - this._static_from) * STATIC_STRIDE,
      );
      this._static.needsUpdate = true;

      this._static_from = Infinity;
      this._static_to = 0;
    }

    if (this._dynamic_to > this._dynamic_from) {
      this._dynamic.clearUpdateRanges();
      this._dynamic.addUpdateRange(
        this._dynamic_from * DYNAMIC_STRIDE,
        (this._dynamic_to - this._dynamic_from) * DYNAMIC_STRIDE,
      );
      this._dynamic.needsUpdate = true;

      this._dynamic_from = Infinity;
      this._dynamic_to = 0;
    }
  }

  /**
   * Write everything about a nozzle a moving throttle cannot change.
   * @param nozzle The nozzle
   */
  private writeStatic(nozzle: AfterburnerNozzle) {
    const params = nozzle._params;
    const scale = nozzle._scale;
    const array = this._static.array;
    const offset = nozzle._slot * STATIC_STRIDE;

    // A scaled nozzle is a bigger engine: its lengths scale, and nothing else
    // does. Soot per metre is a concentration, the same in any size of plume
    array[offset + SHAPE] = params.nozzleRadiusM * scale;
    array[offset + SHAPE + 1] = params.exitMach;
    array[offset + SHAPE + 2] = params.pressureRatio;
    array[offset + SHAPE + 3] = nozzle._seed;

    array[offset + THERMO] = params.exitTemperatureK;
    array[offset + THERMO + 1] = params.dryTemperatureK;
    array[offset + THERMO + 2] = params.gamma;
    array[offset + THERMO + 3] = params.molarMassGPerMol;

    array[offset + OPTICS] = params.sootPerM;
    array[offset + OPTICS + 1] = params.sootSurvival;
    array[offset + OPTICS + 2] = params.particlesPerM;
    array[offset + OPTICS + 3] = params.particleAlbedo;

    write_color(array, offset + BAND, params.bandColor, params.bandStrength);

    array[offset + MOTION] = params.turbulence;
    array[offset + MOTION + 1] = params.meander;
    array[offset + MOTION + 2] = params.refractionM * scale;
    array[offset + MOTION + 3] = params.afterburningK;

    // The outline is a shape, the same at any size
    const squareness = clamp_nozzle_squareness(params.nozzleSquareness);
    const fit = nozzle_outline_fit(params.nozzleAspect, squareness);

    array[offset + OUTLINE] = Math.max(params.nozzleAspect, 1e-3);
    array[offset + OUTLINE + 1] = squareness;
    array[offset + OUTLINE + 2] = params.nozzleRoll;
    array[offset + OUTLINE + 3] = Math.max(params.nozzleOutlineLength, 0);

    array[offset + OUTLINE_FIT] = fit.areaScale;
    array[offset + OUTLINE_FIT + 1] = fit.reach;

    this.markStatic(nozzle._slot);
  }

  private markStatic(slot: number) {
    this._static_from = Math.min(this._static_from, slot);
    this._static_to = Math.max(this._static_to, slot + 1);
  }

  private markDynamic(slot: number) {
    this._dynamic_from = Math.min(this._dynamic_from, slot);
    this._dynamic_to = Math.max(this._dynamic_to, slot + 1);
  }

  private writeQuality() {
    this.uniforms.nearSteps.value = this._quality.nearSteps;
    this.uniforms.midSteps.value = this._quality.midSteps;
  }

  /**
   * Make room for more nozzles, carrying the ones already written over.
   * @param capacity How many to hold
   */
  private grow(capacity: number) {
    const static_buffer = new InstancedInterleavedBuffer(
      new Float32Array(capacity * STATIC_STRIDE),
      STATIC_STRIDE,
    );

    const dynamic_buffer = new InstancedInterleavedBuffer(
      new Float32Array(capacity * DYNAMIC_STRIDE),
      DYNAMIC_STRIDE,
    );

    dynamic_buffer.setUsage(DynamicDrawUsage);

    if (this._capacity > 0) {
      static_buffer.array.set(this._static.array);
      dynamic_buffer.array.set(this._dynamic.array);
    }

    this._static = static_buffer;
    this._dynamic = dynamic_buffer;
    this._capacity = capacity;

    // A new geometry rather than new attributes on the old one, so the
    // renderer sets the draw up again from scratch
    const previous = this.mesh.geometry;
    const geometry = new InstancedBufferGeometry();

    geometry.setAttribute("position", previous.getAttribute("position"));
    geometry.setIndex(previous.getIndex());
    geometry.instanceCount = this._nozzles.length;

    const a = AFTERBURNER_ATTRIBUTES;

    const attributes: [string, InstancedInterleavedBuffer, number][] = [
      [a.shape, static_buffer, SHAPE],
      [a.thermo, static_buffer, THERMO],
      [a.optics, static_buffer, OPTICS],
      [a.band, static_buffer, BAND],
      [a.motion, static_buffer, MOTION],
      [a.outline, static_buffer, OUTLINE],
      [a.outline_fit, static_buffer, OUTLINE_FIT],
      [a.place, dynamic_buffer, PLACE],
      [a.rotation, dynamic_buffer, ROTATION],
    ];

    for (const [name, buffer, offset] of attributes) {
      geometry.setAttribute(
        name,
        new InterleavedBufferAttribute(buffer, 4, offset),
      );
    }

    this.mesh.geometry = geometry;

    if (this._nozzles.length > 0) {
      previous.dispose();
    }

    // Everything goes up again, into the new buffers
    if (this._nozzles.length > 0) {
      this.markStatic(0);
      this.markStatic(this._nozzles.length - 1);
      this.markDynamic(0);
      this.markDynamic(this._nozzles.length - 1);
    }
  }

  /**
   * Whether any nozzle bends what is behind it, which needs a copy of the frame.
   * @returns Whether the haze variant is wanted
   */
  private wantsHaze(): boolean {
    return (
      this._haze &&
      this._nozzles.some((nozzle) => nozzle._params.refractionM > 0)
    );
  }

  private chooseMaterial() {
    const material = this.materialFor(this.wantsHaze());

    if (this.mesh.material !== material) {
      this.mesh.material = material;
    }
  }

  /**
   * The material for one variant, built the first time it is asked for.
   * @param haze Whether it bends the background
   * @returns The material
   */
  private materialFor(haze: boolean): MeshBasicNodeMaterial {
    let material = this._materials.get(haze);

    if (material === undefined) {
      material = create_afterburner_material({
        octaves: this._quality.turbulenceOctaves,
        haze,
        hooks: this._hooks,
        uniforms: this.uniforms,
        backdrop: this._backdrop,
      }).material;

      this._materials.set(haze, material);
    }

    return material;
  }

  /** Throw every built material away, and choose again */
  private rebuild() {
    const current = this.mesh.material;

    for (const material of this._materials.values()) {
      if (material !== current) {
        material.dispose();
      }
    }

    this._materials.clear();
    this.chooseMaterial();

    // Disposed only once the mesh has let go of it
    if (this.mesh.material !== current) {
      current.dispose();
    }
  }
}

/**
 * The world matrix a nozzle is at right now.
 *
 * The renderer has already updated every object in the scene by the time the
 * batch draws, so this reads it rather than updating it again.
 * @param nozzle The nozzle
 * @returns Its world matrix's elements
 */
/**
 * Write an offset into a position and a turn: a nozzle's, or a group's.
 * Only the fields given change.
 * @param target What holds them
 * @param target.position Where it sits
 * @param target.quaternion How it is turned
 * @param offset What to write
 */
export const write_offset = (
  target: { position: Vector3; quaternion: Quaternion },
  offset: AfterburnerOffset,
) => {
  const { position, rotation, direction } = offset;

  if (position) {
    if (is_tuple(position)) {
      target.position.fromArray(position);
    } else {
      target.position.set(position.x, position.y, position.z);
    }
  }

  if (direction) {
    const to = is_tuple(direction)
      ? scratch_direction.fromArray(direction)
      : scratch_direction.set(direction.x, direction.y, direction.z);

    if (to.lengthSq() > 0) {
      target.quaternion.setFromUnitVectors(PLUME_AXIS, to.normalize());
    }
  } else if (rotation instanceof Quaternion) {
    target.quaternion.copy(rotation);
  } else if (rotation instanceof Euler) {
    target.quaternion.setFromEuler(rotation);
  } else if (rotation?.length === 4) {
    target.quaternion.fromArray(rotation);
  } else if (rotation) {
    target.quaternion.setFromEuler(scratch_euler.fromArray([...rotation]));
  }
};

const world_elements = (nozzle: AfterburnerNozzle): ArrayLike<number> => {
  const base = nozzle.object?.matrixWorld ?? nozzle.matrix;
  const { position, quaternion } = nozzle;

  // Most nozzles sit on their object's origin, and pay nothing for it
  if (
    position.x === 0 &&
    position.y === 0 &&
    position.z === 0 &&
    quaternion.x === 0 &&
    quaternion.y === 0 &&
    quaternion.z === 0
  ) {
    return base.elements;
  }

  scratch_offset.compose(position, quaternion, unit_scale);

  return nozzle._world.multiplyMatrices(base, scratch_offset).elements;
};

/**
 * The world matrix in the shader's frame, the plume running down its +X.
 *
 * The nozzle's +Z becomes the shader's +X and its +Y stays up: a quarter turn
 * about Y, which only moves columns about.
 * @param nozzle The nozzle
 * @returns Its drawn matrix's elements
 */
const drawn_elements = (nozzle: AfterburnerNozzle): ArrayLike<number> => {
  const world = world_elements(nozzle);
  const drawn = nozzle._drawn_frame;

  for (let row = 0; row < 4; row++) {
    drawn[row] = world[8 + row] ?? 0;
    drawn[4 + row] = world[4 + row] ?? 0;
    drawn[8 + row] = -(world[row] ?? 0);
    drawn[12 + row] = world[12 + row] ?? 0;
  }

  return drawn;
};

/**
 * Whether a vector was given as an array.
 * @param value The vector
 * @returns Whether it is a tuple
 */
const is_tuple = (
  value: Vector3Like | readonly number[],
): value is readonly [number, number, number] => Array.isArray(value);

/**
 * Write a colour and the float after it.
 * @param array Where
 * @param offset At which float
 * @param color The colour
 * @param extra What rides in its alpha
 */
const write_color = (
  array: Float32Array | ArrayLike<number>,
  offset: number,
  color: { r: number; g: number; b: number },
  extra: number,
) => {
  const target = array as Float32Array;

  target[offset] = color.r;
  target[offset + 1] = color.g;
  target[offset + 2] = color.b;
  target[offset + 3] = extra;
};

/**
 * How far a point is from a plume's axis, the segment from its nozzle out to
 * its reach along the drawn matrix's +X.
 * @param elements The nozzle's world matrix
 * @param reach How far the plume is drawn, in metres
 * @param point The point, in world space
 * @returns The distance, in metres
 */
export const axis_distance = (
  elements: ArrayLike<number>,
  reach: number,
  point: Vector3Like,
): number => {
  const dx = point.x - elements[12];
  const dy = point.y - elements[13];
  const dz = point.z - elements[14];

  // The matrix's +X, scale and all, as a unit vector
  const length = Math.hypot(elements[0], elements[1], elements[2]) || 1;
  const ax = elements[0] / length;
  const ay = elements[1] / length;
  const az = elements[2] / length;

  const along = Math.min(Math.max(dx * ax + dy * ay + dz * az, 0), reach);

  return Math.hypot(dx - ax * along, dy - ay * along, dz - az * along);
};

/**
 * Copy one instance over another.
 * @param buffer The buffer
 * @param from The slot to copy
 * @param to The slot to copy it to
 * @param stride Floats per slot
 */
const copy_slot = (
  buffer: InstancedInterleavedBuffer,
  from: number,
  to: number,
  stride: number,
) => {
  const array = buffer.array as Float32Array;

  array.copyWithin(to * stride, from * stride, (from + 1) * stride);
};
