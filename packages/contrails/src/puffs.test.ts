import { describe, expect, it } from "vitest";
import {
  PUFF_SIZE,
  fit_puff_levels,
  puff_count,
  puff_levels,
  puff_size,
  puffs_per_width,
  write_puffs,
} from "./puffs";

// A plume spreading as the square root of its age, from a metre at 0.1 s
const sigma = (age: number) => Math.sqrt(age / 0.1);

describe("puffs", () => {
  it("are about four to a width for an even split", () => {
    expect(puffs_per_width(PUFF_SIZE)).toBeCloseTo(3.77, 2);
  });

  it("are sized back from how many there are", () => {
    for (const size of [0.3, 0.5, PUFF_SIZE, 0.9]) {
      expect(puff_size(puffs_per_width(size))).toBeCloseTo(size, 6);
    }
  });

  it("are left closer where the plume is thin", () => {
    const levels = puff_levels(sigma, 0.1, 60, 250, 3.77);

    for (let index = 1; index < levels.length; index++) {
      expect(levels[index].exponent).toBeGreaterThan(
        levels[index - 1].exponent,
      );
      expect(levels[index].from).toBe(levels[index - 1].to);
    }

    // Never further apart than the width asks
    for (const level of levels) {
      const spacing = 250 * 2 ** level.exponent;

      expect(spacing).toBeLessThanOrEqual(sigma(level.from) / 3.77 + 1e-9);
    }
  });

  it("fit the room there is", () => {
    const levels = fit_puff_levels(sigma, 0.1, 60, 250, 2000);

    expect(puff_count(levels)).toBeLessThanOrEqual(2000);
    expect(puff_count(levels)).toBeGreaterThan(1000);
  });

  it("stay where they were left, and keep their ice", () => {
    const levels = puff_levels(sigma, 0.1, 60, 250, 3.77);
    const before = new Float32Array(4 * 40000);
    const after = new Float32Array(4 * 40000);

    const drawn = write_puffs(levels, 100, before);

    write_puffs(levels, 100.25, after);

    // A puff's name is at an age a quarter of a second older a frame on
    const ages = new Map<number, number>();

    for (let index = 0; index < drawn; index++) {
      ages.set(before[index * 4 + 1], before[index * 4]);
    }

    let matched = 0;

    for (let index = 0; index < drawn; index++) {
      const was = ages.get(after[index * 4 + 1]);

      if (was !== undefined && Math.abs(after[index * 4] - was - 0.25) < 1e-4) {
        matched++;
      }
    }

    expect(matched).toBeGreaterThan(drawn * 0.9);

    // The seconds of trail their ice stands for sum to the trail's
    let seconds = 0;

    for (let index = 0; index < drawn; index++) {
      seconds += before[index * 4 + 2];
    }

    expect(seconds).toBeCloseTo(60 - 0.1, 0);
  });
});
