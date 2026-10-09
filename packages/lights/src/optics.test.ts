import { extinction } from "@aeronautic/core";
import { describe, expect, it } from "vitest";
import {
  beam_half_angles,
  beam_intensity,
  beam_range,
  henyey_greenstein,
  LAMP,
  rayleigh_phase,
} from "./beam";

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
