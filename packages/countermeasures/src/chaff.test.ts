import { describe, expect, it } from "vitest";
import {
  CHAFF,
  chaff_bloom,
  chaff_cross_section,
  chaff_fall_speed,
  chaff_mass,
  dipole_count,
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

  it("falls at about half a metre a second, as it is cited", () => {
    // A kilometre up, 281.65 K in the standard atmosphere
    const speed = chaff_fall_speed(rr178, 281.65);

    expect(speed).toBeCloseTo(0.47, 2);

    // Colder air is less viscous: it falls faster higher up
    expect(chaff_fall_speed(rr178, 216.65)).toBeGreaterThan(speed);
  });

  it("blooms in a fifth of a second", () => {
    expect(chaff_bloom(rr178, 0)).toBe(0);
    expect(chaff_bloom(rr178, 0.1)).toBeCloseTo(0.75, 6);
    expect(chaff_bloom(rr178, 0.2)).toBe(1);
    expect(chaff_bloom(rr178, 5)).toBe(1);
  });
});
