import { describe, expect, it } from "vitest";
import { exposure_ev100 } from "./exposure";
import {
  GLARE_MAX_DEG,
  glare_core,
  glare_psf,
  glare_radius,
  glare_scattered,
} from "./glare";
import { density_ratio, extinction, KOSCHMIEDER, transmission } from "./haze";

const young = { ageYears: 25, pigmentation: 0.5 };

describe("the glare", () => {
  it("is the CIE's equation", () => {
    // At 1°, 10 + (5 + 0.05) (1 + (25/62.5)⁴) + 0.00125
    expect(glare_psf(1, young)).toBeCloseTo(
      10 + 5.05 * (1 + 0.4 ** 4) + 0.00125,
      9,
    );
  });

  it("grows with age", () => {
    expect(glare_psf(5, { ...young, ageYears: 70 })).toBeGreaterThan(
      glare_psf(5, young) * 2,
    );
  });

  it("scatters a share of the light, and keeps the rest in the disc", () => {
    const scattered = glare_scattered(young);

    expect(scattered).toBeGreaterThan(0.1);
    expect(scattered).toBeLessThan(0.5);

    // The disc carries the rest: its luminance over its solid angle
    const radius = (0.1 * Math.PI) / 180;

    expect(
      glare_core(young) * 2 * Math.PI * (1 - Math.cos(radius)),
    ).toBeCloseTo(1 - scattered, 9);
  });

  it("is drawn out to where it falls to the floor", () => {
    const radius = glare_radius(1e-3, 1e-3, young);

    expect(glare_psf(radius, young) * 1e-3).toBeCloseTo(1e-3, 6);
    expect(glare_radius(1e3, 1e-6, young)).toBe(GLARE_MAX_DEG);
  });
});

describe("the haze", () => {
  it("is as thick as the visibility says, at 550 nm", () => {
    const air = extinction(10_000);

    expect(air.rayleigh[1] + air.aerosol[1]).toBeCloseTo(KOSCHMIEDER / 10_000);

    // Contrast falls to 2 % at the visibility
    expect(transmission(air, 10_000)[1]).toBeCloseTo(0.02, 6);
  });

  it("reddens a light far off", () => {
    const [r, g, b] = transmission(extinction(23_000), 10_000);

    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("thins with height", () => {
    expect(density_ratio(0)).toBeCloseTo(1, 6);
    expect(density_ratio(11_000)).toBeCloseTo(0.2971, 3);
  });
});

describe("exposure_ev100", () => {
  it("draws the luminance that fills the sensor as one", () => {
    expect(exposure_ev100(0) * 1.2).toBeCloseTo(1, 12);
    expect(exposure_ev100(15) / exposure_ev100(14)).toBeCloseTo(0.5, 12);
  });
});
