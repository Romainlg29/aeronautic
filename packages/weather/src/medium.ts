import type { SceneMedium } from "@aeronautic/core";
import { Color } from "three";
import type { Weather } from "./weather";

// How a cloud is lit, the same on the CPU and in the clouds' shader, and the
// cloud round the camera as the medium every effect is drawn in
//
// The sun's light through the cloud towards it, scattered once and many
// times. Once, by each scatterer's phase. Many times, as the diffuse light
// the cloud holds, by Eddington's two-stream: a cloud of optical depth τ
// reflects R = 1 − T(τ) of the light on it, T(τ) = 1 / (1 + ¾ (1 − g) τ),
// near all of it for a thick cumulus, and a diffuse light of flux E has a
// radiance E / π. Through τₛ of cloud towards the sun, T(τₛ) of it is left,
// so the light scattered many times at a point is E R T(τₛ) / π, less the
// first scattering's mean, E e^(−τₛ) / 4π, counted by its phase. The top of
// a thick cloud is then as bright as a white surface under the sun, and a
// wisp as faint as its few scatterings. The sky and the ground, each half
// the sphere, come through the cloud over and under the same way.
//
// Inside a cloud, the effects are drawn in it: light from d away comes
// through as e^(−σ d), and the rest is the cloud's own, the light it
// scatters per its extinction there. Seen from inside it comes from every
// way, so its phase is the mean, 1 / 4π

/** What a step in cloud keeps of its light: the droplets absorb next to none */
export const ALBEDO = 1;

/**
 * The droplets' asymmetry averaged over the visible, for the diffuse light:
 * about 0.85 (Hansen and Travis 1974)
 */
export const DIFFUSE_ASYMMETRY = 0.85;

/**
 * The light march: six steps, the first 30 m, each twice the last, so 1.9 km
 * of cloud towards the sun, the near cloud finely
 */
export const LIGHT_STEPS = 6;
export const LIGHT_FIRST_M = 30;

const ISOTROPIC = 1 / (4 * Math.PI);

/**
 * The share of a diffuse light a slab lets through: Eddington's two-stream,
 * 1 / (1 + ¾ (1 − g) τ).
 * @param depth Its optical depth
 * @returns 0 to 1
 */
export const diffuse = (depth: number): number =>
  1 / (1 + 0.75 * (1 - DIFFUSE_ASYMMETRY) * depth);

/**
 * The sun's light scattered many times at a point, per its extinction and
 * the sun's illuminance: the diffuse light the cloud holds, less the first
 * scattering's mean.
 * @param sun_depth The optical depth towards the sun
 * @param column_depth The optical depth of the cloud through the point
 * @returns Per steradian
 */
export const scattered_many = (
  sun_depth: number,
  column_depth: number,
): number =>
  Math.max(
    ((1 - diffuse(column_depth)) * diffuse(sun_depth)) / Math.PI -
      Math.exp(-sun_depth) * ISOTROPIC,
    0,
  );

/**
 * The cloud at a point of the scene as a medium: its extinction, and the
 * light it scatters per it, as its clouds draw it.
 * @param weather The weather
 * @param x The point, in the scene: the camera
 * @param y The point
 * @param z The point
 * @param out Where to write it
 * @returns out: no extinction outside the clouds and their rain
 */
export const weather_medium = (
  weather: Weather,
  x: number,
  y: number,
  z: number,
  out: SceneMedium = { extinction: 0, color: new Color() },
): SceneMedium => {
  const here = weather.sample(x, y, z);
  const { extinction, up, down } = here;

  out.extinction = extinction;
  out.light ??= new Color();

  if (extinction <= 0) {
    out.color.setRGB(0, 0, 0);
    out.light.setRGB(0, 0, 0);
    out.sunTransmittance = 1;

    return out;
  }

  const { look } = weather;
  const [sx, sy, sz] = look.sunDirection;
  const length = Math.hypot(sx, sy, sz) || 1;

  // The sun through the cloud towards it, in steps each twice the last
  let sun_depth = 0;
  let along = 0;

  for (let i = 0; i < LIGHT_STEPS; i++) {
    const size = LIGHT_FIRST_M * 2 ** i;
    const t = (along + size / 2) / length;

    sun_depth +=
      weather.sample(x + sx * t, y + sy * t, z + sz * t).extinction * size;
    along += size;
  }

  const transmitted = Math.exp(-sun_depth);

  // The beam's first scattering, and the rest: the sun's scattered many
  // times, the sky's and the ground's
  const beam = ISOTROPIC * transmitted * ALBEDO;
  const scattered = scattered_many(sun_depth, up + down) * ALBEDO;
  const sky = diffuse(up) * 0.5 * ALBEDO;
  const ground = diffuse(down) * 0.5 * ALBEDO;

  const diffused = (i: number) =>
    look.sun[i] * scattered + look.sky[i] * sky + look.ground[i] * ground;

  out.light.setRGB(diffused(0), diffused(1), diffused(2));
  out.sunTransmittance = transmitted;

  const scale = look.exposure;

  out.color.setRGB(
    (look.sun[0] * beam + diffused(0)) * scale,
    (look.sun[1] * beam + diffused(1)) * scale,
    (look.sun[2] * beam + diffused(2)) * scale,
  );

  return out;
};
