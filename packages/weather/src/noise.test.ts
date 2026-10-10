import { describe, expect, it } from "vitest";
import {
  detail_channels,
  pcg3d,
  perlin,
  perlin_worley,
  seed_salt,
  shape_channels,
  shape_noise,
  unit,
  worley,
  worley_fbm,
} from "./noise";

describe("pcg3d", () => {
  it("is the same for the same input", () => {
    expect(pcg3d(1, 2, 3)).toEqual(pcg3d(1, 2, 3));
  });

  it("changes every output with any input", () => {
    const a = pcg3d(1, 2, 3);
    const b = pcg3d(1, 2, 4);

    expect(a[0]).not.toBe(b[0]);
    expect(a[1]).not.toBe(b[1]);
    expect(a[2]).not.toBe(b[2]);
  });

  it("is uniform, near enough", () => {
    const bins = new Array(10).fill(0);

    for (let i = 0; i < 10_000; i++) {
      bins[Math.floor(unit(pcg3d(i, 7, 11)[0]) * 10)]++;
    }

    for (const bin of bins) {
      expect(bin).toBeGreaterThan(900);
      expect(bin).toBeLessThan(1100);
    }
  });
});

describe("noise", () => {
  const salt = seed_salt(42);

  it("tiles over its period", () => {
    expect(perlin(0.3, 1.7, 2.2, 4, salt)).toBeCloseTo(
      perlin(4.3, 5.7, -1.8, 4, salt),
      10,
    );
    expect(worley(0.3, 1.7, 2.2, 4, salt)).toBeCloseTo(
      worley(4.3, 5.7, -1.8, 4, salt),
      10,
    );
  });

  it("is zero at the gradient noise's lattice points", () => {
    expect(perlin(2, 1, 3, 4, salt)).toBeCloseTo(0, 10);
  });

  it("stays in 0 to 1", () => {
    for (let i = 0; i < 500; i++) {
      const u = unit(pcg3d(i, 1, 0)[0]);
      const v = unit(pcg3d(i, 2, 0)[0]);
      const w = unit(pcg3d(i, 3, 0)[0]);

      for (const value of [
        ...shape_channels(u, v, w, salt),
        ...detail_channels(u, v, w, salt),
        shape_noise(shape_channels(u, v, w, salt)),
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is another sky with another seed", () => {
    const other = seed_salt(43);

    expect(worley_fbm(0.5, 0.5, 0.5, 4, salt)).not.toBeCloseTo(
      worley_fbm(0.5, 0.5, 0.5, 4, other),
      4,
    );
  });

  it("billows: Perlin–Worley sits over its cellular noise", () => {
    expect(perlin_worley(1.2, 0.4, 2.9, 4, salt)).toBeGreaterThanOrEqual(
      worley_fbm(1.2, 0.4, 2.9, 4, salt),
    );
  });
});
