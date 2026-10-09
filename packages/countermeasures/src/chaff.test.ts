import { describe, expect, it } from "vitest";
import {
  CHAFF,
  SUN_RADIUS_RAD,
  chaff_bloom,
  chaff_cross_section,
  chaff_fall_speed,
  chaff_mass,
  dipole_count,
  dipole_tilt,
  dipole_tumble_rate,
  glint_share,
  level_shadow,
  mirror_density,
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

  it("lies within a few degrees of level once it falls", () => {
    const fall = chaff_fall_speed(rr178, 288.15, 1.225);
    const tilt = dipole_tilt(rr178, fall, 288.15, 1.225, 1e-3);

    expect(tilt).toBeGreaterThan(0.01);
    expect(tilt).toBeLessThan(0.1);

    // Shaken harder, it tilts more
    expect(dipole_tilt(rr178, fall, 288.15, 1.225, 1e-1)).toBeGreaterThan(tilt);
  });

  it("faces every way alike turned every way, and up once level", () => {
    expect(mirror_density(0, 0.04, 0.3)).toBe(0.5);

    // Far from the vertical, level fibres give 1 / (π cos η)
    const elevation = 0.3;

    expect(mirror_density(1, 0.04, Math.sin(elevation))).toBeCloseTo(
      1 / (Math.PI * Math.cos(elevation)),
      2,
    );

    // At the sun's reflection, a sheet of mirrors
    expect(mirror_density(1, 0.04, 1)).toBeGreaterThan(5);
  });

  it("sends out all the light it would turned every way, only elsewhere", () => {
    // The mean over every h of its density is ½ for any axes
    for (const tilt of [0.02, 0.04, 0.1]) {
      let sum = 0;
      const steps = 200_000;

      for (let step = 0; step < steps; step++) {
        sum += mirror_density(1, tilt, (step + 0.5) / steps);
      }

      expect(sum / steps).toBeCloseTo(0.5, 2);
    }
  });

  it("shows all of a level fibre from above, less edge on", () => {
    expect(level_shadow(0, 0.2)).toBe(1);
    expect(level_shadow(1, 1)).toBeCloseTo(4 / Math.PI, 4);
    expect(level_shadow(1, 0)).toBeCloseTo(8 / Math.PI ** 2, 4);
  });

  it("blooms in a fifth of a second", () => {
    expect(chaff_bloom(rr178, 0)).toBe(0);
    expect(chaff_bloom(rr178, 0.1)).toBeCloseTo(0.75, 6);
    expect(chaff_bloom(rr178, 0.2)).toBe(1);
    expect(chaff_bloom(rr178, 5)).toBe(1);
  });
});
