import {
  type BufferGeometry,
  type Camera,
  Color,
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
  type Flight,
  moist_air,
  type MoistAir,
  REHEAT_FIRST_ZONE,
  reheat_share,
  type SceneBackdrop,
  write_scene_fog,
} from "@aeronautic/core";
import {
  TRAIL_MIN_AGE_S,
  TrailHistory,
  trail_ages,
  type TrailFlight,
  type TrailPoint,
} from "./history";
import { ice_humidity } from "./ice";
import {
  create_contrail_material,
  create_contrail_uniforms,
  create_puff_geometry,
  create_puff_texture,
  puff_texel,
  type ContrailUniforms,
} from "./material";
import {
  age_at_dilution,
  plume_at,
  plume_formation,
  schmidt_appleman,
  type ContrailFormation,
  type Emission,
  type PlumeFormation,
} from "./plume";
import {
  CONTRAIL_FUEL,
  default_contrail_air,
  default_contrail_airframe,
  default_contrail_flight,
  default_contrail_look,
  resolve_contrail_quality,
  type ContrailAir,
  type ContrailAirframe,
  type ContrailColor,
  type ContrailEngine,
  type ContrailFlight,
  type ContrailFuel,
  type ContrailFuelName,
  type ContrailLook,
  type ContrailQuality,
  type ContrailQualityName,
} from "./types";
import { fit_puff_levels, write_puffs } from "./puffs";
import { reheat_consumption, thrust_lapse } from "./thrust";
import { buoyancy_frequency, wake, type Wake } from "./wake";

// One aircraft's contrails, drawn as one mesh in the scene
//
// As wing-vapor's, the mesh carries itself: it reads the object it follows
// and the camera from its own onBeforeRender. The physics, whether the
// exhaust condenses, where and how much ice it holds at each age, is worked
// out whenever a dial changes; each frame only lays the trails back along
// the aircraft's path through the air, a few hundred points

const G0 = 9.80665;

// A shared flight's altitude is read to the nearest this many metres, so a
// climb does not work the plume out again every frame
const SOURCE_ALTITUDE_STEP_M = 10;

// Seconds of trail drawn by default: a minute, fifteen kilometres at cruise.
// A persistent contrail lasts hours; past a minute it is a cirrus, and wider
// than a scene's far plane cares for
const DEFAULT_LENGTH_S = 60;

// The plume's width along the trail, for how far apart its puffs are left,
// at this many ages evenly in ln(1 + t / t₀): a few percent of its age apart,
// over which the width barely changes
const SIGMA_TABLE_SIZE = 128;

/**
 * The age one entry of the width's table is at.
 * @param index Which entry
 * @param size How many there are
 * @param oldest The trail's length, seconds
 * @returns The age, seconds
 */
const sigma_table_age = (index: number, size: number, oldest: number) =>
  TRAIL_MIN_AGE_S *
  Math.expm1((Math.log1p(oldest / TRAIL_MIN_AGE_S) * index) / (size - 1));

/**
 * Where the airframe's frame sits on the object it follows.
 */
export type ContrailsFrame = {
  /** Its origin, in the object's frame */
  position?: readonly [number, number, number];

  /** Which way the aircraft flies, in the object's frame. By default -Z */
  forward?: readonly [number, number, number];

  /** Which way is up for it. By default +Y */
  up?: readonly [number, number, number];
};

/**
 * How one aircraft's contrails are set up. Every group over its defaults.
 */
export type ContrailsOptions = {
  airframe?: Partial<ContrailAirframe>;
  flight?: Partial<ContrailFlight>;
  air?: Partial<ContrailAir>;
  look?: Partial<ContrailLook>;

  /** What it burns: a name, or the fuel's numbers. Kerosene by default */
  fuel?: ContrailFuelName | ContrailFuel;

  /** What it follows: the aircraft's model, or any node of it */
  object?: Object3D | null;

  frame?: ContrailsFrame;

  /** How many seconds of trail to draw. A minute by default */
  lengthS?: number;

  /** How finely: a preset's name, or the fields. `high` by default */
  quality?: ContrailQualityName | Partial<ContrailQuality>;

  /**
   * The opaque scene drawn in a pass of its own, as core's `volume_pass`
   * sets up: put `mesh` in `pass.scene` and give `pass.backdrop` here
   */
  backdrop?: SceneBackdrop;

  /**
   * A shared flight to read the airspeed, the angles, the load factor, the
   * throttle, the altitude and the day from, every frame. What it gives wins over `flight`
   * and `air`
   */
  source?: Flight | null;
};

