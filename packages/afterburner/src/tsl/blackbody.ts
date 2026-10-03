import { clamp, exp2, float, texture, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { Texture } from "three";
import {
  BLACKBODY_MAX_K,
  BLACKBODY_MIN_K,
  BLACKBODY_TEXELS,
  get_blackbody_lut,
} from "../blackbody";

type F = Node<"float">;
type V3 = Node<"vec3">;

/**
 * What a blackbody glows at one temperature, in linear sRGB, as TSL.
 *
 * A luminance of one at 2000 K. Sampled with an explicit level, so it is safe
 * anywhere, a march loop's non-uniform control flow included.
 * @param temperature_k The temperature, in kelvin
 * @param lut The lookup, `get_blackbody_lut()` by default
 * @returns The radiance
 */
export const blackbody = (
  temperature_k: F,
  lut: Texture = get_blackbody_lut(),
): V3 => {
  // Onto texel centres, so the ends of the range are the ends of the table
  const along = clamp(
    temperature_k.sub(BLACKBODY_MIN_K).div(BLACKBODY_MAX_K - BLACKBODY_MIN_K),
    0,
    1,
  );

  const u = along
    .mul(BLACKBODY_TEXELS - 1)
    .add(0.5)
    .div(BLACKBODY_TEXELS);

  const sample = texture(lut, vec2(u, 0.5)).level(float(0));

  return sample.rgb.mul(exp2(sample.a)) as unknown as V3;
};
