import type { SceneMedium } from "@aeronautic/core";
import { Color } from "three";
import type { Weather } from "./weather";

// The cloud round the camera, as the medium every effect is drawn in
//
// The clouds are drawn behind the effects: a flame or a vapour in front of
// the camera is composited over them whole, however much cloud lies between.
// Inside a cloud that is the whole of the way, and the effects must fade into
// it as a surface does into fog. Within the few hundred metres an effect is
// seen across in a cloud, the cloud is about as thick and as bright
// throughout, so it is taken as the camera finds it: light from d away comes
// through as e^(−σ d), and the rest is the cloud's own, its source function,
// the light it scatters per its extinction there.
//
// That light is the clouds' shader's, worked out once on the CPU at the
// camera: the sun through the cloud towards it, scattered once and many
// times, and the sky and the ground through the cloud over and under. Seen
// from inside, it comes from every way, so the phase is its mean, 1 / 4π.
//
// The effects lit by the sun and the sky are lit by the cloud there instead:
// the sun's beam as much of it as gets through, and in place of the sky the
// rest of the light, the mean radiance of all but the beam

// As the clouds' shader has them
const ALBEDO = 1;
const DIFFUSE_ASYMMETRY = 0.85;
const LIGHT_STEPS = 6;
const LIGHT_FIRST_M = 30;
const ISOTROPIC = 1 / (4 * Math.PI);

/**
 * The share of a diffuse light a slab lets through: Eddington's two-stream,
 * 1 / (1 + ¾ (1 − g) τ).
 * @param depth Its optical depth
 * @returns 0 to 1
 */
const diffuse = (depth: number): number =>
  1 / (1 + 0.75 * (1 - DIFFUSE_ASYMMETRY) * depth);

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

  out.extinction = here.extinction;
  out.light ??= new Color();

  if (here.extinction <= 0) {
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

  // Per unit extinction, so the medium's colour is its source function
  const transmitted = Math.exp(-sun_depth);
  const once = ISOTROPIC * transmitted;
  const reflected = 1 - diffuse(here.up + here.down);
  const many =
    (reflected / Math.PI) * Math.max(diffuse(sun_depth) - transmitted, 0);
  const sky = diffuse(here.up) * 0.5 * ALBEDO;
  const ground = diffuse(here.down) * 0.5 * ALBEDO;

  // All but the sun's beam: what has scattered, and the sky and the ground
  const diffused = (i: number) =>
    look.sun[i] * many * ALBEDO + look.sky[i] * sky + look.ground[i] * ground;

  out.light.setRGB(diffused(0), diffused(1), diffused(2));
  out.sunTransmittance = transmitted;

  // And the beam's, scattered once, drawn in the clouds' exposure
  const beam = once * ALBEDO;
  const scale = look.exposure;

  out.color.setRGB(
    (look.sun[0] * beam + diffused(0)) * scale,
    (look.sun[1] * beam + diffused(1)) * scale,
    (look.sun[2] * beam + diffused(2)) * scale,
  );

  return out;
};
