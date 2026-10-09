import {
  Group,
  Matrix4,
  Mesh,
  Object3D,
  PointLight,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
  type Vector2,
} from "three";
import { DoubleSide, type MeshBasicNodeMaterial } from "three/webgpu";
import {
  AIR_GAS_CONSTANT,
  canonical_frame,
  chromaticity_rgb,
  create_glare_geometry,
  create_glare_material,
  create_glare_uniforms,
  density_ratio,
  extinction,
  fog_factor,
  glare_laid,
  glare_pixel,
  glare_radius,
  glare_scattered,
  hide_glare,
  lay_glare,
  planckian,
  standard_atmosphere,
  transmission,
  type Extinction,
  type Flight,
  type GlareUniforms,
  type Observer,
} from "@aeronautic/core";
import {
  burn_time,
  drag_per_speed2,
  FLARE,
  flare_at_pressure,
  flare_light,
  G0,
  grain_at,
  luminous_per_band,
  mass_rate,
  trail_colors,
  type Flare,
  type FlareLight,
  type FlareName,
  type Grain,
} from "./flare";
import {
  CHAFF,
  CHAFF_SIGMAS,
  CHAFF_VERTICES,
  SUN_RADIUS_RAD,
  chaff_bloom,
  chaff_cross_section,
  chaff_fall_speed,
  create_chaff_geometry,
  create_chaff_material,
  dipole_count,
  dipole_tumble_rate,
  glint_share,
  type Chaff,
  type ChaffName,
} from "./chaff";
import {
  create_smoke_geometry,
  create_smoke_material,
  henyey_greenstein,
  smoke_sigma,
  SMOKE_FAINTEST,
  SMOKE_POINTS,
  SMOKE_SIGMAS,
  SMOKE_VERTICES,
} from "./smoke";
import {
  create_trail_geometry,
  create_trail_material,
  TRAIL_COLOR_STEPS,
  TRAIL_E_FOLDS,
  TRAIL_SEGMENTS,
  TRAIL_VERTICES,
} from "./trail";
import {
  default_program,
  program_releases,
  type Payload,
  type Program,
} from "./program";
import {
  default_countermeasures_air,
  default_countermeasures_airframe,
  default_countermeasures_flight,
  default_countermeasures_look,
  resolve_chaff,
  resolve_countermeasures_quality,
  resolve_flare,
  type CountermeasuresAir,
  type CountermeasuresAirframe,
  type CountermeasuresFlight,
  type CountermeasuresLook,
  type CountermeasuresQuality,
  type CountermeasuresQualityName,
  type DispenserMount,
} from "./types";

// One aircraft's countermeasures
//
// The flares are a handful of points, so everything about them is worked
// out on the CPU: when each leaves, how its grain burns, how the air slows
// it and gravity pulls it down, how bright it is and how much of that the
// air lets through to the eye. The GPU only spreads that over the screen,
// as the eye's glare, and three's point lights carry the brightest onto the
// scene. Chaff is a cloud each cartridge, laid where the airstream tore it
// open, sinking and spreading
//
// As contrails' trails are, the flares are laid in the air the aircraft
// flies through, not the world: each moves through the air at its own
// velocity, the aircraft at its airspeed along its flight path, and a flare
// is drawn where it is from the aircraft now. So a model held still in a
// showcase leaves its flares streaming back as one flown through a game's
// world does

/** The faintest luminance worth drawing, in the scene's units: 10 bits' step */
const FLOOR = 1 / 1024;

/**
 * The longest step a flare is flown in, seconds. Drag slows one by e in
 * 1 / (k v): 5 ms is a tenth of that at 250 m/s near sea level
 */
const MAX_STEP_S = 0.005;

/**
 * Where the aircraft's frame sits on the group, and which way it faces.
 */
export type CountermeasuresFrame = {
  /** Which way the aircraft flies, in the group's frame. By default -Z */
  forward?: readonly [number, number, number];

  /** Which way is up for it. By default +Y */
  up?: readonly [number, number, number];
};

/**
 * How one aircraft's countermeasures are set up. Every group over its
 * defaults.
 */
export type CountermeasuresOptions = {
  /** Where the dispensers are */
  airframe?: Partial<CountermeasuresAirframe>;

  /** The flare: a make's name, or the fields over the MJU-7's */
  flare?: FlareName | Partial<Flare>;

  /** The chaff: a payload's name, or the fields over the RR-178's */
  chaff?: ChaffName | Partial<Chaff>;

  /** What `fire()` lets go */
  program?: Partial<Program>;

  flight?: Partial<CountermeasuresFlight>;
  air?: Partial<CountermeasuresAir>;
  look?: Partial<CountermeasuresLook>;
  frame?: CountermeasuresFrame;

  /** How many are drawn and light the scene: a preset's name, or the fields */
  quality?: CountermeasuresQualityName | Partial<CountermeasuresQuality>;

  /**
   * A shared flight to read the airspeed, the angles, the altitude and the
   * air's density from, every frame. What it gives wins over `flight` and
   * `air`
   */
  source?: Flight | null;
};

/** One flare in the air */
type Burning = {
  /** Where it is from the group's origin, world axes, metres */
  position: Vector3;

  /** Its velocity through the air, world axes, m/s */
  velocity: Vector3;

  /** How long since it left, seconds: it lights a moment later */
  ageS: number;

  /** Its grain and its flame now */
  grain: Grain;
  light: FlareLight;

  /** The smoke it is leaving */
  smoke: Smoke;
};

/** One flare's smoke, in the air */
type Smoke = {
  /**
   * The points the flare left it at, from the group's origin in world axes
   * less the air's drift then, metres: the drift now puts them where they
   * are
   */
  points: Float64Array;

  /** When each was laid, on the clock, seconds */
  bornS: Float64Array;

  /** The smoke there a metre of its path, kg/m */
  lineKgPerM: Float64Array;

  /** Its σ when laid, metres: the flame's width */
  sigma0M: Float64Array;

  /** How many there are */
  count: number;

  /** Its flare while it burns, the trail's head */
  flare: Burning | null;

  /** How long its flare will have burnt when it lays the next, seconds */
  nextS: number;
};

/** One cartridge's chaff, in the air */
type Cloud = {
  /**
   * Where it was let go, from the group's origin in world axes less the
   * air's drift then, metres
   */
  position: Vector3;

  /** Which way the airstream laid it, along its throw through the air */
  direction: Vector3;

  /** How long it is once bloomed, ±2σ, metres */
  lengthM: number;

  /** When it left, on the clock, seconds */
  bornS: number;

  /** Its own seed for its glints */
  seed: number;

  /** The camera from it the frame before, to know how fast it is turning */
  seen: Vector3;

  /** The frame that was, or -1 */
  seenFrame: number;
};

/** What of the renderer the countermeasures read */
type Renderer = {
  info: { frame: number };
  getDrawingBufferSize: (target: Vector2) => Vector2;
};

const scratch_matrix = new Matrix4();
const scratch_origin = new Vector3();
const scratch_position = new Vector3();
const scratch_camera = new Vector3();
const scratch_view = new Vector3();
const scratch_direction = new Vector3();
const scratch_relative = new Vector3();
const scratch_side = new Vector3();
const scratch_left = new Vector3();
const scratch_right = new Vector3();
const scratch_point = new Vector3();
const scratch_next = new Vector3();
const scratch_toward = new Vector3();
const scratch_sun = new Vector3();
const scratch_along = new Vector3();
const scratch_across = new Vector3();
const section_rgb: [number, number, number] = [0, 0, 0];
const glint_rgb: [number, number, number] = [0, 0, 0];
const scratch_transmission: [number, number, number] = [0, 0, 0];
const scratch_rgb: [number, number, number] = [0, 0, 0];

/**
 * Write one corner of a ribbon at `section_rgb`.
 * @param positions The positions
 * @param colors The colours
 * @param vertex Which vertex
 * @param side Where
 * @param smoke The smoke's attribute, if a smoke's: where across, the depth
 * @param across Which side, 1 left and -1 right
 * @param tau The smoke's depth through its middle there
 */
