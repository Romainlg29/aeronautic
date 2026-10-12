import {
  BufferGeometry,
  type Camera,
  Float32BufferAttribute,
  Mesh,
  type PerspectiveCamera,
  Vector3,
} from "three";
import {
  attribute,
  cross,
  exp,
  float,
  log,
  select,
  smoothstep,
  uniform,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import {
  CustomBlending,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
} from "three/webgpu";
import { diffuse } from "./medium";
import { raindrops, rain_slope } from "./physics";
import type { Weather } from "./weather";

// The rain round the camera, as the streaks its drops draw
//
// A drop crosses the frame while it is exposed, and is seen as a streak along
// its path, as long as its speed past the camera times the exposure, as wide
// as itself or the pixel. It covers each point of the streak for its own
// width's share of the exposure, and each pixel of it for its own width's
// share of the pixel: its alpha is the two shares (Garg and Nayar 2007). So
// a whole box of them hides as much as their extinction says, ∫ N σ, and the
// rain is as dense round the camera as it is in the clouds' march.
//
// The drops are Marshall and Palmer's, each its size drawn from their
// exponential and falling at its speed (Atlas et al. 1973), the box's
// largest: the smaller far outnumber what is drawn and are seen only as the
// rain's haze, in the march. Each is a quad, laid by the GPU from a seed: the
// box wraps round the camera, the drops falling through it and the air
// carrying them

/** The drops drawn, at most */
export const RAIN_DROPS = 16_384;

/** The box of rain round the camera, metres a side. An estimate: the streaks seen */
export const RAIN_BOX_M = 30;

// The smallest drop drawn, mm: a smaller one's streak is too faint to see
const SMALLEST_MM = 0.5;

// A drop's radiance against the light round it: it refracts the whole sky
// into the eye, about as bright as its mean (Garg and Nayar 2007). An
// estimate
const DROP_RADIANCE = 1;

// Vertices a drop: two triangles
const VERTICES = 6;

type F = Node<"float">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;
type Uniform<T, N> = N & { value: T };

const f1 = (value = 0) => uniform(value) as unknown as Uniform<number, F>;
const v3 = () => uniform(new Vector3()) as unknown as Uniform<Vector3, V3>;

const eye = new Vector3();

/**
 * Seeded random numbers: mulberry32.
 */
const random = (seed: number): (() => number) => {
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
 * The rain's streaks round the camera, as a mesh: add it where the effects
 * are drawn, and call `update` every frame.
 */
export class RainStreaks extends Mesh<BufferGeometry, MeshBasicNodeMaterial> {
  readonly weather: Weather;

  /** How hard it rains at the camera, as of the last update, mm/h */
  rate = 0;

  #centre = v3();
  #drift = v3();
  #relative = v3();
  #color = v3();
  #fallen = f1();
  #exposure = f1(1 / 60);
  #slope = f1(1);
  #smallest = f1(SMALLEST_MM);
  #share = f1(0);
  #boost = f1(1);
  #pixel = f1(1e-3);

  #last = new Vector3();
  #had_last = false;

  /**
   * @param weather The weather whose rain it draws
   */
  constructor(weather: Weather) {
    const geometry = new BufferGeometry();
    const drops = new Float32Array(RAIN_DROPS * VERTICES * 4);
    const corners = new Float32Array(RAIN_DROPS * VERTICES * 3);
    const rng = random(0x7a1);
    const shape = [
      [0, -1],
      [0, 1],
      [1, 1],
      [0, -1],
      [1, 1],
      [1, -1],
    ];

    for (let i = 0; i < RAIN_DROPS; i++) {
      const seed = [rng(), rng(), rng(), rng()];
      const shown = rng();

      for (let k = 0; k < VERTICES; k++) {
        const v = i * VERTICES + k;

        drops.set(seed, v * 4);
        corners.set([shape[k][0], shape[k][1], shown], v * 3);
      }
    }

    // A position for the bounds; the GPU lays them
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        new Float32Array(RAIN_DROPS * VERTICES * 3),
        3,
      ),
    );
    geometry.setAttribute("drop", new Float32BufferAttribute(drops, 4));
    geometry.setAttribute("corner", new Float32BufferAttribute(corners, 3));

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    super(geometry, material);

    this.weather = weather;
    this.name = "weather.rain";
    this.frustumCulled = false;
    this.matrixAutoUpdate = false;
    this.visible = false;

    const drop = attribute("drop", "vec4") as unknown as V4;
    const corner = attribute("corner", "vec3") as unknown as V3;
    const box = RAIN_BOX_M;

    // Its size, from Marshall and Palmer's exponential past the smallest,
    // and its speed (Atlas et al. 1973)
    const diameter_mm = this.#smallest.sub(
      log(drop.w.oneMinus().max(1e-6)).div(this.#slope),
    );
    const speed = exp(diameter_mm.mul(-0.6)).mul(-10.3).add(9.65).max(0);

    // Where it is in the box round the camera
    const seeded = drop.xyz
      .mul(box)
      .add(this.#drift)
      .sub(vec3(0, speed.mul(this.#fallen), 0))
      .sub(this.#centre);
    const offset = seeded.div(box).fract().sub(0.5).mul(box).toVar();
    const head = this.#centre.add(offset);

    // Its streak: back along its path past the camera, over the exposure
    const velocity = this.#relative.sub(vec3(0, speed, 0)).toVar();
    const diameter = diameter_mm.div(1000);
    const distance = offset.length().max(0.1);
    const width = diameter.max(distance.mul(this.#pixel));
    const length = velocity.length().mul(this.#exposure).max(diameter);
    const across = cross(velocity, offset).normalize();
    const point = head
      .sub(velocity.mul(this.#exposure).mul(corner.x))
      .add(across.mul(width.mul(0.5).mul(corner.y)));

    // Its alpha: its width's share of the pixel and of the streak, faded
    // towards the box's faces, where it wraps
    const edge = offset.abs().max(offset.abs().yzx).max(offset.abs().zxy).x;
    const shown = corner.z.lessThan(this.#share);
    const alpha = diameter
      .div(width)
      .mul(diameter.div(length))
      .mul(this.#boost)
      .mul(smoothstep(box * 0.5, box * 0.35, edge))
      .min(1);

    material.positionNode = select(shown, point, this.#centre) as never;

    const a = varying(select(shown, alpha, float(0)) as F);

    material.fragmentNode = vec4(this.#color.mul(a), a) as never;
    material.blending = CustomBlending;
    material.blendSrc = OneFactor;
    material.blendDst = OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = OneFactor;
    material.blendDstAlpha = OneMinusSrcAlphaFactor;
  }

  /**
   * Lay the rain round a camera for the frame.
   * @param camera The camera
   * @param delta_s The frame's seconds
   * @param height_px The frame's height, pixels
   */
  update(camera: Camera, delta_s: number, height_px: number): void {
    const { weather } = this;

    eye.setFromMatrixPosition(camera.matrixWorld);

    const here = weather.sample(eye.x, eye.y, eye.z);
    const rate = here.inCloud ? 0 : here.rainMmPerH;

    this.rate = rate;
    this.visible = rate > 0.05;

    // The camera's own speed through the scene
    const dt = Math.max(delta_s, 1e-4);
    const moving = this.#had_last
      ? eye.clone().sub(this.#last).divideScalar(dt)
      : new Vector3();

    this.#last.copy(eye);
    this.#had_last = true;

    if (!this.visible) return;

    const volume = RAIN_BOX_M ** 3;
    const slope = rain_slope(rate);

    // The largest drops, as many as are drawn: the size past which there
    // are that many in the box, Marshall and Palmer's N0 / Λ e^(−ΛD)
    const all = raindrops(rate, 0) * volume;
    const smallest = Math.max(Math.log(all / RAIN_DROPS) / slope, SMALLEST_MM);
    const count = raindrops(rate, smallest) * volume;

    this.#slope.value = slope;
    this.#smallest.value = smallest;
    this.#share.value = Math.min(count / RAIN_DROPS, 1);
    this.#boost.value = Math.max(count / RAIN_DROPS, 1);

    // The air carries them past the scene's origin, which moves through it
    const [wx, wz] = weather.climate.wind;
    const [vx, vz] = weather.velocity;
    const drift = this.#drift.value;

    drift.x = (drift.x + (wx - vx) * delta_s) % RAIN_BOX_M;
    drift.z = (drift.z + (wz - vz) * delta_s) % RAIN_BOX_M;
    this.#fallen.value = (this.#fallen.value + delta_s) % 3600;

    // Their speed past the camera, less their fall
    this.#relative.value.set(wx - vx - moving.x, -moving.y, wz - vz - moving.z);
    this.#centre.value.copy(eye);
    this.#exposure.value = dt;
    this.#pixel.value =
      2 /
      ((camera as PerspectiveCamera).projectionMatrix.elements[5] *
        Math.max(height_px, 1));

    // The light round them: the sky's through the cloud over them, and the
    // ground's, each half the sphere
    let over = 0;
    const column = weather.column(eye.x, eye.z);
    const top = Math.max(
      column.cumulusTopM,
      column.stratusTopM,
      column.altoTopM,
    );
    const altitude = weather.origin[1] + eye.y;

    if (top > altitude) {
      const steps = 12;
      const size = (top - altitude) / steps;

      for (let i = 0; i < steps; i++) {
        over +=
          weather.sample(eye.x, eye.y + (i + 0.5) * size, eye.z).extinction *
          size;
      }
    }

    const { look } = weather;
    const sky = diffuse(over);

    this.#color.value
      .set(
        look.sky[0] * sky + look.ground[0],
        look.sky[1] * sky + look.ground[1],
        look.sky[2] * sky + look.ground[2],
      )
      .multiplyScalar(0.5 * DROP_RADIANCE * look.exposure);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
