import { describe, expect, it } from "vitest";
import { EDGE_SOFTNESS, mean_density, RAIN_SHAFTS_MEAN } from "./density";
import { random } from "./lightning";
import {
  detail_channels,
  detail_noise,
  DETAIL_REACH,
  field_noise,
  pcg3d,
  perlin,
  perlin_worley,
  seed_salt,
  shape_channels,
  shape_noise,
  SHAPE_PEAK,
  SHAPE_SALT,
  shape_union,
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
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }

      // The shape noise is stretched, not clamped: never past its peak
      const shape = shape_noise(shape_channels(u, v, w, salt));

      expect(shape).toBeLessThanOrEqual(SHAPE_PEAK - DETAIL_REACH + 1e-3);
      expect(
        Math.abs(detail_noise(detail_channels(u, v, w, salt))),
      ).toBeLessThan(0.4);
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

describe("the air's field noise", () => {
  it("spans −1 to 1 at two standard deviations", () => {
    let squares = 0;
    let count = 0;

    for (let i = 0; i < 150; i++) {
      for (let j = 0; j < 150; j++) {
        const v = field_noise(i * 0.137 + 3.1, j * 0.113 - 8.4, 0.7, 4242);

        squares += v * v;
        count++;
      }
    }

    expect(Math.sqrt(squares / count)).toBeGreaterThan(0.4);
    expect(Math.sqrt(squares / count)).toBeLessThan(0.6);
  });
});

describe("the rain's shafts", () => {
  it("are the share of the rain their mean says", () => {
    const rng = random(7);
    let sum = 0;
    const count = 50_000;

    for (let i = 0; i < count; i++) {
      const n = shape_noise(
        shape_union(rng() * 8, rng() * 8, rng() * 8, SHAPE_SALT),
      );

      sum += Math.min(Math.max(n * 1.6 - 0.2, 0), 1);
    }

    expect(sum / count).toBeCloseTo(RAIN_SHAFTS_MEAN, 1);
  });
});

describe("the clouds' mean, far off", () => {
  it("is the noise's mean density at a cut", () => {
    const rng = random(11);
    const count = 50_000;
    const edge = 0.45;
    let linear = 0;
    let two_thirds = 0;

    for (let i = 0; i < count; i++) {
      const n = shape_noise(
        shape_union(rng() * 8, rng() * 8, rng() * 8, SHAPE_SALT),
      );
      const d = Math.min(Math.max((n - edge) / EDGE_SOFTNESS, 0), 1);

      linear += d;
      two_thirds += Math.cbrt(d) ** 2;
    }

    const [m23, m1] = mean_density(edge);

    expect(m1).toBeCloseTo(linear / count, 2);
    expect(m23).toBeCloseTo(two_thirds / count, 2);
  });

  it("thins as the cut rises, to none at the noise's peak", () => {
    let last = Infinity;

    for (let edge = -0.5; edge <= SHAPE_PEAK; edge += 0.05) {
      const [m23, m1] = mean_density(edge);

      expect(m1).toBeLessThanOrEqual(last);
      expect(m23).toBeGreaterThanOrEqual(m1);
      last = m1;
    }

    expect(mean_density(-0.5)[1]).toBeCloseTo(1, 2);
    expect(mean_density(SHAPE_PEAK)[1]).toBeLessThan(1e-3);
  });
});