const lay_corner = (
  positions: Float32Array,
  colors: Float32Array,
  vertex: number,
  side: Vector3,
  smoke: Float32Array | null,
  across: number,
  tau: number,
) => {
  const at = vertex * 3;

  positions[at] = side.x;
  positions[at + 1] = side.y;
  positions[at + 2] = side.z;
  colors[at] = section_rgb[0];
  colors[at + 1] = section_rgb[1];
  colors[at + 2] = section_rgb[2];

  if (smoke) {
    smoke[vertex * 2] = across;
    smoke[vertex * 2 + 1] = tau;
  }
};

/**
 * Write a ribbon's cross-section, `scratch_left` and `scratch_right` at
 * `section_rgb`, as one end of a segment. A segment is two triangles,
 * corners 0 1 2 and 3 4 5: its start's left at 0 and 3 and right at 5, its
 * end's left at 1 and right at 2 and 4.
 * @param positions The positions
 * @param colors The colours
 * @param first The segment's first vertex
 * @param start Whether this is its start, or its end
 * @param smoke The smoke's attribute, across and depth, if a smoke's
 * @param tau The smoke's depth through its middle there
 */
const lay_section = (
  positions: Float32Array,
  colors: Float32Array,
  first: number,
  start: boolean,
  smoke: Float32Array | null = null,
  tau = 0,
) => {
  if (start) {
    lay_corner(positions, colors, first, scratch_left, smoke, 1, tau);
    lay_corner(positions, colors, first + 3, scratch_left, smoke, 1, tau);
    lay_corner(positions, colors, first + 5, scratch_right, smoke, -1, tau);
  } else {
    lay_corner(positions, colors, first + 1, scratch_left, smoke, 1, tau);
    lay_corner(positions, colors, first + 2, scratch_right, smoke, -1, tau);
    lay_corner(positions, colors, first + 4, scratch_right, smoke, -1, tau);
  }
};

/**
 * Draw a mesh as nothing, but draw it: one triangle of no area. A mesh
 * never drawn has no pipeline yet, and building its pipeline as the first
 * flare leaves stalls that frame for a second; built with the rest of the
 * scene, it costs nothing then.
 * @param geometry The mesh's geometry
 */
const draw_nothing = (geometry: BufferGeometry) => {
  const position = geometry.getAttribute("position");

  (position.array as Float32Array).fill(0, 0, 9);
  position.needsUpdate = true;
  geometry.setDrawRange(0, 3);
};

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
 * Whether a mount is a position rather than a node.
 * @param at The mount
 * @returns Whether it is three numbers
 */
const is_position = (
  at: DispenserMount,
): at is readonly [number, number, number] => !(at instanceof Object3D);

/**
 * One aircraft's flare dispensers, and the flares they let go: thrown at
 * the cartridge's speed, slowed by their own drag, falling, and burning
 * with an MTV flame's light, seen with the glare the eye gives it through
 * the day's air.
 *
 * Add `countermeasures.group` to the aircraft's model, and call `fire()`.
 * It needs three's `WebGPURenderer` (either backend) and reads the scene's
 * depth, so a flare behind the airframe has no glare.
 */
export class Countermeasures {
  /** Goes in the aircraft: the glare, and the lights lighting the scene */
  readonly group: Group;

  /** The glare's mesh. Its `userData.countermeasures` is this */
  readonly glare: Mesh<BufferGeometry, MeshBasicNodeMaterial>;

  /** The trails' mesh: the flames left in the air behind the grains */
  readonly trail: Mesh<BufferGeometry, MeshBasicNodeMaterial>;

  /** The smoke's mesh: what the flames burn to, left in the air */
  readonly smoke: Mesh<BufferGeometry, MeshBasicNodeMaterial>;

  /** The chaff's mesh: a cloud each cartridge */
  readonly clouds: Mesh<BufferGeometry, MeshBasicNodeMaterial>;

  /** How fast its clock runs, one being real time */
  timeScale = 1;

  /** A shared flight, read every frame. null flies only what is written */
  source: Flight | null;

  private _airframe: CountermeasuresAirframe;
  private _flare: Flare;
  private _chaff: Chaff;
  private _program: Program;
  private _flight: CountermeasuresFlight;
  private _air: CountermeasuresAir;
  private _look: CountermeasuresLook;
  private _quality: CountermeasuresQuality;

  private readonly _frame = new Matrix4();
  private _frame_options: CountermeasuresFrame = {};
  private readonly _glare_uniforms: GlareUniforms;
  private _lights: PointLight[] = [];
  private readonly _picked: Burning[] = [];

  // The flare's make, worked out once, and as it burns in this air
  private _lit!: Flare;
  private _burn_s = 0;
  private _end_s = 0;
  private _smoke_every_s = 0.1;
  private _per_band = 0;
  private _color: readonly [number, number, number] = [1, 1, 1];
  private _trail_colors: Float32Array = new Float32Array(
    (TRAIL_COLOR_STEPS + 1) * 3,
  );

  // The chaff's, in this air
  private _chaff_fall_m_s = 0;
  private _chaff_count = 0;
  private _chaff_tumble_rad_s = 0;
  private _glint_step = 0;
  private _chaff_section_m2 = 0;

  // The day's air
  private _pressure_pa = 101_325;
  private _temperature_k = 281.65;
  private _density_kg_m3 = 1.225;
  private _extinction: Extinction = extinction(23_000);
  private _scattered = 0;

  private _burning: Burning[] = [];
  private _smoke: Smoke[] = [];
  private _clouds: Cloud[] = [];
  private _queue: { timeS: number; dispenser: number; payload: Payload }[] = [];
  private _next_dispenser = 0;

  // The aircraft's velocity through the air, world axes, as last flown,
  // and how far the air has moved from it since the smoke began
  private readonly _velocity = new Vector3();
  private readonly _drift = new Vector3();

  private _time_s = 0;
  private _delta_s = 0;
  private _frame_number = -1;
  private _last_ms = -1;

  private _read_from: Flight | null = null;
  private _read_version = -1;

  constructor(options: CountermeasuresOptions = {}) {
    this._airframe = {
      ...default_countermeasures_airframe(),
      ...options.airframe,
    };
    this._flare = resolve_flare(options.flare, FLARE);
    this._chaff = resolve_chaff(options.chaff, CHAFF);
    this._program = { ...default_program(), ...options.program };
    this._flight = {
      ...default_countermeasures_flight(),
      ...options.flight,
    };
    this._air = { ...default_countermeasures_air(), ...options.air };
    this._look = { ...default_countermeasures_look(), ...options.look };
    this._quality = resolve_countermeasures_quality(options.quality);
    this.source = options.source ?? null;

    this.group = new Group();
    this.group.name = "Countermeasures";
    this.group.userData.countermeasures = this;

    this._glare_uniforms = create_glare_uniforms();

    const glare = new Mesh(
      create_glare_geometry(this._quality.flares),
      create_glare_material(this._glare_uniforms),
    );

    glare.name = "CountermeasuresGlare";
    glare.userData.countermeasures = this;
    glare.frustumCulled = false;
    glare.renderOrder = 2;
    glare.material.side = DoubleSide;
    glare.onBeforeRender = (renderer, scene, camera) =>
      this.drawGlare(
        renderer as unknown as Renderer,
        scene,
        camera as PerspectiveCamera,
      );

    this.glare = glare;
    this.group.add(glare);

    const trail = new Mesh(
      create_trail_geometry(this._quality.flares),
      create_trail_material(),
    );

    trail.name = "CountermeasuresTrail";
    trail.userData.countermeasures = this;
    trail.frustumCulled = false;
    trail.renderOrder = 1;
    trail.material.side = DoubleSide;
    trail.onBeforeRender = (renderer, scene, camera) =>
      this.drawTrail(
        renderer as unknown as Renderer,
        scene,
        camera as PerspectiveCamera,
      );

    this.trail = trail;
    this.group.add(trail);

    const smoke = new Mesh(
      create_smoke_geometry(this._quality.flares),
      create_smoke_material(),
    );

    smoke.name = "CountermeasuresSmoke";
    smoke.userData.countermeasures = this;
    smoke.frustumCulled = false;
    smoke.material.side = DoubleSide;
    smoke.onBeforeRender = (renderer, scene, camera) =>
      this.drawSmoke(
        renderer as unknown as Renderer,
        scene,
        camera as PerspectiveCamera,
      );

    this.smoke = smoke;
    this.group.add(smoke);

    const clouds = new Mesh(
      create_chaff_geometry(this._quality.chaff),
      create_chaff_material(),
    );

    clouds.name = "CountermeasuresChaff";
    clouds.userData.countermeasures = this;
    clouds.frustumCulled = false;
    clouds.material.side = DoubleSide;
    clouds.onBeforeRender = (renderer, scene, camera) =>
      this.drawChaff(
        renderer as unknown as Renderer,
        scene,
        camera as PerspectiveCamera,
      );

    this.clouds = clouds;
    this.group.add(clouds);

    this.setFrame(options.frame ?? {});
    this.writeFlare();
    this.writeAir();
    this.writeLook();
    this.buildLights();
  }