/**
 * Everything the trails are drawn from.
 */
export type ContrailsState = {
  /** The air at the aircraft */
  air: MoistAir;

  /** Its humidity over ice: above one, a contrail persists */
  iceHumidity: number;

  /** The Schmidt–Appleman criterion, for this day and these engines */
  criterion: ContrailFormation;

  /** Where along the plume droplets form and freeze */
  formation: PlumeFormation;

  /** How much of the fuel's heat pushes the aircraft */
  efficiency: number;

  /** How much of the burner is lit, as the afterburner's: 0 dry to 1 */
  reheat: number;

  /** The engines' thrust, all of them, newtons */
  thrustN: number;

  /** Fuel burnt per metre, each engine, kilograms */
  fuelPerMetreKg: number;

  /** The wake the exhaust is carried in */
  wake: Wake;

  /** Whether any trail is drawn: the exhaust condenses somewhere */
  visible: boolean;

  /** Whether it outlives the plume's mixing: the air is supersaturated over ice */
  persistent: boolean;
};

const scratch_matrix = new Matrix4();
const scratch_inverse = new Matrix4();
const scratch_frame_inverse = new Matrix4();
const scratch_position = new Vector3();
const scratch_rotation = new Quaternion();
const scratch_scale = new Vector3();
const scratch_vector = new Vector3();
const unit_scale = new Vector3(1, 1, 1);

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
 * A fuel by name, or as given.
 * @param fuel The name or the numbers
 * @returns The numbers
 */
const resolve_fuel = (fuel?: ContrailFuelName | ContrailFuel): ContrailFuel =>
  typeof fuel === "string"
    ? CONTRAIL_FUEL[fuel]
    : (fuel ?? CONTRAIL_FUEL.kerosene);

/**
 * One aircraft's contrails: a trail from each engine, formed where its
 * exhaust cools past water saturation, frozen, carried down by the wake and
 * spread by the air it mixes with, lasting seconds or hours by the humidity.
 *
 * Add `contrails.mesh` to the scene, or let the React component do it. It
 * needs three's `WebGPURenderer` (either backend) and reads the scene's
 * depth, so a trail stops at what is in front of it.
 */
export class Contrails {
  /** The mesh to put in the scene. Its `userData.contrails` is this */
  readonly mesh: Mesh<BufferGeometry, MeshBasicNodeMaterial>;

  /** The uniforms the material is driven by */
  readonly uniforms: ContrailUniforms;

  /** What it follows */
  object: Object3D | null;

  /** How fast its clock runs, one being real time */
  timeScale = 1;

  /** A shared flight, read every frame. null flies only what is written */
  source: Flight | null;

  private _airframe: ContrailAirframe;
  private _flight: ContrailFlight;
  private _air: ContrailAir;
  private _look: ContrailLook;
  private _fuel: ContrailFuel;
  private _length_s: number;
  private _quality: ContrailQuality;

  private readonly _frame = new Matrix4();
  private _frame_options: ContrailsFrame = {};
  private readonly _backdrop: SceneBackdrop | undefined;

  private _puffs: DataTexture;
  private _engines_built = 0;

  private readonly _history = new TrailHistory();
  private _ages: Float64Array;

  // Each puff's age, and where it is laid on each engine's trail
  private _puff_ages = new Float64Array(0);
  private _points: TrailPoint[][] = [];

