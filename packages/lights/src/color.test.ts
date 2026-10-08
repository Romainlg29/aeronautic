import { describe, expect, it } from "vitest";
import {
  chromaticity_rgb,
  ILLUMINANT_A_K,
  is_aviation_green,
  is_aviation_red,
  is_aviation_white,
  LED_GREEN,
  LED_RED,
  planckian,
} from "./color";

const luminance = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("the lights' colours", () => {
  it("are in the rule's regions", () => {
    expect(is_aviation_red(LED_RED)).toBe(true);
    expect(is_aviation_green(LED_GREEN)).toBe(true);
    expect(is_aviation_white(planckian(ILLUMINANT_A_K))).toBe(true);
    expect(is_aviation_white(planckian(6000))).toBe(true);

    expect(is_aviation_red(LED_GREEN)).toBe(false);
    expect(is_aviation_green(LED_RED)).toBe(false);
    expect(is_aviation_white(LED_RED)).toBe(false);
  });

  // To the fits' accuracy, and to illuminant A's, defined with the old c₂ of
  // 1.435e-2 m K, so a blackbody of today's c₂ at 2848 K
  it("put illuminant A where the CIE does", () => {
    const [x, y] = planckian(ILLUMINANT_A_K);

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
    for (const color of [LED_RED, LED_GREEN, planckian(ILLUMINANT_A_K)]) {
      const rgb = chromaticity_rgb(color);

      expect(luminance(rgb)).toBeCloseTo(1, 3);
      expect(Math.min(...rgb)).toBeGreaterThanOrEqual(0);
    }
  });

  it("makes red red and green green", () => {
    const red = chromaticity_rgb(LED_RED);
    const green = chromaticity_rgb(LED_GREEN);

    expect(red[0]).toBeGreaterThan(red[1] + red[2]);
    expect(green[1]).toBeGreaterThan(green[0] + green[2]);
  });
});