  get airframe(): Readonly<CountermeasuresAirframe> {
    return this._airframe;
  }

  get flare(): Readonly<Flare> {
    return this._flare;
  }

  get chaff(): Readonly<Chaff> {
    return this._chaff;
  }

  get program(): Readonly<Program> {
    return this._program;
  }

  get flight(): Readonly<CountermeasuresFlight> {
    return this._flight;
  }

  get air(): Readonly<CountermeasuresAir> {
    return this._air;
  }

  get look(): Readonly<CountermeasuresLook> {
    return this._look;
  }

  get quality(): Readonly<CountermeasuresQuality> {
    return this._quality;
  }

  /** How many flares are burning now */
  get burning(): number {
    return this._burning.length;
  }

  /** How many are still to leave, of the programs fired */
  get pending(): number {
    return this._queue.length;
  }

  /** How many smoke trails are in the air */
  get smoking(): number {
    return this._smoke.length;
  }

  /** How many chaff clouds are in the air */
  get chaffClouds(): number {
    return this._clouds.length;
  }

  /** How fast the chaff sinks once bloomed, m/s, in this air */
  get chaffFallMPerS(): number {
    return this._chaff_fall_m_s;
  }

  /** How long one flare burns, seconds, in this air */
  get burnTimeS(): number {
    return this._burn_s;
  }

  /**
   * Change where the dispensers are, and keep the rest.
   * @param airframe What to change
   */
  updateAirframe(airframe: Partial<CountermeasuresAirframe>) {
    if (unchanged(this._airframe, airframe)) return;

    this._airframe = { ...this._airframe, ...airframe };
  }

  /**
   * Change the flare: a make by name, or some of its fields.
   * @param flare What to change
   */
  updateFlare(flare: FlareName | Partial<Flare>) {
    const next =
      typeof flare === "string"
        ? resolve_flare(flare, FLARE)
        : { ...this._flare, ...flare };

    if (unchanged(this._flare, next)) return;

    this._flare = next;
    this.writeFlare();
  }

  /**
   * Change the chaff: a payload by name, or some of its fields.
   * @param chaff What to change
   */
  updateChaff(chaff: ChaffName | Partial<Chaff>) {
    const next =
      typeof chaff === "string"
        ? resolve_chaff(chaff, CHAFF)
        : { ...this._chaff, ...chaff };

    if (unchanged(this._chaff, next)) return;

    this._chaff = next;
    this.writeChaff();
  }

  /**
   * Change what `fire()` lets go.
   * @param program What to change
   */
  updateProgram(program: Partial<Program>) {
    if (unchanged(this._program, program)) return;

    this._program = { ...this._program, ...program };
  }

  /**
   * Change how the aircraft moves through the air.
   * @param flight What to change
   */
  updateFlight(flight: Partial<CountermeasuresFlight>) {
    if (unchanged(this._flight, flight)) return;

    this._flight = { ...this._flight, ...flight };
  }

  /**
   * Change some of the day and keep the rest.
   * @param air What to change
   */
  updateAir(air: Partial<CountermeasuresAir>) {
    if (unchanged(this._air, air)) return;

    this._air = { ...this._air, ...air };
    this.writeAir();
  }

  /**
   * Change some of the look and keep the rest.
   * @param look What to change
   */
  updateLook(look: Partial<CountermeasuresLook>) {
    if (unchanged(this._look, look)) return;

    this._look = { ...this._look, ...look };
    this.writeLook();
  }

  /**
   * Change how many are drawn and light the scene.
   * @param quality A preset's name, or the fields, over `high`
   */
  setQuality(
    quality?: CountermeasuresQualityName | Partial<CountermeasuresQuality>,
  ) {
    const next = resolve_countermeasures_quality(quality);

    if (unchanged(this._quality, next)) return;

    const previous = [
      this.glare.geometry,
      this.trail.geometry,
      this.smoke.geometry,
      this.clouds.geometry,
    ];

    this._quality = next;
    this.glare.geometry = create_glare_geometry(next.flares);
    this.trail.geometry = create_trail_geometry(next.flares);
    this.smoke.geometry = create_smoke_geometry(next.flares);
    this.clouds.geometry = create_chaff_geometry(next.chaff);

    for (const geometry of previous) geometry.dispose();

    for (const gone of this._smoke.splice(
      0,
      Math.max(this._smoke.length - next.flares, 0),
    )) {
      gone.flare = null;
    }

    this._burning = this._burning.filter((flare) => flare.smoke.flare);
    this._clouds.splice(0, Math.max(this._clouds.length - next.chaff, 0));
    this.buildLights();
  }

  /**
   * Move the aircraft's frame on the group.
   * @param frame Which ways are forward and up
   */
  setFrame(frame: CountermeasuresFrame) {
    this._frame_options = frame;
    this._frame.copy(canonical_frame(frame));
  }

  /** The aircraft's frame on the group, as last set */
  get frameOptions(): Readonly<CountermeasuresFrame> {
    return this._frame_options;
  }

  /**
   * Run a program: its flares or its chaff leave over the next seconds, the
   * dispensers taking turns.
   * @param program The program, over the one set
   * @returns How many cartridges it lets go
   */
  fire(program?: Partial<Program>): number {
    const dispensers = this._airframe.dispensers.length;

    if (dispensers === 0) return 0;

    const now_s = this.now();
    const releases = program_releases(
      { ...this._program, ...program },
      dispensers,
      this._next_dispenser,
    );

    for (const release of releases) {
      this._queue.push({
        timeS: now_s + release.timeS,
        dispenser: release.dispenser,
        payload: release.payload,
      });
    }

    this._queue.sort((a, b) => a.timeS - b.timeS);
    this._next_dispenser =
      (this._next_dispenser + releases.length) % dispensers;

    return releases.length;
  }

  /**
   * Let one cartridge go now.
   * @param dispenser Which dispenser, by index. By default the next in turn
   * @param payload A flare, or chaff
   */
  release(dispenser?: number, payload: Payload = "flare") {
    const count = this._airframe.dispensers.length;

    if (count === 0) return;

    const index = dispenser ?? this._next_dispenser;

    this._queue.unshift({
      timeS: this.now(),
      dispenser: index % count,
      payload,
    });
    this._next_dispenser = (index + 1) % count;
  }

  /**
   * The clock now, between frames: a press long after the last frame, in a
   * tab that has stopped drawing, leaves when it was pressed
   * @returns Seconds on the countermeasures' clock
   */
  private now(): number {
    return this._last_ms >= 0
      ? this._time_s +
          ((performance.now() - this._last_ms) / 1000) * this.timeScale
      : this._time_s;
  }

  /** Cancel what the programs have still to let go */
  stop() {
    this._queue = [];
  }

  /** Put every flare out, clear the smoke and chaff, and what is to leave */
  clear() {
    this._queue = [];
    this._burning = [];
    this._smoke = [];
    this._clouds = [];
    this._drift.set(0, 0, 0);
  }

  /** Free the GPU resources and three's lights. It cannot be used afterwards */
  dispose() {
    this.clear();
    this.group.removeFromParent();
    this.glare.geometry.dispose();
    this.glare.material.dispose();
    this.trail.geometry.dispose();
    this.trail.material.dispose();
    this.smoke.geometry.dispose();
    this.smoke.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();

    for (const light of this._lights) {
      light.removeFromParent();
      light.dispose();
    }

    this._lights = [];
  }