  // The plume at each of the ages, for this flight's fuel per metre
  private _sigma: Float64Array;
  private _extinction: Float64Array;
  private _emission: Emission = {
    fuelPerMetreKg: 0,
    efficiency: 0,
    formation: { dilution: Infinity, freezeDilution: Infinity },
  };
  private _plume_air: MoistAir | null = null;
  private _start_s = Infinity;
  private readonly _sigma_table = new Float64Array(SIGMA_TABLE_SIZE);
  private readonly _sigma_at = (age_s: number) => {
    const table = this._sigma_table;
    const oldest = Math.max(this._length_s, TRAIL_MIN_AGE_S * 2);
    const at =
      (Math.log1p(Math.max(age_s, 0) / TRAIL_MIN_AGE_S) /
        Math.log1p(oldest / TRAIL_MIN_AGE_S)) *
      (table.length - 1);
    const low = Math.min(Math.max(Math.floor(at), 0), table.length - 2);
    const t = Math.min(Math.max(at - low, 0), 1);

    return table[low] + (table[low + 1] - table[low]) * t;
  };

  private _state: ContrailsState;
  private _trail_flight: TrailFlight;

  private _frame_number = -1;
  private _last_ms = -1;

  private _read_from: Flight | null = null;
  private _read_version = -1;

  constructor(options: ContrailsOptions = {}) {
    this._airframe = { ...default_contrail_airframe(), ...options.airframe };
    this._flight = { ...default_contrail_flight(), ...options.flight };
    this._air = { ...default_contrail_air(), ...options.air };
    this._look = { ...default_contrail_look(), ...options.look };
    this._fuel = resolve_fuel(options.fuel);
    this._length_s = Math.max(options.lengthS ?? DEFAULT_LENGTH_S, 0.1);
    this._quality = resolve_contrail_quality(options.quality);

    this.object = options.object ?? null;
    this.source = options.source ?? null;
    this._backdrop = options.backdrop;

    this.uniforms = create_contrail_uniforms();

    this._ages = trail_ages(this._quality.points, this._length_s);
    this._sigma = new Float64Array(this._ages.length);
    this._extinction = new Float64Array(this._ages.length);
    this._puffs = create_puff_texture(this._quality.puffs, 1);

    const mesh = new Mesh(
      create_puff_geometry(this._quality.puffs, 0),
      create_contrail_material({
        uniforms: this.uniforms,
        puffs: this._puffs,
        count: this._quality.puffs,
        backdrop: this._backdrop,
      }),
    );

    mesh.name = "Contrails";
    mesh.userData.contrails = this;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.renderOrder = 1;

    mesh.onBeforeRender = (renderer, scene, camera) =>
      this.update(
        renderer as unknown as { info: { frame: number } },
        scene,
        camera,
      );

    this.mesh = mesh;

    this.setFrame(options.frame ?? {});
    this.writeLook();

    const refreshed = this.refresh();

    this._state = refreshed.state;
    this._trail_flight = refreshed.flight;
    this.rebuild();
  }

  /** Everything the trails are drawn from */
  get state(): Readonly<ContrailsState> {
    return this._state;
  }

  get airframe(): Readonly<ContrailAirframe> {
    return this._airframe;
  }

  get flight(): Readonly<ContrailFlight> {
    return this._flight;
  }

  get air(): Readonly<ContrailAir> {
    return this._air;
  }

  get look(): Readonly<ContrailLook> {
    return this._look;
  }

  get fuel(): Readonly<ContrailFuel> {
    return this._fuel;
  }

  /** How many seconds of trail are drawn */
  get lengthS(): number {
    return this._length_s;
  }

  /**
   * Change some of the flight and keep the rest. Cheap enough for every frame.
   * @param flight What to change
   */
  updateFlight(flight: Partial<ContrailFlight>) {
    if (unchanged(this._flight, flight)) return;

    this._flight = { ...this._flight, ...flight };
    this.apply();
  }

  /**
   * Change some of the day and keep the rest.
   * @param air What to change
   */
  updateAir(air: Partial<ContrailAir>) {
    if (unchanged(this._air, air)) return;

    this._air = { ...this._air, ...air };
    this.apply();
  }

  /**
   * Change some of the airframe and keep the rest. A different number of
   * engines rebuilds the mesh.
   * @param airframe What to change
   */
  updateAirframe(airframe: Partial<ContrailAirframe>) {
    if (unchanged(this._airframe, airframe)) return;

    this._airframe = { ...this._airframe, ...airframe };
    this.apply();

    if (this._airframe.engines.length !== this._engines_built) {
      this.rebuild();
    }
  }

