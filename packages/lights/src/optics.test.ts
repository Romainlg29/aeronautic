import { describe, expect, it } from "vitest";
import {
  beam_half_angles,
  beam_intensity,
  beam_range,
  henyey_greenstein,
  LAMP,
  rayleigh_phase,
} from "./beam";
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

/**
 * A phase function over the sphere.
 * @param phase It
 * @returns Its integral, which should be one
 */
const sphere = (phase: (cos: number) => number) => {
  let sum = 0;
  const steps = 20_000;

  for (let step = 0; step < steps; step++) {
    const cos = -1 + (2 * (step + 0.5)) / steps;

    sum += phase(cos) * 2 * Math.PI * (2 / steps);
  }

  return sum;
};

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

describe("the beams", () => {
  it("fall to a tenth at the edge of their spread", () => {
    const lamp = LAMP.landing;
    const across = Math.tan((5.5 * Math.PI) / 180);
    const up = Math.tan((6 * Math.PI) / 180);

    expect(beam_intensity(lamp, 0, 0, 1)).toBe(600_000);
    expect(beam_intensity(lamp, across, 0, 1)).toBeCloseTo(60_000, 6);
    expect(beam_intensity(lamp, 0, up, 1)).toBeCloseTo(60_000, 6);
    expect(beam_intensity(lamp, 0, 0, -1)).toBe(0);
  });

  it("reach a share of their peak at their half-angles", () => {
    const lamp = LAMP.taxi;
    const [across] = beam_half_angles(lamp, 1e-3);

    expect(beam_intensity(lamp, Math.tan(across), 0, 1)).toBeCloseTo(75, 6);
  });

  it("scatter by phase functions that sum to one", () => {
    expect(sphere(rayleigh_phase)).toBeCloseTo(1, 4);
    expect(sphere((cos) => henyey_greenstein(cos, 0.7))).toBeCloseTo(1, 3);
  });

  it("show further in thicker haze", () => {
    const clear = beam_range(LAMP.landing, extinction(23_000), 1e-2);
    const hazy = beam_range(LAMP.landing, extinction(2_000), 1e-2);

    expect(hazy).toBeGreaterThan(clear * 5);
  });
});

describe("exposure_ev100", () => {
  it("draws the luminance that fills the sensor as one", () => {
    expect(exposure_ev100(0) * 1.2).toBeCloseTo(1, 12);
    expect(exposure_ev100(15) / exposure_ev100(14)).toBeCloseTo(0.5, 12);
  });
});
