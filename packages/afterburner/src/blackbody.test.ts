import { describe, expect, it } from "vitest";
import {
  REFERENCE_TEMPERATURE_K,
  blackbody_luminance,
  blackbody_rgb,
} from "./blackbody";

describe("blackbody", () => {
  it("has a luminance of one at the reference temperature", () => {
    expect(blackbody_luminance(REFERENCE_TEMPERATURE_K)).toBeCloseTo(1, 3);
  });

  // Planck's law is steep in the visible: a few hundred kelvin is a decade
  it("climbs steeply with temperature", () => {
    expect(blackbody_luminance(1500)).toBeLessThan(0.05);
    expect(blackbody_luminance(2500)).toBeGreaterThan(10);
  });

  it("glows red when cool and whiter as it heats", () => {
    const [r_cool, , b_cool] = blackbody_rgb(1500);
    const [r_hot, , b_hot] = blackbody_rgb(5500);

    expect(b_cool / r_cool).toBeLessThan(0.05);
    expect(b_hot / r_hot).toBeGreaterThan(0.7);
  });
});