  /**
   * Change the fuel.
   * @param fuel A name, or the numbers
   */
  setFuel(fuel: ContrailFuelName | ContrailFuel) {
    const next = resolve_fuel(fuel);

    if (unchanged(this._fuel, next)) return;

    this._fuel = { ...next };
    this.apply();
  }

  /**
   * Change some of the look and keep the rest.
   * @param look What to change
   */
  updateLook(look: Partial<ContrailLook>) {
    if (unchanged(this._look, look)) return;

    this._look = { ...this._look, ...look };
    this.writeLook();
  }

  /**
   * Change how many seconds of trail are drawn.
   * @param length_s Seconds
   */
  setLength(length_s: number) {
    const next = Math.max(length_s, 0.1);

    if (next === this._length_s) return;

    this._length_s = next;
    this.rebuild();
  }

  /**
   * Change how finely the trails are drawn. Rebuilds the mesh.
   * @param quality A preset's name, or the fields, over `high`
   */
  setQuality(quality?: ContrailQualityName | Partial<ContrailQuality>) {
    const next = resolve_contrail_quality(quality);

    if (unchanged(this._quality, next)) return;

    this._quality = next;
    this.rebuild();
  }

  /**
   * Move the airframe's frame on what it follows.
   * @param frame Its origin, and which ways are forward and up
   */
  setFrame(frame: ContrailsFrame) {
    this._frame_options = frame;
    this._frame.copy(canonical_frame(frame));
  }

  /** The airframe's frame on what it follows, as last set */
  get frameOptions(): Readonly<ContrailsFrame> {
    return this._frame_options;
  }

  /** Forget the path flown: the trails start again from the engines */
  reset() {
    this._history.reset();
  }

