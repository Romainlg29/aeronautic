import { describe, expect, it } from "vitest";
import { build_noise_volume } from "./noise-volume";

const TEXELS = 16;
const PERIOD = 4;

const at = (bytes: Uint8Array, i: number, j: number, k: number) =>
  bytes[(k * TEXELS + j) * TEXELS + i];

describe("build_noise_volume", () => {
  const bytes = build_noise_volume(TEXELS, PERIOD);

  it("has value noise's mean and spread", () => {
    const values = Array.from(bytes, (byte) => byte / 255);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    );

    expect(mean).toBeCloseTo(0.5, 1);
    expect(deviation).toBeCloseTo(0.184, 1);
  });

  it("tiles: opposite faces continue into each other", () => {
    let seam = 0;
    let inside = 0;

    for (let k = 0; k < TEXELS; k++) {
      for (let j = 0; j < TEXELS; j++) {
        seam += Math.abs(at(bytes, TEXELS - 1, j, k) - at(bytes, 0, j, k));
        inside += Math.abs(at(bytes, 7, j, k) - at(bytes, 8, j, k));
      }
    }

    // Across the wrap is no rougher than any other step between neighbours
    expect(seam).toBeLessThan(inside * 1.5);
  });

  it("is the same volume every time", () => {
    expect(build_noise_volume(TEXELS, PERIOD)).toEqual(bytes);
  });

  it("has a second channel independent of the first", () => {
    const other = build_noise_volume(TEXELS, PERIOD, 1);

    let products = 0;

    for (let index = 0; index < bytes.length; index++) {
      products += (bytes[index] / 255 - 0.5) * (other[index] / 255 - 0.5);
    }

    const correlation = products / bytes.length / 0.184 ** 2;

    expect(Math.abs(correlation)).toBeLessThan(0.2);
  });
});
