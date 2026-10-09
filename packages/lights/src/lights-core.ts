import {
  type Camera,
  Group,
  Matrix4,
  Mesh,
  Object3D,
  type PerspectiveCamera,
  PointLight,
  SpotLight,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import {
  DoubleSide,
  type MeshBasicNodeMaterial,
  type Node,
} from "three/webgpu";
import { atan, exp, float, Fn, uniform, vec3 } from "three/tsl";
import {
  AEROSOL_ALBEDO,
  AEROSOL_ASYMMETRY,
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
  transmission,
  write_scene_fog,
  type Extinction,
  type Flight,
  type GlareUniforms,
  type Observer,
  type SceneBackdrop,
} from "@aeronautic/core";
import {
  beam_half_angles,
  beam_intensity,
  beam_range,
  LAMP,
  type Lamp,
} from "./beam";
import {
  create_beam_geometry,
  create_beam_material,
  create_beam_uniforms,
  type BeamUniforms,
} from "./beam-material";
import { ANTICOLLISION_VERTICAL, flash_at } from "./flash";
import { navigation_intensity, piecewise } from "./navigation";
import {
  default_anticollision,
  default_light_switches,
  default_lights_air,
  default_lights_illuminate,
  default_lights_look,
  default_navigation,
  resolve_lights_quality,
  type AntiCollisionDials,
  type AntiCollisionLight,
  type BeamLight,
  type LightMount,
  type LightsAir,
  type LightsIlluminate,
  type LightsLook,
  type LightsQuality,
  type LightsQualityName,
  type LightsSwitches,
  type NavigationDials,
  type NavigationLight,
} from "./types";

// One aircraft's lights
//
// Everything is worked out on the CPU, a handful of lights a frame: where
// each light is, which way the camera is from it in the aircraft's axes,
// how much light the rule or the lamp sends that way, how much of it the
// air lets through, and so how much reaches the eye. The GPU only spreads
// that over the screen, as the eye's glare, and sums the beams' light in
// the air. What lights the scene is three's own lights, driven from the
// same numbers

/** The faintest luminance worth drawing, in the scene's units: 10 bits' step */
const FLOOR = 1 / 1024;

/**
 * How far in front of a light the scene may be and leave it seen: its lens
 * stands a few centimetres proud of what it sits on
 */
const LENS_M = 0.05;

/** A lamp's lens radius: a PAR-64's face is 20 cm across */
const LAMP_LENS_M = 0.1;

/** The gear counts as down, for a lamp on it, at this much of its travel */
const GEAR_DOWN = 0.999;

/** The longest a beam's hull is drawn, metres */
const MAX_BEAM_M = 20_000;

/**
 * Where the aircraft's frame sits on the group, and which way it faces.
 */
export type LightsFrame = {
  /** Its origin, in the group's frame */
  position?: readonly [number, number, number];

  /** Which way the aircraft flies, in the group's frame. By default -Z */
  forward?: readonly [number, number, number];

  /** Which way is up for it. By default +Y */
  up?: readonly [number, number, number];
};

/**
 * Where the lights are on the airframe.
 */
export type LightsAirframe = {
  navigation: readonly NavigationLight[];
  anticollision: readonly AntiCollisionLight[];
  beams: readonly BeamLight[];
};

/**
 * How one aircraft's lights are set up. Every group over its defaults.
 */
export type LightsOptions = {
  /** Where the lights are */
  airframe?: Partial<LightsAirframe>;

  /** Which are on */
  switches?: Partial<LightsSwitches>;

  navigation?: Partial<NavigationDials>;
  anticollision?: Partial<AntiCollisionDials>;
  air?: Partial<LightsAir>;
  look?: Partial<LightsLook>;
  illuminate?: Partial<LightsIlluminate>;

  /** The landing gear, 0 up to 1 down: a lamp on it lights only when down */
  gear?: number;

  frame?: LightsFrame;

  /** How finely the beams are drawn: a preset's name, or the fields */
  quality?: LightsQualityName | Partial<LightsQuality>;

  /**
   * The opaque scene drawn in a pass of its own, as core's `volume_pass`
   * sets up: put `volumes` in `pass.scene` and give `pass.backdrop` here
   */
  backdrop?: SceneBackdrop;

  /**
   * A shared flight to read the altitude, the air's density and the gear
   * from, every frame. What it gives wins over `air` and `gear`
   */
  source?: Flight | null;
};

type Rgb = readonly [number, number, number];

/** A light as placed, with what it is drawn with */
type Placed = {
  at: LightMount;
  color: Rgb;

  /** Lighting the scene, if asked to */
  point: PointLight | SpotLight | null;
};

type PlacedNavigation = Placed & NavigationLight;

type PlacedFlash = Placed & {
  red: boolean;
  phaseS: number;

  /** Its brightness now, as a share of its effective intensity */
  level: number;
};

type PlacedBeam = Placed & {
  lamp: Lamp;
  switch: "landing" | "taxi";
  onGear: boolean;
  direction: readonly [number, number, number] | null;
  target: Object3D;
  mesh: Mesh<BufferGeometry, MeshBasicNodeMaterial>;
  uniforms: BeamUniforms;
  tangent: { value: number };
  inverse: { value: Vector2 };
  on: boolean;

  /** Its axes in the world, as last placed */
  along: Vector3;
  across: Vector3;
  up: Vector3;
};

const scratch_matrix = new Matrix4();
const scratch_position = new Vector3();
const scratch_camera = new Vector3();
const scratch_vector = new Vector3();
const scratch_view = new Vector3();
const scratch_u = new Vector3();
const scratch_v = new Vector3();
const scratch_transmission: [number, number, number] = [0, 0, 0];
const scratch_rgb: [number, number, number] = [0, 0, 0];

/**
 * Whether a mount is a position rather than a node.
 * @param at The mount
 * @returns Whether it is three numbers
 */
const is_position = (at: LightMount): at is readonly [number, number, number] =>
  !(at instanceof Object3D);

/**
 * A vector from three numbers.
 * @param target Where to write it
 * @param xyz The numbers
 * @returns target
 */
const set_vector = (target: Vector3, xyz: readonly [number, number, number]) =>
  target.set(xyz[0], xyz[1], xyz[2]);

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
 * A lamp by name, or as given.
 * @param lamp The name or the numbers
 * @returns The numbers
 */
const resolve_lamp = (lamp?: BeamLight["lamp"]): Lamp =>
  typeof lamp === "string" ? LAMP[lamp] : (lamp ?? LAMP.landing);

/**
 * One aircraft's lights: its position lights over their arcs, its beacons
 * and strobes flashing, its landing and taxi lights' beams, each seen with
 * the glare the eye gives it, through the day's air.
 *
 * Add `lights.group` to the aircraft's model, and `lights.volumes` to the
 * scene, or to a volume pass's scene. It needs three's `WebGPURenderer`
 * (either backend) and reads the scene's depth, so a light hidden behind
 * the airframe has no glare.
 */
export class Lights {
  /** Goes in the aircraft: the glare, and the lights lighting the scene */
  readonly group: Group;

  /** Goes in the scene, or a volume pass's: the beams' light in the air */
  readonly volumes: Group;

  /** The glare's mesh. Its `userData.lights` is this */
  readonly glare: Mesh<BufferGeometry, MeshBasicNodeMaterial>;

  /** How fast its clock runs, one being real time */
  timeScale = 1;

  /** A shared flight, read every frame. null lights only what is written */
  source: Flight | null;

  private _airframe: LightsAirframe;
  private _switches: LightsSwitches;
  private _navigation: NavigationDials;
  private _anticollision: AntiCollisionDials;
  private _air: LightsAir;
  private _look: LightsLook;
  private _illuminate: LightsIlluminate;
  private _quality: LightsQuality;
  private _gear: number;

  private readonly _frame = new Matrix4();
  private _frame_options: LightsFrame = {};
  private readonly _forward = new Vector3(0, 0, -1);
  private readonly _backdrop: SceneBackdrop | undefined;

  private readonly _glare_uniforms: GlareUniforms;
  private readonly _beam_geometry = create_beam_geometry();

  private _navigation_lights: PlacedNavigation[] = [];
  private _flash_lights: PlacedFlash[] = [];
  private _beam_lights: PlacedBeam[] = [];

  private _extinction: Extinction = extinction(23_000);
  private _density = 1;
  private _scattered = 0;

  // The aircraft's axes in the world: aft, up and left
  private readonly _aft = new Vector3(1, 0, 0);
  private readonly _up = new Vector3(0, 1, 0);
  private readonly _left = new Vector3(0, 0, 1);

  private _time_s = 0;
  private _delta_s = 0;
  private _frame_number = -1;
  private _last_ms = -1;

  private _read_from: Flight | null = null;
  private _read_version = -1;

  constructor(options: LightsOptions = {}) {
    this._airframe = {
      navigation: [],
      anticollision: [],
      beams: [],
      ...options.airframe,
    };
    this._switches = { ...default_light_switches(), ...options.switches };
    this._navigation = { ...default_navigation(), ...options.navigation };
    this._anticollision = {
      ...default_anticollision(),
      ...options.anticollision,
    };
    this._air = { ...default_lights_air(), ...options.air };
    this._look = { ...default_lights_look(), ...options.look };
    this._illuminate = {
      ...default_lights_illuminate(),
      ...options.illuminate,
    };
    this._quality = resolve_lights_quality(options.quality);
    this._gear = options.gear ?? 1;

    this.source = options.source ?? null;
    this._backdrop = options.backdrop;

    this.group = new Group();
    this.group.name = "Lights";
    this.group.userData.lights = this;

    this.volumes = new Group();
    this.volumes.name = "LightsVolumes";

    this._glare_uniforms = create_glare_uniforms();

    const glare = new Mesh(
      create_glare_geometry(0),
      create_glare_material(this._glare_uniforms),
    );

    glare.name = "LightsGlare";
    glare.userData.lights = this;
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
    this.writeLook();
    this.writeAir();
    this.rebuild();
  }

  get airframe(): Readonly<LightsAirframe> {
    return this._airframe;
  }

  get switches(): Readonly<LightsSwitches> {
    return this._switches;
  }

  get navigation(): Readonly<NavigationDials> {
    return this._navigation;
  }

  get anticollision(): Readonly<AntiCollisionDials> {
    return this._anticollision;
  }

  get air(): Readonly<LightsAir> {
    return this._air;
  }

  get look(): Readonly<LightsLook> {
    return this._look;
  }

  get illuminate(): Readonly<LightsIlluminate> {
    return this._illuminate;
  }

  /** The landing gear, 0 up to 1 down */
  get gear(): number {
    return this._gear;
  }

  /** The air's extinction now, per metre at 680, 550 and 440 nm */
  get extinction(): Readonly<Extinction> {
    return this._extinction;
  }

  /**
   * Change where the lights are, and keep the rest. Rebuilds them.
   * @param airframe What to change
   */
  updateAirframe(airframe: Partial<LightsAirframe>) {
    if (unchanged(this._airframe, airframe)) return;

    this._airframe = { ...this._airframe, ...airframe };
    this.rebuild();
  }

  /**
   * Turn lights on or off.
   * @param switches What to change
   */
  updateSwitches(switches: Partial<LightsSwitches>) {
    if (unchanged(this._switches, switches)) return;

    this._switches = { ...this._switches, ...switches };
  }

  /**
   * Change some of the position lights' dials.
   * @param navigation What to change
   */
  updateNavigation(navigation: Partial<NavigationDials>) {
    if (unchanged(this._navigation, navigation)) return;

    this._navigation = { ...this._navigation, ...navigation };
    this.writeColors();
  }

  /**
   * Change some of the anti-collision lights' dials.
   * @param anticollision What to change
   */
  updateAntiCollision(anticollision: Partial<AntiCollisionDials>) {
    if (unchanged(this._anticollision, anticollision)) return;

    this._anticollision = { ...this._anticollision, ...anticollision };
    this.writeColors();
  }

  /**
   * Change some of the day and keep the rest.
   * @param air What to change
   */
  updateAir(air: Partial<LightsAir>) {
    if (unchanged(this._air, air)) return;

    this._air = { ...this._air, ...air };
    this.writeAir();
  }

  /**
   * Change some of the look and keep the rest.
   * @param look What to change
   */
  updateLook(look: Partial<LightsLook>) {
    if (unchanged(this._look, look)) return;

    this._look = { ...this._look, ...look };
    this.writeLook();
    this.writeAir();
  }

  /**
   * Change which lights light the scene. Rebuilds three's lights.
   * @param illuminate What to change
   */
  updateIlluminate(illuminate: Partial<LightsIlluminate>) {
    if (unchanged(this._illuminate, illuminate)) return;

    this._illuminate = { ...this._illuminate, ...illuminate };
    this.rebuild();
  }

  /**
   * Move the landing gear, for the lamps on it.
   * @param gear 0 up to 1 down
   */
  setGear(gear: number) {
    this._gear = gear;
  }

  /**
   * Change how finely the beams are drawn. Rebuilds their materials.
   * @param quality A preset's name, or the fields, over `high`
   */
  setQuality(quality?: LightsQualityName | Partial<LightsQuality>) {
    const next = resolve_lights_quality(quality);

    if (unchanged(this._quality, next)) return;

    this._quality = next;
    this.rebuild();
  }

  /**
   * Move the aircraft's frame on the group.
   * @param frame Its origin, and which ways are forward and up
   */
  setFrame(frame: LightsFrame) {
    this._frame_options = frame;
    this._frame.copy(canonical_frame(frame));
    this._forward.setFromMatrixColumn(this._frame, 0).negate().normalize();
  }

  /** The aircraft's frame on the group, as last set */
  get frameOptions(): Readonly<LightsFrame> {
    return this._frame_options;
  }

  /** Free the GPU resources and three's lights. It cannot be used afterwards */
  dispose() {
    this.clear();
    this.group.removeFromParent();
    this.volumes.removeFromParent();
    this.glare.geometry.dispose();
    this.glare.material.dispose();
    this._beam_geometry.dispose();
  }

  /** Take every light down */
  private clear() {
    for (const light of [
      ...this._navigation_lights,
      ...this._flash_lights,
      ...this._beam_lights,
    ]) {
      light.point?.removeFromParent();
      light.point?.dispose();
    }

    for (const beam of this._beam_lights) {
      beam.target.removeFromParent();
      beam.mesh.removeFromParent();
      beam.mesh.material.dispose();
    }

    this._navigation_lights = [];
    this._flash_lights = [];
    this._beam_lights = [];
  }

  /**
   * Hang a three light on its mount: on the node, or in the group where the
   * position says.
   * @param light The light
   * @param at Its mount
   */
  private hang(light: Object3D, at: LightMount) {
    if (is_position(at)) {
      set_vector(light.position, at);
      this.group.add(light);
    } else {
      light.position.set(0, 0, 0);
      at.add(light);
    }
  }

  /** Make every light again, for the airframe, the quality and what lights */
  private rebuild() {
    this.clear();

    const illuminate = this._illuminate;

    this._navigation_lights = this._airframe.navigation.map((light) => {
      const point = illuminate.navigation ? new PointLight(0xffffff, 0) : null;

      if (point) this.hang(point, light.at);

      return { ...light, color: [1, 1, 1], point };
    });

    this._flash_lights = this._airframe.anticollision.map((light) => {
      const point = illuminate.anticollision
        ? new PointLight(0xffffff, 0)
        : null;

      if (point) this.hang(point, light.at);

      return {
        at: light.at,
        red: (light.color ?? "red") === "red",
        phaseS: light.phaseS ?? 0,
        level: 0,
        color: [1, 1, 1],
        point,
      };
    });

    this._beam_lights = this._airframe.beams.map((light) => {
      const lamp = resolve_lamp(light.lamp);
      const uniforms = create_beam_uniforms();
      const mesh = new Mesh(
        this._beam_geometry,
        create_beam_material({
          uniforms,
          steps: this._quality.steps,
          backdrop: this._backdrop,
        }),
      );

      mesh.name = "LightsBeam";
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      mesh.renderOrder = 1;
      this.volumes.add(mesh);

      // Where it points: a node's -Z, or forward, unless told
      const target = new Object3D();
      const direction = light.direction ?? null;

      if (is_position(light.at)) {
        set_vector(target.position, light.at).add(
          direction
            ? set_vector(scratch_vector, direction).normalize()
            : this._forward,
        );
        this.group.add(target);
      } else {
        set_vector(target.position, direction ?? [0, 0, -1]);
        light.at.add(target);
      }

      const tangent = uniform(1) as unknown as { value: number };
      const inverse = uniform(new Vector2(1, 1)) as unknown as {
        value: Vector2;
      };

      let point: SpotLight | null = null;

      if (illuminate.beams) {
        point = new SpotLight(0xffffff, 0, 0, Math.PI / 4, 0, 2);
        point.target = target;

        // Its shadow camera is only the frame its pattern is laid in: wide
        // open from the lens to past any scene
        point.shadow.camera.near = 0.05;
        point.shadow.camera.far = 1e5;
        point.shadow.camera.updateProjectionMatrix();

        // The beam's Gaussian, across and up, read from where the shadow
        // camera, as wide as the cone, lays each point
        const t = tangent as unknown as Node<"float">;
        const k = inverse as unknown as Node<"vec2">;

        // three calls it with where the point is in that frame, 0 to 1
        // across and up, and asks it for a cache key: a TSL function
        (point as SpotLight & { colorNode: unknown }).colorNode = Fn(
          ([coord]: [Node<"vec3">]) => {
            const across = atan(coord.x.mul(2).sub(1).mul(t)).mul(k.x);
            const up = atan(coord.y.mul(2).sub(1).mul(t)).mul(k.y);

            return vec3(
              exp(
                across
                  .mul(across)
                  .add(up.mul(up))
                  .mul(float(-Math.log(10))),
              ),
            );
          },
        );

        this.hang(point, light.at);
      }

      return {
        at: light.at,
        lamp,
        switch: light.switch ?? (light.lamp === "taxi" ? "taxi" : "landing"),
        onGear: light.onGear ?? false,
        direction,
        target,
        mesh,
        uniforms,
        tangent,
        inverse,
        on: false,
        color: [1, 1, 1],
        point,
        along: new Vector3(0, 0, -1),
        across: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
      } satisfies PlacedBeam;
    });

    for (const beam of this._beam_lights) {
      beam.mesh.onBeforeRender = (renderer, scene, camera) =>
        this.drawBeam(beam, renderer as unknown as Renderer, scene, camera);
    }

    const count =
      this._navigation_lights.length +
      this._flash_lights.length +
      this._beam_lights.length;
    const previous = this.glare.geometry;

    this.glare.geometry = create_glare_geometry(count);
    previous.dispose();

    this.writeColors();
    this.writeAir();
  }

  /** Each light's colour, from its chromaticity or its temperature */
  private writeColors() {
    const navigation = this._navigation;
    const anticollision = this._anticollision;
    const white = chromaticity_rgb(planckian(navigation.whiteTemperatureK));

    for (const light of this._navigation_lights) {
      light.color =
        light.side === "left"
          ? chromaticity_rgb(navigation.red)
          : light.side === "right"
            ? chromaticity_rgb(navigation.green)
            : white;
    }

    const flash_white = chromaticity_rgb(
      planckian(anticollision.whiteTemperatureK),
    );

    for (const light of this._flash_lights) {
      light.color = light.red
        ? chromaticity_rgb(anticollision.red)
        : flash_white;
    }

    for (const beam of this._beam_lights) {
      beam.color = chromaticity_rgb(planckian(beam.lamp.temperatureK));
    }

    for (const light of [...this._navigation_lights, ...this._flash_lights]) {
      light.point?.color.setRGB(...light.color);
    }

    for (const beam of this._beam_lights) {
      beam.point?.color.setRGB(...beam.color);
    }
  }

  /** The eye's glare, for the observer */
  private writeLook() {
    const observer = this.observer();

    this._scattered = glare_scattered(observer);
    this._glare_uniforms.age.value = 1 + (observer.ageYears / 62.5) ** 4;
    this._glare_uniforms.pigmentation.value = observer.pigmentation;
  }

  /** The air's extinction, and the beams' cones for it */
  private writeAir() {
    const density = this.source
      ? this._density
      : density_ratio(this._air.altitudeM);

    this._extinction = extinction(this._air.visibilityM, density);

    const floor = FLOOR / Math.max(this._look.exposure, 1e-12);

    for (const beam of this._beam_lights) {
      const u = beam.uniforms;
      const range = beam_range(beam.lamp, this._extinction, floor);

      // A ray past the lamp at h collects at most I share β p π / h of its
      // light, and passes no nearer than the lens: outside the share where
      // that is below the floor, at the lens, there is nothing to draw
      const [across, up] = beam_half_angles(
        beam.lamp,
        LAMP_LENS_M / (Math.PI * Math.max(range, 1e-6)),
      );
      const length = Math.min(Math.max(range, 1), MAX_BEAM_M);

      u.tangents.value.set(Math.tan(across), Math.tan(up));
      u.length.value = length;
      u.inverse.value.set(
        360 / (beam.lamp.spreadDeg[0] * Math.PI),
        360 / (beam.lamp.spreadDeg[1] * Math.PI),
      );
      u.rayleigh.value.fromArray(this._extinction.rayleigh);
      u.aerosol.value.fromArray(this._extinction.aerosol);
      u.albedo.value = AEROSOL_ALBEDO;
      u.asymmetry.value = AEROSOL_ASYMMETRY;
      u.lensM.value = LAMP_LENS_M;

      // The spot light as wide as the cone, its pattern the Gaussian
      const angle = Math.max(across, up);

      beam.tangent.value = Math.tan(angle);
      beam.inverse.value.copy(u.inverse.value);

      if (beam.point) (beam.point as SpotLight).angle = angle;
    }
  }

  /** The observer the glare is for */
  private observer(): Observer {
    return {
      ageYears: this._look.ageYears,
      pigmentation: this._look.pigmentation,
    };
  }

  /**
   * Take the altitude, the air's density and the gear from the shared
   * flight, if it changed.
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

    this._gear = values.gear;

    if (
      values.densityRatio !== this._density ||
      values.altitudeM !== this._air.altitudeM
    ) {
      this._density = values.densityRatio;
      this._air = { ...this._air, altitudeM: values.altitudeM };
      this.writeAir();
    }
  }

  /**
   * Where a mount is in the world now.
   * @param at The mount
   * @param target Where to write it
   * @returns target
   */
  private mountPosition(at: LightMount, target: Vector3): Vector3 {
    if (is_position(at)) {
      return set_vector(target, at).applyMatrix4(this.group.matrixWorld);
    }

    return target.setFromMatrixPosition(at.matrixWorld);
  }

  /** The aircraft's axes in the world, from the group and the frame */
  private placeAxes() {
    scratch_matrix.multiplyMatrices(this.group.matrixWorld, this._frame);
    this._aft.setFromMatrixColumn(scratch_matrix, 0).normalize();
    this._up.setFromMatrixColumn(scratch_matrix, 1).normalize();
    this._left.setFromMatrixColumn(scratch_matrix, 2).normalize();
  }

  /**
   * Where each beam points now, and its frame: across level with the
   * aircraft's wings, up square to it.
   * @param beam The beam
   */
  private placeBeam(beam: PlacedBeam) {
    if (is_position(beam.at)) {
      beam.along
        .copy(
          beam.direction
            ? set_vector(scratch_vector, beam.direction)
            : this._forward,
        )
        .transformDirection(this.group.matrixWorld);
    } else {
      set_vector(beam.along, beam.direction ?? [0, 0, -1]).transformDirection(
        beam.at.matrixWorld,
      );
    }

    beam.across.crossVectors(this._up, beam.along);

    if (beam.across.lengthSq() < 1e-8) {
      beam.across.crossVectors(this._aft, beam.along);
    }

    beam.across.normalize();
    beam.up.crossVectors(beam.along, beam.across).normalize();
  }

  /**
   * The clock and everything that follows it, once a frame however many
   * cameras draw the lights.
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

    const switches = this._switches;
    const look = this._look;
    const exposure = look.exposure;
    const anticollision = this._anticollision;
    const period = 60 / Math.max(anticollision.flashesPerMinute, 1e-3);

    this.placeAxes();

    for (const light of this._flash_lights) {
      light.level = switches.anticollision
        ? flash_at(
            anticollision.pulse,
            period,
            this._time_s - light.phaseS,
            look.perception,
            Math.max(this._delta_s, 1e-3),
          )
        : 0;

      if (light.point) {
        light.point.intensity =
          anticollision.effectiveCd * light.level * exposure;
      }
    }

    // A position light lights what is round it by its intensity at the
    // middle of its own angle
    for (const light of this._navigation_lights) {
      if (!light.point) continue;

      const middle =
        light.side === "left" ? 55 : light.side === "right" ? -55 : 180;

      light.point.intensity = switches.navigation
        ? navigation_intensity(
            light.side,
            middle,
            0,
            this._navigation.scale,
            this._navigation.spill,
          ) * exposure
        : 0;
    }

    for (const beam of this._beam_lights) {
      beam.on =
        switches[beam.switch] && (!beam.onGear || this._gear >= GEAR_DOWN);
      beam.mesh.visible = beam.on;

      const peak = beam.on ? beam.lamp.peakCd * exposure : 0;

      beam.uniforms.intensity.value.set(
        beam.color[0] * peak,
        beam.color[1] * peak,
        beam.color[2] * peak,
      );

      const spot = beam.point as SpotLight | null;

      if (spot) {
        spot.intensity = peak;

        // Its pattern laid level with the wings
        this.placeBeam(beam);
        spot.shadow.camera.up.copy(beam.up);
      }
    }
  }

  /**
   * Lay a beam's hull, just before it is drawn.
   * @param beam The beam
   * @param renderer The renderer
   * @param scene The scene, for its fog
   * @param camera The camera
   */
  private drawBeam(
    beam: PlacedBeam,
    renderer: Renderer,
    scene: Object3D,
    camera: Camera,
  ) {
    this.tick(renderer);
    this.placeAxes();
    this.placeBeam(beam);

    const u = beam.uniforms;
    const origin = this.mountPosition(beam.at, u.origin.value);
    const length = u.length.value;

    u.along.value.copy(beam.along);
    u.across.value.copy(beam.across);
    u.up.value.copy(beam.up);

    beam.mesh.matrixWorld
      .makeBasis(
        scratch_u.copy(beam.across).multiplyScalar(u.tangents.value.x * length),
        scratch_v.copy(beam.up).multiplyScalar(u.tangents.value.y * length),
        scratch_vector.copy(beam.along).multiplyScalar(length),
      )
      .setPosition(origin);

    write_scene_fog(u.fog, scene);

    void camera;
  }

  /**
   * How much light a light sends towards a point now.
   * @param index Which light, navigation first, then flashes, then beams
   * @param position Where the light is in the world
   * @param towards The point
   * @returns Candela
   */
  private intensityTowards(
    index: number,
    position: Vector3,
    towards: Vector3,
  ): number {
    const to = scratch_vector.subVectors(towards, position);
    const distance = Math.max(to.length(), 1e-6);

    to.divideScalar(distance);

    const navigation = this._navigation_lights.length;
    const flashes = this._flash_lights.length;

    if (index < navigation + flashes) {
      // In the aircraft's axes: azimuth from dead ahead, to the left, and
      // elevation
      const aft = to.dot(this._aft);
      const up = to.dot(this._up);
      const left = to.dot(this._left);
      const elevation =
        (Math.asin(Math.min(Math.max(up, -1), 1)) * 180) / Math.PI;

      if (index < navigation) {
        if (!this._switches.navigation) return 0;

        const light = this._navigation_lights[index];
        const azimuth = (Math.atan2(left, -aft) * 180) / Math.PI;

        return navigation_intensity(
          light.side,
          azimuth,
          elevation,
          this._navigation.scale,
          this._navigation.spill,
        );
      }

      const light = this._flash_lights[index - navigation];

      return (
        this._anticollision.effectiveCd *
        piecewise(ANTICOLLISION_VERTICAL, Math.abs(elevation)) *
        light.level
      );
    }

    const beam = this._beam_lights[index - navigation - flashes];

    if (!beam.on) return 0;

    this.placeBeam(beam);

    return beam_intensity(
      beam.lamp,
      to.dot(beam.across),
      to.dot(beam.up),
      to.dot(beam.along),
    );
  }

  /**
   * Lay every light's glare for this camera, just before it is drawn.
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
    const lights = [
      ...this._navigation_lights,
      ...this._flash_lights,
      ...this._beam_lights,
    ];

    if (!camera.isPerspectiveCamera || lights.length === 0) {
      geometry.setDrawRange(0, 0);

      return;
    }

    this.placeAxes();

    const view = camera.matrixWorldInverse;
    const exposure = this._look.exposure;
    const observer = this.observer();
    const fog = (scene as { fog?: Parameters<typeof fog_factor>[0] }).fog;
    const pixel = glare_pixel(renderer, camera);

    // Its own disc: 0.1°, or a pixel if that is wider, carrying what the eye
    // does not scatter
    const core = Math.max((0.1 * Math.PI) / 180, pixel);
    const core_luminance =
      (1 - this._scattered) / (2 * Math.PI * (1 - Math.cos(core)));

    scratch_camera.setFromMatrixPosition(camera.matrixWorld);

    for (let index = 0; index < lights.length; index++) {
      const light = lights[index];
      const world = this.mountPosition(light.at, scratch_position);
      const intensity = this.intensityTowards(index, world, scratch_camera);
      const distance = Math.max(world.distanceTo(scratch_camera), 1e-3);

      scratch_view.copy(world).applyMatrix4(view);

      const depth = -scratch_view.z;
      const kept = 1 - fog_factor(fog ?? null, Math.max(depth, 0));

      transmission(this._extinction, distance, scratch_transmission);

      const scale = (intensity * kept * exposure) / (distance * distance);

      scratch_rgb[0] = light.color[0] * scratch_transmission[0] * scale;
      scratch_rgb[1] = light.color[1] * scratch_transmission[1] * scale;
      scratch_rgb[2] = light.color[2] * scratch_transmission[2] * scale;

      const brightest = Math.max(...scratch_rgb);

      if (!(brightest > 0)) {
        hide_glare(geometry, index);
        continue;
      }

      lay_glare(geometry, index, camera, {
        view: scratch_view,
        rgb: scratch_rgb,
        core,
        coreLuminance: core_luminance,
        radius: (glare_radius(brightest, FLOOR, observer) * Math.PI) / 180,
        bias: LENS_M + 2 * pixel * distance,
      });
    }

    glare_laid(geometry, lights.length);
  }
}

/** What of the renderer the lights read */
type Renderer = {
  info: { frame: number };
  getDrawingBufferSize: (target: Vector2) => Vector2;
};
