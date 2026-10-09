import { describe, expect, it } from "vitest";
import { chromaticity_rgb, planckian } from "./blackbody";

const luminance = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("planckian", () => {
  // To the fits' accuracy, and to illuminant A's, defined with the old c₂ of
  // 1.435e-2 m K, so a blackbody of today's c₂ at 2848 K
  it("puts illuminant A where the CIE does", () => {
    const [x, y] = planckian(2856);

    expect(x).toBeCloseTo(0.4476, 2);
    expect(y).toBeCloseTo(0.4074, 2);
  });
});

describe("chromaticity_rgb", () => {
  it("gives D65 as white", () => {
    const [r, g, b] = chromaticity_rgb([0.3127, 0.329]);

    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(1, 3);
    expect(b).toBeCloseTo(1, 3);
  });

  it("keeps the luminance at one, out of gamut too", () => {
    for (const color of [
      [0.7006, 0.2993],
      [0.1142, 0.8262],
      planckian(2856),
    ] as const) {
      const rgb = chromaticity_rgb(color);

      expect(luminance(rgb)).toBeCloseTo(1, 3);
      expect(Math.min(...rgb)).toBeGreaterThanOrEqual(0);
    }
  });
});
