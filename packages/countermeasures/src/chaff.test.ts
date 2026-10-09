import { describe, expect, it } from "vitest";
import {
  CHAFF,
  SUN_RADIUS_RAD,
  chaff_bloom,
  chaff_cross_section,
  chaff_fall_speed,
  chaff_mass,
  dipole_count,
  dipole_tumble_rate,
  glint_share,
} from "./chaff";

const rr178 = CHAFF.rr178;

describe("the RR-178's chaff", () => {
  it("weighs a little under the patent's third of a pound", () => {
    expect(chaff_mass(rr178)).toBeCloseTo(0.117, 3);
    expect(chaff_mass(rr178)).toBeLessThan(0.454 / 3);
  });

  it("holds millions of dipoles", () => {
    expect(dipole_count(rr178)).toBeCloseTo(3.7e6, -5);
  });

  it("stops under 2 m² of light", () => {
    expect(chaff_cross_section(rr178)).toBeCloseTo(1.77, 2);
  });

  it("falls as one-mil chaff is measured to", () => {
    // 0.18 to 0.3 m/s at sea level, about twice that at 40,000 ft
    const low = chaff_fall_speed(rr178, 288.15, 1.225);
    const high = chaff_fall_speed(rr178, 216.65, 0.3016);

    expect(low).toBeGreaterThanOrEqual(0.17);
    expect(low).toBeLessThanOrEqual(0.3);
    expect(high / low).toBeGreaterThan(1.4);
    expect(high / low).toBeLessThan(2.2);
  });

  it("tumbles about once a second in a mixed layer's turbulence", () => {
    expect(dipole_tumble_rate(rr178, 1e-3)).toBeCloseTo(1.2, 1);
  });

  it("glints from a share of its fibres as small as the source", () => {
    // Sun behind the eye: |s + v| is 2, the share half the sun's radius
    expect(glint_share(SUN_RADIUS_RAD, 2, 0)).toBeCloseTo(
      SUN_RADIUS_RAD / 2,
      9,
    );

    // Looking into the sun every fibre glints
    expect(glint_share(SUN_RADIUS_RAD, 0, 0)).toBe(1);

    // Turning, more catch it over a frame
    expect(glint_share(SUN_RADIUS_RAD, 2, 0.02)).toBeGreaterThan(0.02);
  });

  it("blooms in a fifth of a second", () => {
    expect(chaff_bloom(rr178, 0)).toBe(0);
    expect(chaff_bloom(rr178, 0.1)).toBeCloseTo(0.75, 6);
    expect(chaff_bloom(rr178, 0.2)).toBe(1);
    expect(chaff_bloom(rr178, 5)).toBe(1);
  });
});