  /** Free the GPU resources. It cannot be used afterwards */
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this._puffs.dispose();
  }

  /** Work the physics out again, and keep it */
  private apply() {
    const refreshed = this.refresh();

    this._state = refreshed.state;
    this._trail_flight = refreshed.flight;
  }

  /**
   * Work the physics out: the air, the engines, the wake and where the
   * plume forms.
   * @returns The state, and the flight the history keeps
   */
  private refresh(): { state: ContrailsState; flight: TrailFlight } {
    const airframe = this._airframe;
    const flight = this._flight;
    const fuel = this._fuel;

    const air = moist_air(
      this._air.altitudeM,
      this._air.relativeHumidity,
      this._air.temperatureOffsetK,
    );

    const speed = Math.max(flight.airspeedMPerS, 0);

    // Dry, the thrust is the drag. A jet cruises for range where its drag
    // polar's parasite drag is three times the drag due to lift,
    // C_D0 = 3 k C_L², so at the same speed and n g the drag is D₁ (3 + n²) / 4:
    // a quarter less unloaded, pushed or pulled the same either way, and with
    // the g's square in a hard pull
    const level_drag_n =
      (airframe.massKg * G0) / Math.max(airframe.liftToDrag, 1);
    const drag_n = (level_drag_n * (3 + flight.loadFactor ** 2)) / 4;
    const engines = Math.max(airframe.engines.length, 1);

    // But no more than the engines make dry at this height and speed: past
    // it the aircraft slows, burning no more
    const mach = speed / air.soundMPerS;
    const most_n =
      Math.max(airframe.maxThrustN, 0) *
      engines *
      thrust_lapse(air.pressurePa, air.temperatureK, mach);
    const dry_most_n = Math.min(
      Math.max(airframe.dryThrustN, 0) *
        engines *
        thrust_lapse(air.pressurePa, air.temperatureK, mach, "military"),
      most_n,
    );

    // Lit, the core runs at military power, pushed there as the throttle
    // passes the detent, and the burner adds what it is staged to at the
    // dearer consumption reheat has: its fuel follows its thrust, from
    // military power's to full reheat's
    const consumption = Math.max(airframe.fuelPerThrust, 0);
    const reheat = most_n > dry_most_n ? reheat_share(flight.throttle) : 0;
    const light_off = Math.min(reheat / REHEAT_FIRST_ZONE, 1);
    const held_n = Math.min(drag_n, dry_most_n);
    const core_n =
      light_off > 0 ? held_n + (dry_most_n - held_n) * light_off : held_n;
    const burner_n = reheat > 0 ? (most_n - dry_most_n) * reheat : 0;
    const burner_fuel =
      reheat > 0
        ? (most_n * reheat_consumption(mach) - dry_most_n) *
          consumption *
          reheat
        : 0;
    const thrust_n = core_n + burner_n;
    const fuel_rate = core_n * consumption + burner_fuel;

    // The engines' share of the fuel's heat that pushes is the thrust's power
    // over the fuel's: a quarter dry, a sixth at full reheat
    const efficiency = Math.min(
      Math.max(
        (speed * thrust_n) / Math.max(fuel_rate * fuel.heatJPerKg, 1e-9),
        0,
      ),
      0.9,
    );

    const fuel_per_metre = fuel_rate / Math.max(speed, 1) / engines;

    const wake_now = wake(
      airframe.massKg,
      flight.loadFactor,
      airframe.spanM,
      air.densityKgPerM3,
      speed,
      buoyancy_frequency(this._air.altitudeM, this._air.temperatureOffsetK),
    );

    const criterion = schmidt_appleman(air, fuel, efficiency);
    const formation = plume_formation(air, fuel, efficiency);

    // The plume, for the ages it is worked out at each frame, and its
    // width along the whole trail, for how far apart its puffs are left
    this._emission = { fuelPerMetreKg: fuel_per_metre, efficiency, formation };
    this._plume_air = air;
    this._start_s = age_at_dilution(formation.dilution);

    const table = this._sigma_table;
    const table_oldest = Math.max(this._length_s, TRAIL_MIN_AGE_S * 2);

    for (let index = 0; index < table.length; index++) {
      const age = sigma_table_age(index, table.length, table_oldest);

      table[index] = plume_at(age, this._emission, air, fuel).sigmaM;
    }

    const humidity = ice_humidity(air);
    const cos_beta = Math.cos(flight.sideslipRad);

    return {
      state: {
        air,
        iceHumidity: humidity,
        criterion,
        formation,
        efficiency,
        reheat,
        thrustN: thrust_n,
        fuelPerMetreKg: fuel_per_metre,
        wake: wake_now,
        visible:
          Number.isFinite(formation.dilution) &&
          speed > 0 &&
          fuel_per_metre > 0,
        persistent: Number.isFinite(formation.freezeDilution) && humidity > 1,
      },
      flight: {
        speedMPerS: speed,
        cosAlpha: Math.cos(flight.angleOfAttackRad) * cos_beta,
        sinAlpha: Math.sin(flight.angleOfAttackRad) * cos_beta,

        // From the right is towards +z, the left wing
        flowZ: Math.sin(flight.sideslipRad),
        wake: wake_now,
        fuelPerMetreKg: fuel_per_metre,
      },
    };
  }

  /** Make the mesh and the texture again, for the engines and the quality */
  private rebuild() {
    const engines = this._airframe.engines.length;

    this._ages = trail_ages(this._quality.points, this._length_s);
    this._sigma = new Float64Array(this._ages.length);
    this._extinction = new Float64Array(this._ages.length);
    this._puff_ages = new Float64Array(this._quality.puffs);
    this._points = Array.from({ length: engines }, () =>
      Array.from({ length: this._quality.puffs }, () => ({
        x: 0,
        y: 0,
        z: 0,
        fuelPerMetreKg: 0,
        backX: 0,
        backY: 0,
        backZ: 0,
        speedMPerS: 0,
      })),
    );

    const previous_puffs = this._puffs;
    const previous_material = this.mesh.material;
    const previous_geometry = this.mesh.geometry;

    this._puffs = create_puff_texture(this._quality.puffs, engines);
    this.mesh.geometry = create_puff_geometry(this._quality.puffs, engines);
    this.mesh.material = create_contrail_material({
      uniforms: this.uniforms,
      puffs: this._puffs,
      count: this._quality.puffs,
      backdrop: this._backdrop,
    });

    this._engines_built = engines;

    previous_puffs.dispose();
    previous_material.dispose();
    previous_geometry.dispose();

    this.apply();
    this.layTrails();
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
    u.anisotropy.value = Math.min(Math.max(look.anisotropy, -0.95), 0.95);
  }

  /**
   * Take the flight and the day from the shared flight, if it changed.
   * @returns Whether anything was read
   */
  private readSource(): boolean {
    const source = this.source;

    if (
      !source ||
      (source === this._read_from && source.version === this._read_version)
    ) {
      return false;
    }

    this._read_from = source;
    this._read_version = source.version;

    const values = source.values;
    const flight = this._flight;
    const air = this._air;

    flight.airspeedMPerS = values.airspeedMPerS;
    flight.angleOfAttackRad = values.angleOfAttackRad;
    flight.sideslipRad = values.sideslipRad;
    flight.loadFactor = values.loadFactor;
    flight.throttle = values.throttle;

    air.altitudeM =
      Math.round(values.altitudeM / SOURCE_ALTITUDE_STEP_M) *
      SOURCE_ALTITUDE_STEP_M;
    air.temperatureOffsetK = values.temperatureOffsetK;
    air.relativeHumidity = values.relativeHumidity;

    return true;
  }

  /**
   * Where an engine's exhaust leaves, in the canonical frame.
   * @param engine A position in the followed object's frame, or a node
   * @param target Where to write it
   * @returns target
   */
  private enginePosition(
    engine: ContrailEngine,
    target: [number, number, number],
  ): [number, number, number] {
    if (Array.isArray(engine)) {
      scratch_vector
        .fromArray(engine as readonly number[] as number[])
        .applyMatrix4(scratch_frame_inverse.copy(this._frame).invert());
    } else {
      const node = engine as Object3D;

      node.updateWorldMatrix(true, false);
      scratch_vector
        .setFromMatrixPosition(node.matrixWorld)
        .applyMatrix4(
          scratch_frame_inverse.copy(this.mesh.matrixWorld).invert(),
        );
    }

    target[0] = scratch_vector.x;
    target[1] = scratch_vector.y;
    target[2] = scratch_vector.z;

    return target;
  }

  /** Lay every puff back along the history, and hand them to the shader */
  private layTrails() {
    const engines = this._airframe.engines;
    const data = this._puffs.image.data as Float32Array;
    const count = this._ages.length;
    const reference = Math.max(this._state.fuelPerMetreKg, 1e-12);
    const visible = this._state.visible;
    const ages = this._ages;
    const puffs = this._quality.puffs;

    // The plume at its ages, which stay put: read between them, a puff's
    // width and ice are the same for its age every frame
    if (this._plume_air) {
      for (let index = 0; index < count; index++) {
        const plume = plume_at(
          ages[index],
          this._emission,
          this._plume_air,
          this._fuel,
        );

        this._sigma[index] = plume.sigmaM;
        this._extinction[index] = plume.extinctionM;
      }
    }

    // The drawn trail ends at its length, not at a cut
    this._extinction[count - 1] = 0;

    // The puffs, at their ages now, as many as the plume's turbulence asks
    // and there is room for
    const levels = visible
      ? fit_puff_levels(
          this._sigma_at,
          Math.max(this._start_s, TRAIL_MIN_AGE_S),
          this._length_s,
          this._trail_flight.speedMPerS,
          puffs,
        )
      : [];
    const drawn = write_puffs(levels, this._history.timeS, data);
    const puff_ages = this._puff_ages.subarray(0, drawn);

    for (let puff = 0; puff < drawn; puff++) {
      puff_ages[puff] = data[puff * 4];
    }

    // Each exactly where the exhaust of its age is, on each engine's trail:
    // laid from the path flown, not read off a curve through points, so a
    // puff stays put in the air however the path around it bends
    for (let engine = 0; engine < this._points.length; engine++) {
      this._history.lay(
        this.enginePosition(engines[engine], scratch_engine),
        puff_ages,
        this._trail_flight,
        this._points[engine],
      );
    }

    // The plume at each puff's age, between the ages it is worked out at:
    // both only grow, so one walk along them
    const first = this._points[0];
    let at = 0;

    for (let puff = 0; puff < drawn; puff++) {
      const age = puff_ages[puff];

      while (at < count - 2 && ages[at + 1] <= age) at++;

      const span = Math.max(ages[at + 1] - ages[at], 1e-9);
      const t = Math.min(Math.max((age - ages[at]) / span, 0), 1);
      const sigma =
        this._sigma[at] + (this._sigma[at + 1] - this._sigma[at]) * t;
      const extinction =
        this._extinction[at] +
        (this._extinction[at + 1] - this._extinction[at]) * t;

      // Ice scales with the fuel the exhaust was left with, and the plume's
      // area with the air that fuel mixed with
      const point = first?.[puff];
      const ratio = point ? Math.max(point.fuelPerMetreKg, 0) / reference : 1;
      const optics = puff_texel(puff, 1, puffs);
      const back = puff_texel(puff, 2, puffs);

      data[optics] = sigma * Math.sqrt(ratio);
      data[optics + 1] = extinction * ratio;
      data[optics + 2] = point ? point.speedMPerS : 0;
      data[optics + 3] = 0;

      data[back] = point ? point.backX : 1;
      data[back + 1] = point ? point.backY : 0;
      data[back + 2] = point ? point.backZ : 0;
      data[back + 3] = 0;

      for (let engine = 0; engine < this._points.length; engine++) {
        const laid = this._points[engine][puff];
        const centre = puff_texel(puff, 3 + engine, puffs);

        data[centre] = laid.x;
        data[centre + 1] = laid.y;
        data[centre + 2] = laid.z;
        data[centre + 3] = 0;
      }
    }

    this.mesh.geometry.setDrawRange(0, drawn * this._points.length * 6);
    this._puffs.needsUpdate = true;

    // Which way the air's axes are now, for the puffs scattered in it
    this.uniforms.air.value.setFromMatrix4(
      scratch_matrix.makeRotationFromQuaternion(
        scratch_rotation.copy(this._history.attitude).invert(),
      ),
    );
  }

  /**
   * Follow the aircraft and the camera, just before the mesh is drawn.
   * @param renderer The renderer drawing it
   * @param scene The scene it is drawn in, for its fog
   * @param camera The camera it is drawn from
   */
  private update(
    renderer: { info: { frame: number } },
    scene: Object3D,
    camera: Camera,
  ) {
    // Rigid and in metres: a scaled model scales where the frame sits, not
    // where the engines are, which the airframe gives
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

    scratch_inverse.copy(this.mesh.matrixWorld).invert();

    this.uniforms.camera.value
      .setFromMatrixPosition(camera.matrixWorld)
      .applyMatrix4(scratch_inverse);

    this.uniforms.sunDirection.value
      .fromArray(this._look.sunDirection)
      .transformDirection(scratch_inverse);

    write_scene_fog(this.uniforms.fog, scene);

    // The clock, once a frame however many cameras draw it
    if (renderer.info.frame === this._frame_number) {
      return;
    }

    this._frame_number = renderer.info.frame;

    if (this.readSource()) {
      this.apply();
    }

    const now = performance.now();
    const delta_s =
      this._last_ms >= 0 ? ((now - this._last_ms) / 1000) * this.timeScale : 0;

    this._last_ms = now;

    this.mesh.matrixWorld.decompose(
      scratch_position,
      scratch_rotation,
      scratch_scale,
    );

    this._history.advance(
      delta_s,
      scratch_rotation,
      this._trail_flight,
      this._length_s,
    );

    this.layTrails();
  }
}

const scratch_engine: [number, number, number] = [0, 0, 0];
const scratch_color = new Color();

/**
 * A look's colour as linear RGB.
 * @param color Three numbers, or anything three's `Color` takes
 * @returns The three
 */
const linear_rgb = (color: ContrailColor): readonly [number, number, number] =>
  Array.isArray(color)
    ? (color as readonly [number, number, number])
    : (scratch_color.set(color as ColorRepresentation).toArray() as [
        number,
        number,
        number,
      ]);