  /** The make's light per band, its colour, and its trail's as it cools */
  private writeFlare() {
    this._per_band = luminous_per_band(this._flare);
    this._color = chromaticity_rgb(planckian(this._flare.temperatureK));
    this._trail_colors = trail_colors(
      this._flare,
      (temperature_k) => chromaticity_rgb(planckian(temperature_k)),
      TRAIL_E_FOLDS,
      TRAIL_COLOR_STEPS,
    );

    for (const light of this._lights) light.color.setRGB(...this._color);

    this.writeBurn();
  }

  /**
   * The flare as it burns in this air, slower as it thins, and how long it
   * takes: lit a moment after it leaves, out its burn after that
   */
  private writeBurn() {
    this._lit = flare_at_pressure(this._flare, this._pressure_pa);
    this._burn_s = burn_time(this._lit);
    this._end_s = this._lit.ignitionDelayS + this._burn_s;

    // Its points to the burnout's, past the first, one left for its head
    this._smoke_every_s = this._burn_s / (SMOKE_POINTS - 2);
  }

  /** How fast the chaff sinks and turns in this air, and the light it stops */
  private writeChaff() {
    this._chaff_fall_m_s = chaff_fall_speed(
      this._chaff,
      this._temperature_k,
      this._density_kg_m3,
    );
    this._chaff_section_m2 = chaff_cross_section(this._chaff);
    this._chaff_count = dipole_count(this._chaff);
    this._chaff_tumble_rad_s = dipole_tumble_rate(
      this._chaff,
      this._air.turbulenceM2PerS3,
    );
  }

  /** The air's density and extinction */
  private writeAir() {
    const values = this.source?.values;

    if (values) {
      this._pressure_pa = values.pressurePa;
      this._temperature_k = values.temperatureK;
      this._density_kg_m3 = values.densityKgPerM3;
      this._extinction = extinction(this._air.visibilityM, values.densityRatio);
    } else {
      const air = standard_atmosphere(this._air.altitudeM);

      this._pressure_pa = air.pressurePa;
      this._temperature_k = air.temperatureK;
      this._density_kg_m3 =
        air.pressurePa / (AIR_GAS_CONSTANT * air.temperatureK);
      this._extinction = extinction(
        this._air.visibilityM,
        density_ratio(this._air.altitudeM),
      );
    }

    this.writeBurn();
    this.writeChaff();
  }

  /** The eye's glare, for the observer */
  private writeLook() {
    const observer = this.observer();

    this._scattered = glare_scattered(observer);
    this._glare_uniforms.age.value = 1 + (observer.ageYears / 62.5) ** 4;
    this._glare_uniforms.pigmentation.value = observer.pigmentation;
  }

  /**
   * Three's lights for the brightest flares: a fixed pool, always visible.
   * A light shown or hidden changes the scene's lights, and every material
   * recompiles for it; one at no intensity costs nothing
   */
  private buildLights() {
    for (const light of this._lights) {
      light.removeFromParent();
      light.dispose();
    }

    this._lights = [];

    for (let index = 0; index < this._quality.lights; index++) {
      const light = new PointLight(0xffffff, 0, 0, 2);

      light.name = "CountermeasuresLight";
      light.color.setRGB(...this._color);
      this._lights.push(light);
      this.group.add(light);
    }
  }

  /** The observer the glare is for */
  private observer(): Observer {
    return {
      ageYears: this._look.ageYears,
      pigmentation: this._look.pigmentation,
    };
  }

  /** Take the flight and the air from the shared flight, if it changed */
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

    this._flight = {
      airspeedMPerS: values.airspeedMPerS,
      angleOfAttackRad: values.angleOfAttackRad,
      sideslipRad: values.sideslipRad,
    };

    if (values.altitudeM !== this._air.altitudeM) {
      this._air = { ...this._air, altitudeM: values.altitudeM };
    }

