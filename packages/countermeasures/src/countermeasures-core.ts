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
  flare_light,
  G0,
  grain_at,
  luminous_per_band,
  type Flare,
  type FlareLight,
  type FlareName,
  type Grain,
} from "./flare";
import { default_program, program_releases, type Program } from "./program";
import {
  default_countermeasures_air,
  default_countermeasures_airframe,
  default_countermeasures_flight,
  default_countermeasures_look,
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
// scene
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

  /** How long it has burnt, seconds */
  ageS: number;

  /** Its grain and its flame now */
  grain: Grain;
  light: FlareLight;
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
const scratch_transmission: [number, number, number] = [0, 0, 0];
const scratch_rgb: [number, number, number] = [0, 0, 0];

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

  /** How fast its clock runs, one being real time */
  timeScale = 1;

  /** A shared flight, read every frame. null flies only what is written */
  source: Flight | null;

  private _airframe: CountermeasuresAirframe;
  private _flare: Flare;
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

  // The flare's make, worked out once
  private _burn_s = 0;
  private _per_band = 0;
  private _color: readonly [number, number, number] = [1, 1, 1];

  // The day's air
  private _density_kg_m3 = 1.225;
  private _extinction: Extinction = extinction(23_000);
  private _scattered = 0;

  private _burning: Burning[] = [];
  private _queue: { timeS: number; dispenser: number }[] = [];
  private _next_dispenser = 0;

  // The aircraft's velocity through the air, world axes, as last flown
  private readonly _velocity = new Vector3();

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

  /** How long one flare burns, seconds */
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

    const previous = this.glare.geometry;

    this._quality = next;
    this.glare.geometry = create_glare_geometry(next.flares);
    previous.dispose();
    this._burning.splice(0, Math.max(this._burning.length - next.flares, 0));
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
   * Run a program: its flares leave over the next seconds, the dispensers
   * taking turns.
   * @param program The program, over the one set
   * @returns How many flares it lets go
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
      });
    }

    this._queue.sort((a, b) => a.timeS - b.timeS);
    this._next_dispenser =
      (this._next_dispenser + releases.length) % dispensers;

    return releases.length;
  }

  /**
   * Let one flare go now.
   * @param dispenser Which dispenser, by index. By default the next in turn
   */
  release(dispenser?: number) {
    const count = this._airframe.dispensers.length;

    if (count === 0) return;

    const index = dispenser ?? this._next_dispenser;

    this._queue.unshift({ timeS: this.now(), dispenser: index % count });
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

  /** Put every burning flare out, and cancel what is still to leave */
  clear() {
    this._queue = [];
    this._burning = [];
  }

  /** Free the GPU resources and three's lights. It cannot be used afterwards */
  dispose() {
    this.clear();
    this.group.removeFromParent();
    this.glare.geometry.dispose();
    this.glare.material.dispose();

    for (const light of this._lights) {
      light.removeFromParent();
      light.dispose();
    }

    this._lights = [];
  }

  /** The make's burn time, its light per band and its colour */
  private writeFlare() {
    this._burn_s = burn_time(this._flare);
    this._per_band = luminous_per_band(this._flare);
    this._color = chromaticity_rgb(planckian(this._flare.temperatureK));

    for (const light of this._lights) light.color.setRGB(...this._color);
  }

  /** The air's density and extinction */
  private writeAir() {
    const values = this.source?.values;

    if (values) {
      this._density_kg_m3 = values.densityKgPerM3;
      this._extinction = extinction(this._air.visibilityM, values.densityRatio);

      return;
    }

    const air = standard_atmosphere(this._air.altitudeM);

    this._density_kg_m3 =
      air.pressurePa / (AIR_GAS_CONSTANT * air.temperatureK);
    this._extinction = extinction(
      this._air.visibilityM,
      density_ratio(this._air.altitudeM),
    );
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
   * Let a flare go from a dispenser.
   * @param index Which dispenser
   * @param age_s How long ago, seconds, within this frame
   */
  private spawn(index: number, age_s: number) {
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

    // The oldest goes first, past the most drawn
    if (this._burning.length >= this._quality.flares) this._burning.shift();

    const flare: Burning = {
      position: scratch_position.clone().sub(scratch_origin),
      velocity: this._velocity
        .clone()
        .addScaledVector(scratch_direction, this._flare.ejectionMPerS),
      ageS: 0,
      grain: grain_at(this._flare, 0),
      light: { intensityCd: 0, radiusM: 0 },
    };

    this._burning.push(flare);
    this.fly(flare, age_s);
  }

  /**
   * Fly a flare on: its drag, its weight, and the aircraft flying on from
   * it.
   * @param flare The flare
   * @param delta_s How long, seconds
   */
  private fly(flare: Burning, delta_s: number) {
    // Nothing to draw past its burn: fly it no further than that
    const span = Math.min(delta_s, this._burn_s - flare.ageS);

    if (span <= 0) {
      flare.ageS += delta_s;

      return;
    }

    const steps = Math.ceil(span / MAX_STEP_S);
    const step = span / steps;
    const velocity = flare.velocity;

    for (let index = 0; index < steps; index++) {
      grain_at(this._flare, flare.ageS + step / 2, flare.grain);

      // Semi-implicit: the speed first, then where it takes it
      const k = drag_per_speed2(this._flare, flare.grain, this._density_kg_m3);
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
    this._last_ms = now;
    this.placeVelocity();

    for (const flare of this._burning) this.fly(flare, this._delta_s);

    // What left during the frame, flown for the share of it since
    while (this._queue.length > 0 && this._queue[0].timeS <= this._time_s) {
      const release = this._queue.shift()!;

      this.spawn(release.dispenser, this._time_s - release.timeS);
    }

    this._burning = this._burning.filter((flare) => flare.ageS < this._burn_s);

    for (const flare of this._burning) {
      grain_at(this._flare, flare.ageS, flare.grain);
      flare_light(this._flare, flare.grain, this._per_band, flare.light);
    }

    this.placeLights();
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
      light.intensity = flare.light.intensityCd * this._look.exposure;
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
      geometry.setDrawRange(0, 0);

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
