import { describe, expect, it } from "vitest";
import {
  BLONDEL_REY_S,
  blondel_rey_window,
  effective_ratio,
  flash_at,
  peak_intensity,
  perceived_duration,
  pulse_at,
  pulse_energy,
  type Pulse,
} from "./flash";

const xenon: Pulse = { shape: "exponential", durationS: 2e-4 };
const led: Pulse = { shape: "rectangular", durationS: 0.1 };

/**
 * Blondel–Rey by brute force: the best window over a fine grid.
 * @param pulse The flash
 * @returns Ie over the peak
 */
const brute_force = (pulse: Pulse) => {
  let best = 0;
  const end = pulse.durationS * 20;

  for (let step = 1; step <= 4000; step++) {
    const t2 = (end * step) / 4000;

    best = Math.max(best, pulse_energy(pulse, 0, t2) / (BLONDEL_REY_S + t2));
  }

  return best;
};

describe("Blondel–Rey", () => {
  it("gives a rectangular pulse I d / (0.2 + d)", () => {
    expect(effective_ratio(led)).toBeCloseTo(0.1 / 0.3, 12);
  });

  it("finds the best window, where the intensity has fallen to Ie", () => {
    const t2 = blondel_rey_window(xenon);

    expect(pulse_at(xenon, t2)).toBeCloseTo(effective_ratio(xenon), 9);
    expect(effective_ratio(xenon)).toBeCloseTo(brute_force(xenon), 6);
  });

  it("makes a 0.2 ms flash about a thousandth as bright as its peak", () => {
    expect(peak_intensity(xenon, 400)).toBeGreaterThan(400_000);
    expect(peak_intensity(xenon, 400)).toBeLessThan(410_000);
  });

  it("holds Ie for long enough to carry the flash's light", () => {
    for (const pulse of [xenon, led]) {
      expect(perceived_duration(pulse) * effective_ratio(pulse)).toBeCloseTo(
        pulse_energy(pulse, 0, Infinity),
        12,
      );
    }

    expect(perceived_duration(led)).toBeCloseTo(0.3, 12);
  });
});

describe("flash_at", () => {
  it("shows the eye Ie, then nothing, once a period", () => {
    expect(flash_at(xenon, 1, 0.05, "eye")).toBe(1);
    expect(flash_at(xenon, 1, 0.5, "eye")).toBe(0);
    expect(flash_at(xenon, 1, 3.1, "eye")).toBe(1);
  });

  it("gives a camera the flash's light over its exposure", () => {
    // A frame that takes the whole flash, and the one after it
    const frame = 1 / 60;
    const ratio = effective_ratio(xenon);

    expect(flash_at(xenon, 1, frame / 2, "camera", frame)).toBeCloseTo(
      pulse_energy(xenon, 0, Infinity) / frame / ratio,
      6,
    );
    expect(flash_at(xenon, 1, frame * 1.5, "camera", frame)).toBeCloseTo(0, 6);
  });

  it("averages to the same light either way", () => {
    let eye = 0;
    let camera = 0;
    const frame = 1 / 60;

    for (let index = 1; index <= 600; index++) {
      eye += flash_at(led, 1.25, index * frame, "eye") * frame;
      camera += flash_at(led, 1.25, index * frame, "camera", frame) * frame;
    }

    expect(Math.abs(camera / eye - 1)).toBeLessThan(0.05);
  });
});