    this.writeAir();
  }

  /**
   * The aircraft's velocity through the air in world axes, along its flight
   * path: against the free stream, as contrails' history flies it.
   */
  private placeVelocity() {
    const flight = this._flight;
    const cos_beta = Math.cos(flight.sideslipRad);

    scratch_matrix.multiplyMatrices(this.group.matrixWorld, this._frame);
    this._velocity
      .set(
        -Math.cos(flight.angleOfAttackRad) * cos_beta,
        -Math.sin(flight.angleOfAttackRad) * cos_beta,
        -Math.sin(flight.sideslipRad),
      )
      .transformDirection(scratch_matrix)
      .multiplyScalar(Math.max(flight.airspeedMPerS, 0));
  }

  /**
   * Let a cartridge go from a dispenser.
   * @param index Which dispenser
   * @param age_s How long ago, seconds, within this frame
   * @param payload A flare, or chaff
   */
  private spawn(index: number, age_s: number, payload: Payload) {
    const dispenser = this._airframe.dispensers[index];

    if (!dispenser) return;

    const at = dispenser.at;
    const direction = dispenser.direction ?? [0, -1, 0];

    scratch_origin.setFromMatrixPosition(this.group.matrixWorld);

    if (is_position(at)) {
      scratch_position
        .set(at[0], at[1], at[2])
        .applyMatrix4(this.group.matrixWorld);
      scratch_direction
        .set(direction[0], direction[1], direction[2])
        .transformDirection(this.group.matrixWorld);
    } else {
      scratch_position.setFromMatrixPosition(at.matrixWorld);
      scratch_direction
        .set(direction[0], direction[1], direction[2])
        .transformDirection(at.matrixWorld);
    }

    if (payload === "chaff") {
      this.spawnChaff(age_s);

      return;
    }

    // The oldest smoke goes first, past the most drawn, and its flare
    if (this._smoke.length >= this._quality.flares) {
      const gone = this._smoke.shift()!;

      if (gone.flare) {
        this._burning.splice(this._burning.indexOf(gone.flare), 1);
      }
    }

    const smoke: Smoke = {
      points: new Float64Array(SMOKE_POINTS * 3),
      bornS: new Float64Array(SMOKE_POINTS),
      lineKgPerM: new Float64Array(SMOKE_POINTS),
      sigma0M: new Float64Array(SMOKE_POINTS),
      count: 0,
      flare: null,
      nextS: 0,
    };
    const flare: Burning = {
      position: scratch_position.clone().sub(scratch_origin),
      velocity: this._velocity
        .clone()
        .addScaledVector(scratch_direction, this._flare.ejectionMPerS),
      ageS: 0,
      grain: grain_at(this._flare, 0),
      light: { intensityCd: 0, trailCd: 0, radiusM: 0 },
      smoke,
    };

    smoke.flare = flare;
    this._smoke.push(smoke);
    this._burning.push(flare);
    this.fly(flare, age_s);
  }

  /**
   * Let a cartridge's chaff go, from the dispenser and throw in
   * `scratch_position` and `scratch_direction`. Its fibres are stopped by
   * the air within a metre: it stays where it was let go, the airstream
   * laying it out ahead of there along its throw, the aircraft long past.
   * @param age_s How long ago, seconds, within this frame
   */
  private spawnChaff(age_s: number) {
    if (this._quality.chaff <= 0) return;

    // The oldest goes first, past the most drawn
    if (this._clouds.length >= this._quality.chaff) this._clouds.shift();

    const chaff = this._chaff;
    const throw_m_s = scratch_relative
      .copy(this._velocity)
      .addScaledVector(scratch_direction, chaff.ejectionMPerS);
    const speed = throw_m_s.length();
    const width = chaff.bloomWidthM;

    this._clouds.push({
      // Where the aircraft was then: it has flown on since
      position: scratch_position
        .clone()
        .sub(scratch_origin)
        .addScaledVector(this._velocity, -age_s)
        .sub(this._drift),
      direction:
        speed > 1e-6
          ? throw_m_s.clone().multiplyScalar(1 / speed)
          : new Vector3(0, -1, 0),
      // Torn off over its path as it slows: as long as its speed has it
      lengthM: Math.max(
        (chaff.bloomLengthM * speed) / chaff.bloomAtMPerS,
        width,
      ),
      bornS: this._time_s - age_s,
      seed: Math.floor(Math.random() * 16_777_216),
      seen: new Vector3(),
      seenFrame: -1,
    });
  }

  /**
   * Fly a flare on: its drag, its weight, and the aircraft flying on from
   * it.
   * @param flare The flare
   * @param delta_s How long, seconds
   */
  private fly(flare: Burning, delta_s: number) {
    // Nothing to draw past its burn: fly it no further than that
    const span = Math.min(delta_s, this._end_s - flare.ageS);

    if (span <= 0) {
      flare.ageS += delta_s;

      return;
    }

    const steps = Math.ceil(span / MAX_STEP_S);
    const step = span / steps;
    const velocity = flare.velocity;

    // Its grain halfway through: a frame burns off little of it
    grain_at(
      this._lit,
      flare.ageS + span / 2 - this._lit.ignitionDelayS,
      flare.grain,
    );

    const k = drag_per_speed2(this._lit, flare.grain, this._density_kg_m3);

    for (let index = 0; index < steps; index++) {
      // Semi-implicit: the speed first, then where it takes it
      const speed = velocity.length();

      velocity.multiplyScalar(1 / (1 + k * speed * step));
      velocity.y -= G0 * step;

      flare.position
        .addScaledVector(velocity, step)
        .addScaledVector(this._velocity, -step);
      flare.ageS += step;
    }

    flare.ageS += delta_s - span;
  }

  /**
   * The clock and everything that follows it, once a frame however many
   * cameras draw the flares.
   * @param renderer The renderer
   */
  private tick(renderer: Renderer) {
    if (renderer.info.frame === this._frame_number) return;

    this._frame_number = renderer.info.frame;
    this.readSource();

    const now = performance.now();

    this._delta_s =
      this._last_ms >= 0 ? ((now - this._last_ms) / 1000) * this.timeScale : 0;
    this._time_s += this._delta_s;
    if (this._delta_s > 0) this._glint_step = (this._glint_step + 1) % 4096;
    this._last_ms = now;
    this.placeVelocity();
    this._drift.addScaledVector(this._velocity, -this._delta_s);

    for (const flare of this._burning) this.fly(flare, this._delta_s);

    // What left during the frame, flown for the share of it since
    while (this._queue.length > 0 && this._queue[0].timeS <= this._time_s) {
      const release = this._queue.shift()!;

      this.spawn(
        release.dispenser,
        this._time_s - release.timeS,
        release.payload,
      );
    }

    // Out, in place: its smoke's last point where it went out
    const burning = this._burning;
    let kept = 0;

    for (const flare of burning) {
      if (flare.ageS < this._end_s) {
        burning[kept++] = flare;
        continue;
      }

      this.layPoint(flare.smoke, flare);
      flare.smoke.flare = null;
    }

    burning.length = kept;

    for (const flare of burning) {
      const lit_s = flare.ageS - this._lit.ignitionDelayS;

      // Not yet lit: the igniter has still to light the grain
      if (lit_s < 0) {
        flare.light.intensityCd = 0;
        flare.light.trailCd = 0;
        flare.light.radiusM = 0;
        continue;
      }

      grain_at(this._lit, lit_s, flare.grain);
      flare_light(
        this._lit,
        flare.grain,
        this._per_band,
        flare.light,
        flare.velocity.length(),
        this._density_kg_m3,
      );

      if (lit_s >= flare.smoke.nextS) {
        this.layPoint(flare.smoke, flare);
        flare.smoke.nextS =
          (Math.floor(lit_s / this._smoke_every_s) + 1) * this._smoke_every_s;
      }
    }

    this.thinSmoke();
    this.thinChaff();

    // Nothing in the air: start the drift again, keeping it small
    if (this._smoke.length === 0 && this._clouds.length === 0) {
      this._drift.set(0, 0, 0);
    }

    this.placeLights();
  }

  /**
   * Leave a point of smoke where a flare is: what it burns to a metre of
   * its path through the air, ρ r S Y over its speed, as wide as its flame.
   * @param smoke The smoke
   * @param flare Its flare
   */
  private layPoint(smoke: Smoke, flare: Burning) {
    if (smoke.count >= SMOKE_POINTS - 1) return;

    const at = smoke.count++;

    smoke.points[at * 3] = flare.position.x - this._drift.x;
    smoke.points[at * 3 + 1] = flare.position.y - this._drift.y;
    smoke.points[at * 3 + 2] = flare.position.z - this._drift.z;
    smoke.bornS[at] = this._time_s;
    smoke.lineKgPerM[at] = this.smokeLine(flare);
    smoke.sigma0M[at] = flare.light.radiusM;
  }

  /**
   * The smoke a flare leaves a metre of its path now, kg/m.
   * @param flare The flare
   * @returns What it burns a second, as smoke, over its speed
   */
  private smokeLine(flare: Burning): number {
    const lit = this._lit;

    // Near still it piles up where it is: spread no thinner than over the
    // flame's own width each second
    return (
      (mass_rate(lit, flare.grain) * lit.smokeYield) /
      Math.max(flare.velocity.length(), 2 * flare.light.radiusM, 1e-3)
    );
  }

  /**
   * Let the smoke go once it has spread too thin to see, or the air has
   * taken it past the day's visibility from the aircraft
   */
  private thinSmoke() {
    const smoke = this._smoke;
    const lit = this._lit;
    const reach2 = this._air.visibilityM ** 2;
    let kept = 0;

    for (const trail of smoke) {
      let seen = trail.flare !== null;

      for (let index = 0; index < trail.count && !seen; index++) {
        const sigma = smoke_sigma(
          trail.sigma0M[index],
          this._air.turbulenceM2PerS3,
          this._time_s - trail.bornS[index],
        );
        const tau =
          (lit.smokeExtinctionM2PerKg * trail.lineKgPerM[index]) /
          (Math.sqrt(2 * Math.PI) * Math.max(sigma, 1e-3));
        const x = trail.points[index * 3] + this._drift.x;
        const y = trail.points[index * 3 + 1] + this._drift.y;
        const z = trail.points[index * 3 + 2] + this._drift.z;

        seen = tau >= SMOKE_FAINTEST && x * x + y * y + z * z < reach2;
      }

      if (seen) smoke[kept++] = trail;
    }

    smoke.length = kept;
  }

  /**
   * A cloud's σ now, across and along its path, metres: bloomed, then
   * spread by the air's turbulence as the smoke is.
   * @param cloud The cloud
   * @param age_s How long since it left
   * @param target Where to write them, across then along
   */
  private chaffSigmas(cloud: Cloud, age_s: number, target: Vector3) {
    const chaff = this._chaff;
    const bloom = chaff_bloom(chaff, age_s);

    // The packet a cartridge wide before it opens
    const across = Math.max((chaff.bloomWidthM / 4) * bloom, 0.0127);
    const along = Math.max((cloud.lengthM / 4) * bloom, across);
    const turbulence = this._air.turbulenceM2PerS3;

    return target.set(
      smoke_sigma(across, turbulence, age_s),
      smoke_sigma(along, turbulence, age_s),
      0,
    );
  }

  /**
   * Where a cloud's middle is now, from the group's origin in world axes:
   * half its length on from where it was let go, as far as it has bloomed,
   * and sunk since.
   * @param cloud The cloud
   * @param age_s How long since it left
   * @param target Where to write it
   * @returns target
   */
  private chaffMiddle(cloud: Cloud, age_s: number, target: Vector3): Vector3 {
    return target
      .copy(cloud.position)
      .add(this._drift)
      .addScaledVector(
        cloud.direction,
        (cloud.lengthM / 2) * chaff_bloom(this._chaff, age_s),
      )
      .setY(target.y - this._chaff_fall_m_s * age_s);
  }

  /**
   * Let a cloud go once it has spread too thin to see even end on, or the
   * air has taken it past the day's visibility from the aircraft
   */
  private thinChaff() {
    const clouds = this._clouds;
    const reach2 = this._air.visibilityM ** 2;
    let kept = 0;

    for (const cloud of clouds) {
      const age_s = this._time_s - cloud.bornS;
      const across = this.chaffSigmas(cloud, age_s, scratch_across).x;
      const tau = this._chaff_section_m2 / (2 * Math.PI * across * across);
      const distance2 = this.chaffMiddle(
        cloud,
        age_s,
        scratch_along,
      ).lengthSq();

      if (tau >= SMOKE_FAINTEST && distance2 < reach2) clouds[kept++] = cloud;
    }

    clouds.length = kept;
  }

  /** Hang three's lights on the brightest flares */
  private placeLights() {
    const lights = this._lights;

    if (lights.length === 0) return;

    this.pickBrightest();

    scratch_origin.setFromMatrixPosition(this.group.matrixWorld);
    scratch_matrix.copy(this.group.matrixWorld).invert();

    for (let index = 0; index < lights.length; index++) {
      const light = lights[index];
      const flare = this._picked[index];

      if (!flare) {
        light.intensity = 0;
        continue;
      }

      // The scene's lights are set before this frame's draw reads them:
      // put each a frame on, where its flare will be then
      light.position
        .copy(flare.position)
        .addScaledVector(flare.velocity, this._delta_s)
        .addScaledVector(this._velocity, -this._delta_s)
        .add(scratch_origin)
        .applyMatrix4(scratch_matrix);
      light.intensity =
        (flare.light.intensityCd + flare.light.trailCd) * this._look.exposure;
    }
  }

  /**
   * Pick the brightest flares for the lights, without sorting or allocating:
   * the lights are a handful, and this runs every frame
   */
  private pickBrightest() {
    const picked = this._picked;

    picked.length = 0;

    for (let index = 0; index < this._lights.length; index++) {
      let found: Burning | undefined;

      for (const flare of this._burning) {
        if (picked.includes(flare)) continue;
        if (!found || flare.light.intensityCd > found.light.intensityCd) {
          found = flare;
        }
      }

      if (!found) return;
      picked.push(found);
    }
  }

  /**
   * Lay every flare's trail for this camera, just before it is drawn: a
   * ribbon facing it, back along the flare's path through the air.
   * @param renderer The renderer
   * @param scene The scene, for its fog
   * @param camera The camera
   */
  private drawTrail(
    renderer: Renderer,
    scene: Object3D,
    camera: PerspectiveCamera,
  ) {
    this.tick(renderer);

    const geometry = this.trail.geometry;
    const burning = this._burning;

    if (!camera.isPerspectiveCamera || burning.length === 0) {
      draw_nothing(geometry);

      return;
    }

    const positions = geometry.getAttribute("position").array as Float32Array;
    const colors = geometry.getAttribute("color").array as Float32Array;
    const exposure = this._look.exposure;
    const fog = (scene as { fog?: Parameters<typeof fog_factor>[0] }).fog;
    const pixel = glare_pixel(renderer, camera);
    const glow_s = this._flare.glowTimeS;

    scratch_origin.setFromMatrixPosition(this.group.matrixWorld);
    scratch_camera.setFromMatrixPosition(camera.matrixWorld);
    scratch_matrix.copy(this.group.matrixWorld).invert();

    let laid = 0;

    for (const flare of burning) {
      const speed = flare.velocity.length();
      const e_fold = speed * glow_s;

      // Only what it has left since it lit, and nothing when still
      const length = Math.min(
        TRAIL_E_FOLDS * e_fold,
        speed * (flare.ageS - this._lit.ignitionDelayS),
      );

      if (!(flare.light.trailCd > 0) || !(length > 1e-3)) continue;

      const head = scratch_relative.copy(flare.position).add(scratch_origin);
      const distance = Math.max(head.distanceTo(scratch_camera), 1e-3);

      // The haze and the scene's fog over the whole trail as at its head
      transmission(this._extinction, distance, scratch_transmission);
      scratch_view.copy(head).applyMatrix4(camera.matrixWorldInverse);

      const kept = 1 - fog_factor(fog ?? null, Math.max(-scratch_view.z, 0));

      // Back along its path, and how much of that is across the view: seen
      // end on, all the trail's light is in one width
      scratch_direction.copy(flare.velocity).multiplyScalar(-1 / speed);
      scratch_side.subVectors(head, scratch_camera).normalize();

      const across = scratch_side.cross(scratch_direction).length();
      const per_metre = flare.light.trailCd / e_fold;

      for (let k = 0; k <= TRAIL_SEGMENTS; k++) {
        const x = (length * k) / TRAIL_SEGMENTS;
        const at = scratch_position
          .copy(head)
          .addScaledVector(scratch_direction, x);

        // The flame's width, or two pixels' if that is wider, its light
        // spread over it
        const width = Math.max(
          2 * flare.light.radiusM,
          2 * pixel * at.distanceTo(scratch_camera),
        );
        const luminance =
          (per_metre * Math.exp(-x / e_fold)) /
          (width * Math.max(across, width / length));
        const scale = luminance * kept * exposure;

        // Across the trail, square to it and to the view
        scratch_side.subVectors(at, scratch_camera).cross(scratch_direction);

        if (scratch_side.lengthSq() < 1e-12) {
          scratch_side.set(0, 1, 0).applyQuaternion(camera.quaternion);
        }

        scratch_side.setLength(width / 2);
        scratch_left.copy(at).add(scratch_side).applyMatrix4(scratch_matrix);
        scratch_right.copy(at).sub(scratch_side).applyMatrix4(scratch_matrix);

        // Redder as it cools, its colour from the table by its e-folds
        const step =
          3 *
          Math.min(
            Math.round(((x / e_fold) * TRAIL_COLOR_STEPS) / TRAIL_E_FOLDS),
            TRAIL_COLOR_STEPS,
          );
        const cooled = this._trail_colors;

        section_rgb[0] = cooled[step] * scratch_transmission[0] * scale;
        section_rgb[1] = cooled[step + 1] * scratch_transmission[1] * scale;
        section_rgb[2] = cooled[step + 2] * scratch_transmission[2] * scale;

        // This cross-section ends the segment before it and starts the next
        const first = laid * TRAIL_VERTICES + k * 6;

        if (k > 0) lay_section(positions, colors, first - 6, false);
        if (k < TRAIL_SEGMENTS) lay_section(positions, colors, first, true);
      }

      laid++;
    }

    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
    if (laid > 0) geometry.setDrawRange(0, laid * TRAIL_VERTICES);
    else draw_nothing(geometry);
  }

  /**
   * Where a smoke trail's point is now, from the group's origin in world
   * axes: one it laid, or its burning flare's head past them.
   * @param trail The trail
   * @param index Which point
   * @param target Where to write it
   * @returns target
   */
  private smokePoint(trail: Smoke, index: number, target: Vector3): Vector3 {
    if (index >= trail.count) return target.copy(trail.flare!.position);

    return target.fromArray(trail.points, index * 3).add(this._drift);
  }

  /**
   * Lay the smoke for this camera, just before it is drawn: a ribbon facing
   * it through each trail's points, with the light each scatters and its
   * depth there.
   * @param renderer The renderer
   * @param scene The scene, for its fog
   * @param camera The camera
   */
  private drawSmoke(
    renderer: Renderer,
    scene: Object3D,
    camera: PerspectiveCamera,
  ) {
    this.tick(renderer);

    const geometry = this.smoke.geometry;
    const smoke = this._smoke;

    if (!camera.isPerspectiveCamera || smoke.length === 0) {
      draw_nothing(geometry);

      return;
    }

    const positions = geometry.getAttribute("position").array as Float32Array;
    const colors = geometry.getAttribute("color").array as Float32Array;
    const depths = geometry.getAttribute("smoke").array as Float32Array;
    const look = this._look;
    const lit = this._lit;
    const exposure = look.exposure;
    const fog = (scene as { fog?: Parameters<typeof fog_factor>[0] }).fog;
    const pixel = glare_pixel(renderer, camera);
    const turbulence = this._air.turbulenceM2PerS3;
    const g = lit.smokeAsymmetry;
    const per_sigma = lit.smokeExtinctionM2PerKg / Math.sqrt(2 * Math.PI);

    scratch_sun.fromArray(look.sunDirection).normalize();
    scratch_origin.setFromMatrixPosition(this.group.matrixWorld);
    scratch_matrix.copy(this.group.matrixWorld).invert();

    // The camera from the group's origin, as the points are
    scratch_camera
      .setFromMatrixPosition(camera.matrixWorld)
      .sub(scratch_origin);

    let laid = 0;

    for (const trail of smoke) {
      const head = trail.flare && trail.flare.light.radiusM > 0;
      const points = trail.count + (head ? 1 : 0);

      if (points < 2) continue;

      this.smokePoint(trail, 0, scratch_next);

      for (let index = 0; index < points; index++) {
        const at = scratch_point.copy(scratch_next);
        const is_head = head && index === points - 1;

        // Along the trail: on to the next point, or on from the last
        if (index < points - 1) {
          this.smokePoint(trail, index + 1, scratch_next);
          scratch_direction.subVectors(scratch_next, at);
        } else {
          this.smokePoint(trail, index - 1, scratch_direction);
          scratch_direction.subVectors(at, scratch_direction);
        }

        const segment = scratch_direction.length();

        if (segment > 1e-6) scratch_direction.multiplyScalar(1 / segment);
        else scratch_direction.set(0, 1, 0);

        const sigma = is_head
          ? trail.flare!.light.radiusM
          : smoke_sigma(
              trail.sigma0M[index],
              turbulence,
              this._time_s - trail.bornS[index],
            );
        const line = is_head
          ? this.smokeLine(trail.flare!)
          : trail.lineKgPerM[index];

        scratch_toward.subVectors(scratch_camera, at);

        const distance = Math.max(scratch_toward.length(), 1e-3);

        scratch_toward.multiplyScalar(1 / distance);

        // Two pixels wide at least, its smoke spread over that
        const drawn = Math.max(sigma, pixel * distance);

        // Its depth through its middle, across the view: seen end on, the
        // ray crosses more of it
        scratch_side.crossVectors(scratch_toward, scratch_direction);

        const across = Math.max(
          scratch_side.length(),
          drawn / Math.max(segment, drawn),
        );
        let tau = (per_sigma * line) / (drawn * across);

        // The sun's and the sky's light scattered to the eye, and each
        // flare's near it: its own, and the brightest
        const sun =
          look.sunIntensity *
          henyey_greenstein(-scratch_sun.dot(scratch_toward), g);
        let flares = 0;

        for (let source = -1; source < this._picked.length; source++) {
          const flare = source < 0 ? trail.flare : this._picked[source];

          if (!flare || (source >= 0 && flare === trail.flare)) continue;

          // At its head the smoke is in the flame, hidden by it: what the
          // segment behind it gets on average, I atan(L/σ) / (L σ), its
          // light running back along it
          if (is_head && source < 0) {
            flares +=
              ((flare.light.intensityCd + flare.light.trailCd) *
                exposure *
                henyey_greenstein(-scratch_direction.dot(scratch_toward), g) *
                Math.atan(segment / sigma)) /
              (Math.max(segment, 1e-3) * sigma);
            continue;
          }

          scratch_view.subVectors(at, flare.position);

          const reach = scratch_view.length();
          const cosine =
            reach > 1e-6 ? scratch_view.dot(scratch_toward) / reach : 0;

          flares +=
            ((flare.light.intensityCd + flare.light.trailCd) *
              exposure *
              henyey_greenstein(cosine, g)) /
            (reach * reach + sigma * sigma);
        }

        // Through the haze and the scene's fog to the eye
        transmission(this._extinction, distance, scratch_transmission);
        scratch_view
          .copy(at)
          .add(scratch_origin)
          .applyMatrix4(camera.matrixWorldInverse);

        const kept = 1 - fog_factor(fog ?? null, Math.max(-scratch_view.z, 0));
        const albedo = lit.smokeAlbedo * kept;

        for (let channel = 0; channel < 3; channel++) {
          section_rgb[channel] =
            albedo *
            scratch_transmission[channel] *
            (look.sunColor[channel] * sun +
              look.skyColor[channel] * look.skyIntensity +
              this._color[channel] * flares);
        }

        tau *=
          (kept *
            (scratch_transmission[0] +
              scratch_transmission[1] +
              scratch_transmission[2])) /
          3;

        // Across the trail, square to it and to the view
        scratch_side
          .subVectors(at, scratch_camera)
          .cross(scratch_direction)
          .setLength(SMOKE_SIGMAS * drawn);

        if (!(scratch_side.lengthSq() > 0)) {
          scratch_side
            .set(SMOKE_SIGMAS * drawn, 0, 0)
            .applyQuaternion(camera.quaternion);
        }

        scratch_left
          .copy(at)
          .add(scratch_side)
          .add(scratch_origin)
          .applyMatrix4(scratch_matrix);
        scratch_right
          .copy(at)
          .sub(scratch_side)
          .add(scratch_origin)
          .applyMatrix4(scratch_matrix);

        const first = laid * SMOKE_VERTICES + index * 6;

        if (index > 0) {
          lay_section(positions, colors, first - 6, false, depths, tau);
        }

        if (index < points - 1) {
          lay_section(positions, colors, first, true, depths, tau);
        }
      }

      // Its unused segments, past its last point, drawn as nothing
      const end = laid * SMOKE_VERTICES + (points - 1) * 6;

      depths.fill(0, end * 2, (laid + 1) * SMOKE_VERTICES * 2);
      positions.fill(0, end * 3, (laid + 1) * SMOKE_VERTICES * 3);
      laid++;
    }

    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
    geometry.getAttribute("smoke").needsUpdate = true;
    if (laid > 0) geometry.setDrawRange(0, laid * SMOKE_VERTICES);
    else draw_nothing(geometry);
  }

  /**
   * Lay the chaff for this camera, just before it is drawn: a quad facing it
   * on each cloud, as long as the cloud looks along its path, with the
   * light it scatters and its depth through its middle.
   * @param renderer The renderer
   * @param scene The scene, for its fog
   * @param camera The camera
   */
  private drawChaff(
    renderer: Renderer,
    scene: Object3D,
    camera: PerspectiveCamera,
  ) {
    this.tick(renderer);

    const geometry = this.clouds.geometry;
    const clouds = this._clouds;

    if (!camera.isPerspectiveCamera || clouds.length === 0) {
      draw_nothing(geometry);

      return;
    }

    const positions = geometry.getAttribute("position").array as Float32Array;
    const colors = geometry.getAttribute("color").array as Float32Array;
    const sparks = geometry.getAttribute("glint").array as Float32Array;
    const depths = geometry.getAttribute("chaff").array as Float32Array;
    const look = this._look;
    const fog = (scene as { fog?: Parameters<typeof fog_factor>[0] }).fog;
    const pixel = glare_pixel(renderer, camera);

    // A mirror turned every way sends the light every way alike
    const phase = 1 / (4 * Math.PI);

    scratch_origin.setFromMatrixPosition(this.group.matrixWorld);
    scratch_matrix.copy(this.group.matrixWorld).invert();
    scratch_camera
      .setFromMatrixPosition(camera.matrixWorld)
      .sub(scratch_origin);

    let laid = 0;

    for (const cloud of clouds) {
      const age_s = this._time_s - cloud.bornS;
      const at = this.chaffMiddle(cloud, age_s, scratch_point);
      const sigmas = this.chaffSigmas(cloud, age_s, scratch_next);

      scratch_toward.subVectors(scratch_camera, at);

      const distance = Math.max(scratch_toward.length(), 1e-3);

      scratch_toward.multiplyScalar(1 / distance);

      // Its path as the camera sees it: the Gaussian seen along the view is
      // one across the view, its long σ shortened as the path turns away
      const cosine = cloud.direction.dot(scratch_toward);

      scratch_along
        .copy(cloud.direction)
        .addScaledVector(scratch_toward, -cosine);

      if (scratch_along.lengthSq() < 1e-12) {
        scratch_along.set(1, 0, 0).applyQuaternion(camera.quaternion);
      }

      scratch_along.normalize();
      scratch_across.crossVectors(scratch_toward, scratch_along);

      // Two pixels wide at least, its chaff spread over that
      const smallest = pixel * distance;
      const across = Math.max(sigmas.x, smallest);
      const along = Math.max(
        Math.sqrt(
          sigmas.y * sigmas.y * (1 - cosine * cosine) +
            sigmas.x * sigmas.x * cosine * cosine,
        ),
        smallest,
      );

      // Through the haze and the scene's fog to the eye
      transmission(this._extinction, distance, scratch_transmission);
      scratch_view
        .copy(at)
        .add(scratch_origin)
        .applyMatrix4(camera.matrixWorldInverse);

      const kept = 1 - fog_factor(fog ?? null, Math.max(-scratch_view.z, 0));
      const tau =
        ((this._chaff_section_m2 / (2 * Math.PI * across * along)) *
          kept *
          (scratch_transmission[0] +
            scratch_transmission[1] +
            scratch_transmission[2])) /
        3;

      // How far its fibres turn against the half way over the frame: their
      // own tumbling, and the view turning, which turns h half as much
      let turning = this._chaff_tumble_rad_s;

      if (cloud.seenFrame === this._frame_number - 1 && this._delta_s > 0) {
        cloud.seen.addScaledVector(scratch_toward, -distance);
        turning +=
          Math.sqrt(
            Math.max(
              cloud.seen.lengthSq() - cloud.seen.dot(scratch_toward) ** 2,
              0,
            ),
          ) /
          distance /
          this._delta_s /
          2;
      }

      cloud.seen.copy(scratch_toward).multiplyScalar(distance);
      cloud.seenFrame = this._frame_number;

      const sweep = turning * this._delta_s;

      // A pixel's dipoles, for each unit of depth: the cartridge's over its
      // cross-section, times the pixel's footprint there
      const footprint = (2 * pixel * distance) ** 2;
      const per_depth =
        (this._chaff_count / this._chaff_section_m2) * footprint;

      // The sky lights it from everywhere: no glints. The sun and each flare
      // are small: their light comes by glints, the share of fibres that
      // catch each, and their counts are matched by their variance
      const sun_light = phase * look.sunIntensity;

      scratch_sun.fromArray(look.sunDirection).normalize();

      const sun_k =
        per_depth *
        glint_share(
          SUN_RADIUS_RAD,
          scratch_next.copy(scratch_sun).add(scratch_toward).length(),
          sweep,
        );
      let light = sun_light;
      let spread = sun_light > 0 ? (sun_light * sun_light) / sun_k : 0;
      let flares = 0;

      for (const flare of this._burning) {
        scratch_next.subVectors(flare.position, at);

        const reach = scratch_next.length();
        const lit =
          (phase *
            (flare.light.intensityCd + flare.light.trailCd) *
            look.exposure) /
          (reach * reach + across * across);

        if (lit <= 0) continue;

        const k =
          per_depth *
          glint_share(
            Math.max(flare.light.radiusM, across) / Math.max(reach, 1e-3),
            scratch_next
              .multiplyScalar(1 / Math.max(reach, 1e-3))
              .add(scratch_toward)
              .length(),
            sweep,
          );

        flares += lit;
        light += lit;
        spread += (lit * lit) / k;
      }

      const albedo = this._chaff.reflectance * kept;

      for (let channel = 0; channel < 3; channel++) {
        section_rgb[channel] =
          albedo *
          scratch_transmission[channel] *
          look.skyColor[channel] *
          look.skyIntensity;
        glint_rgb[channel] =
          albedo *
          scratch_transmission[channel] *
          (look.sunColor[channel] * sun_light + this._color[channel] * flares);
      }

      // The glints each unit of drawn depth holds: the drawn depth is the
      // true one dimmed by the haze and the fog
      const glints =
        light > 0 && tau > 0
          ? (((light * light) / spread) * this._chaff_section_m2) /
            (2 * Math.PI * across * along * tau)
          : 0;

      scratch_along.multiplyScalar(CHAFF_SIGMAS * along);
      scratch_across.multiplyScalar(CHAFF_SIGMAS * across);

      const first = laid * CHAFF_VERTICES;
      const seed = (cloud.seed + this._glint_step * 1_000_003) % 16_777_216;

      for (let corner = 0; corner < CHAFF_VERTICES; corner++) {
        // Two triangles: (-,-) (+,-) (+,+), (-,-) (+,+) (-,+)
        const u = corner === 1 || corner === 2 || corner === 4 ? 1 : -1;
        const v = corner === 2 || corner === 4 || corner === 5 ? 1 : -1;
        const vertex = first + corner;

        scratch_left
          .copy(at)
          .addScaledVector(scratch_along, u)
          .addScaledVector(scratch_across, v)
          .add(scratch_origin)
          .applyMatrix4(scratch_matrix);

        positions[vertex * 3] = scratch_left.x;
        positions[vertex * 3 + 1] = scratch_left.y;
        positions[vertex * 3 + 2] = scratch_left.z;
        colors[vertex * 3] = section_rgb[0];
        colors[vertex * 3 + 1] = section_rgb[1];
        colors[vertex * 3 + 2] = section_rgb[2];
        sparks[vertex * 4] = glint_rgb[0];
        sparks[vertex * 4 + 1] = glint_rgb[1];
        sparks[vertex * 4 + 2] = glint_rgb[2];
        sparks[vertex * 4 + 3] = seed;
        depths[vertex * 4] = u;
        depths[vertex * 4 + 1] = v;
        depths[vertex * 4 + 2] = tau;
        depths[vertex * 4 + 3] = glints;
      }

      laid++;
    }

    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
    geometry.getAttribute("glint").needsUpdate = true;
    geometry.getAttribute("chaff").needsUpdate = true;
    geometry.setDrawRange(0, laid * CHAFF_VERTICES);
  }

  /**
   * Lay every flare's glare for this camera, just before it is drawn.
   * @param renderer The renderer
   * @param scene The scene, for its fog
   * @param camera The camera
   */
  private drawGlare(
    renderer: Renderer,
    scene: Object3D,
    camera: PerspectiveCamera,
  ) {
    this.tick(renderer);

    const geometry = this.glare.geometry;
    const burning = this._burning;

    if (!camera.isPerspectiveCamera || burning.length === 0) {
      draw_nothing(geometry);

      return;
    }

    const view = camera.matrixWorldInverse;
    const exposure = this._look.exposure;
    const observer = this.observer();
    const fog = (scene as { fog?: Parameters<typeof fog_factor>[0] }).fog;
    const pixel = glare_pixel(renderer, camera);
    const smallest = Math.max((0.1 * Math.PI) / 180, pixel);

    scratch_origin.setFromMatrixPosition(this.group.matrixWorld);
    scratch_camera.setFromMatrixPosition(camera.matrixWorld);

    for (let index = 0; index < burning.length; index++) {
      const flare = burning[index];
      const world = scratch_relative.copy(flare.position).add(scratch_origin);
      const distance = Math.max(world.distanceTo(scratch_camera), 1e-3);

      scratch_view.copy(world).applyMatrix4(view);

      const kept = 1 - fog_factor(fog ?? null, Math.max(-scratch_view.z, 0));

      transmission(this._extinction, distance, scratch_transmission);

      const scale =
        (flare.light.intensityCd * kept * exposure) / (distance * distance);

      scratch_rgb[0] = this._color[0] * scratch_transmission[0] * scale;
      scratch_rgb[1] = this._color[1] * scratch_transmission[1] * scale;
      scratch_rgb[2] = this._color[2] * scratch_transmission[2] * scale;

      const brightest = Math.max(...scratch_rgb);

      if (!(brightest > 0)) {
        hide_glare(geometry, index);
        continue;
      }

      // The flame's own disc, or 0.1° or a pixel if that is wider, carrying
      // what the eye does not scatter
      const core = Math.max(
        Math.atan(flare.light.radiusM / distance),
        smallest,
      );

      lay_glare(geometry, index, camera, {
        view: scratch_view,
        rgb: scratch_rgb,
        core,
        coreLuminance:
          (1 - this._scattered) / (2 * Math.PI * (1 - Math.cos(core))),
        radius: Math.max(
          (glare_radius(brightest, FLOOR, observer) * Math.PI) / 180,
          core,
        ),
        bias: flare.light.radiusM + 2 * pixel * distance,
      });
    }

    glare_laid(geometry, burning.length);
  }
}
