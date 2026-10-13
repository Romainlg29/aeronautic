import {
  BufferGeometry,
  type Camera,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Mesh,
  type PerspectiveCamera,
  Vector3,
} from "three";
import { attribute, vec4 } from "three/tsl";
import { chromaticity_rgb, planckian } from "@aeronautic/core";
import {
  CustomBlending,
  DoubleSide,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
} from "three/webgpu";
import { empty_column } from "./diagnose";
import { flash_power, LIGHTNING_EFFICACY } from "./lightning";
import { look_lux } from "./types";
import type { Weather } from "./weather";

// The flashes' channels, where they are seen: under the cloud
//
// A channel is a line of light: a stroke's power, spread along it by each
// segment's weight, q watts a metre. Every way alike, a metre of it gives
// q / 4π watts a steradian, and seen across a width w its radiance is
// q / (4π w). Its hot core is centimetres across (Rakov and Uman 2003),
// far less than a pixel: it is drawn a pixel wide, w the pixel's footprint
// at its distance, and as bright as a pixel's share of it. Inside the cloud
// its light is the cloud's, the clouds' shader lighting it from within; only
// the channel under the base, in clear air, is drawn. Each is a ribbon
// facing the camera, laid on the CPU each frame a flash is alight

/** The most segments drawn at once */
export const BOLT_SEGMENTS = 2048;

// Two triangles a segment
const VERTICES = 6;

// The channel's width, metres, if the pixel is narrower: its core's few
// centimetres, with the hot air about it. An estimate
const CHANNEL_M = 0.1;

// The channel's colour: a continuum near 20 000 K under its lines of
// nitrogen and oxygen (Orville 1968), taken as the blackbody's, at a
// luminance of one
const CHANNEL_RGB = chromaticity_rgb(planckian(20_000));

const a = new Vector3();
const b = new Vector3();
const eye = new Vector3();
const along = new Vector3();
const across = new Vector3();
const view = new Vector3();

/**
 * The flashes' channels, as a mesh: add it where the effects are drawn, and
 * call `update` every frame.
 */
export class Bolts extends Mesh<BufferGeometry, MeshBasicNodeMaterial> {
  readonly weather: Weather;
  #column = empty_column();

  /**
   * @param weather The weather whose lightning it draws
   */
  constructor(weather: Weather) {
    const geometry = new BufferGeometry();

    for (const name of ["position", "color"]) {
      const values = new Float32BufferAttribute(
        new Float32Array(BOLT_SEGMENTS * VERTICES * 3),
        3,
      );

      values.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, values);
    }

    geometry.setDrawRange(0, 0);

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      // Each ribbon is wound by which way its segment runs: a stroke runs
      // down, and would face away
      side: DoubleSide,
    });

    // Added over what is behind: light, hiding nothing
    material.fragmentNode = vec4(
      attribute("color", "vec3") as unknown as Node<"vec3">,
      0,
    );
    material.blending = CustomBlending;
    material.blendSrc = OneFactor;
    material.blendDst = OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = OneFactor;
    material.blendDstAlpha = OneMinusSrcAlphaFactor;

    super(geometry, material);

    this.weather = weather;
    this.name = "weather.bolts";
    this.frustumCulled = false;
    this.matrixAutoUpdate = false;
  }

  /**
   * Lay the channels alight now, facing a camera.
   * @param camera The camera
   * @param height_px The frame's height, pixels
   */
  update(camera: Camera, height_px: number): void {
    const { weather } = this;
    const geometry = this.geometry;
    const positions = geometry.getAttribute("position").array as Float32Array;
    const colors = geometry.getAttribute("color").array as Float32Array;
    const projection = (camera as PerspectiveCamera).projectionMatrix;
    const pixel = 2 / (projection.elements[5] * Math.max(height_px, 1));
    const scale =
      LIGHTNING_EFFICACY * look_lux(weather.look) * weather.look.exposure;

    eye.setFromMatrixPosition(camera.matrixWorld);

    let count = 0;

    for (const flash of weather.lightning.flashes) {
      if (flash.kind !== "ground") continue;

      const power = flash_power(flash, weather.time);

      if (power <= 0) continue;

      const { points, segments, weights } = flash;

      // The power a metre of weight: each segment its weight's share
      let weighted = 0;

      for (let s = 0; s < weights.length; s++) {
        const i = segments[2 * s] * 3;
        const j = segments[2 * s + 1] * 3;

        weighted +=
          weights[s] *
          Math.hypot(
            points[j] - points[i],
            points[j + 1] - points[i + 1],
            points[j + 2] - points[i + 2],
          );
      }

      const per_metre = power / Math.max(weighted, 1);

      for (let s = 0; s < weights.length && count < BOLT_SEGMENTS; s++) {
        const i = segments[2 * s] * 3;
        const j = segments[2 * s + 1] * 3;

        a.fromArray(weather.to_scene(points[i], points[i + 1], points[i + 2]));
        b.fromArray(weather.to_scene(points[j], points[j + 1], points[j + 2]));

        // Under the cloud only: inside it, the cloud's light is drawn
        const mid_x = (a.x + b.x) / 2;
        const mid_z = (a.z + b.z) / 2;
        const column = weather.column(mid_x, mid_z, this.#column);
        const top = Math.max(points[i + 1], points[j + 1]);

        if (column.cumulus > 0.05 && top > column.baseM) continue;

        along.subVectors(b, a);
        view.addVectors(a, b).multiplyScalar(0.5).sub(eye);

        const distance = view.length();
        const width = Math.max(distance * pixel, CHANNEL_M);

        across
          .crossVectors(along, view)
          .normalize()
          .multiplyScalar(width / 2);

        const radiance =
          (per_metre * weights[s] * scale) / (4 * Math.PI * width);
        const at = count * VERTICES * 3;
        const corners = [
          [a, -1],
          [a, 1],
          [b, 1],
          [a, -1],
          [b, 1],
          [b, -1],
        ] as const;

        for (let k = 0; k < VERTICES; k++) {
          const [p, side] = corners[k];

          positions[at + k * 3] = p.x + across.x * side;
          positions[at + k * 3 + 1] = p.y + across.y * side;
          positions[at + k * 3 + 2] = p.z + across.z * side;

          colors[at + k * 3] = radiance * CHANNEL_RGB[0];
          colors[at + k * 3 + 1] = radiance * CHANNEL_RGB[1];
          colors[at + k * 3 + 2] = radiance * CHANNEL_RGB[2];
        }

        count++;
      }
    }

    geometry.setDrawRange(0, count * VERTICES);

    if (count > 0) {
      geometry.getAttribute("position").needsUpdate = true;
      geometry.getAttribute("color").needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
