import { describe, expect, it } from "vitest";
import {
  NAV_OVERLAP_CD,
  navigation_area,
  navigation_intensity,
  navigation_vertical,
  type NavigationSide,
} from "./navigation";

// The minima of 25.1391 and 25.1393, band by band
const forward_minimum = (azimuth: number) =>
  azimuth <= 10 ? 40 : azimuth <= 20 ? 30 : 5;

const VERTICAL_BANDS: readonly (readonly [number, number])[] = [
  [5, 0.9],
  [10, 0.8],
  [15, 0.7],
  [20, 0.5],
  [30, 0.3],
  [40, 0.1],
  [90, 0.05],
];

const vertical_minimum = (elevation: number) => {
  const e = Math.abs(elevation);

  if (e === 0) return 1;

  return VERTICAL_BANDS.find(([top]) => e <= top)?.[1] ?? 0.05;
};

/**
 * How far an azimuth is past a light's own angle.
 * @param side The light
 * @param azimuth Degrees from dead ahead
 * @returns Degrees
 */
const past_edge = (side: NavigationSide, azimuth: number) => {
  const edges =
    side === "left" ? [0, 110] : side === "right" ? [-110, 0] : [-110, 110];

  return Math.min(
    ...edges.map((edge) => {
      const d = Math.abs(azimuth - edge) % 360;

      return Math.min(d, 360 - d);
    }),
  );
};

describe("navigation_intensity", () => {
  it("meets every minimum inside each light's angle", () => {
    for (let azimuth = 0; azimuth <= 110; azimuth += 0.5) {
      for (let elevation = -90; elevation <= 90; elevation += 0.5) {
        const minimum = forward_minimum(azimuth) * vertical_minimum(elevation);

        expect(
          navigation_intensity("left", azimuth, elevation),
        ).toBeGreaterThanOrEqual(minimum - 1e-9);
        expect(
          navigation_intensity("right", -azimuth, elevation),
        ).toBeGreaterThanOrEqual(minimum - 1e-9);
      }
    }

    for (let azimuth = 110; azimuth <= 250; azimuth += 0.5) {
      expect(navigation_intensity("aft", azimuth, 0)).toBeGreaterThanOrEqual(
        20,
      );
    }
  });

  it("gives the minimum itself where the bands meet", () => {
    expect(navigation_intensity("left", 0, 0)).toBe(40);
    expect(navigation_intensity("left", 20, 0)).toBe(30);
    expect(navigation_intensity("right", -110, 0)).toBe(5);
    expect(navigation_intensity("aft", 180, 0)).toBe(20);
    expect(navigation_intensity("left", 0, 40)).toBeCloseTo(4);
  });

  it("stays within the overlap maxima past each edge", () => {
    const sides: NavigationSide[] = ["left", "right", "aft"];

    for (const side of sides) {
      for (let azimuth = -180; azimuth < 180; azimuth += 0.25) {
        const limits = NAV_OVERLAP_CD[side][navigation_area(azimuth)];

        if (!limits) continue;

        const past = past_edge(side, azimuth);
        const intensity = navigation_intensity(side, azimuth, 0);

        const limit =
          past >= 20 ? limits[1] : past >= 10 ? limits[0] : Infinity;

        expect(intensity).toBeLessThanOrEqual(limit + 1e-9);
      }
    }
  });

  it("fades without a step at an edge", () => {
    const at = navigation_intensity("left", 0, 0);
    const just_past = navigation_intensity("left", -0.01, 0);

    expect(just_past).toBeLessThan(at);
    expect(just_past).toBeGreaterThan(at * 0.99);
  });

  it("scales inside, and can be told to spill nothing", () => {
    expect(navigation_intensity("left", -30, 0, 1, 0)).toBe(0);
    expect(navigation_intensity("left", 30, 0, 2, 0)).toBeCloseTo(
      2 * navigation_intensity("left", 30, 0),
    );
  });
});

describe("navigation_vertical", () => {
  it("is one in the horizontal plane and a twentieth overhead", () => {
    expect(navigation_vertical(0)).toBe(1);
    expect(navigation_vertical(90)).toBe(0.05);
    expect(navigation_vertical(-90)).toBe(0.05);
  });
});

describe("navigation_area", () => {
  it("splits the horizon at dead ahead and 110° either side", () => {
    expect(navigation_area(5)).toBe("left");
    expect(navigation_area(-5)).toBe("right");
    expect(navigation_area(111)).toBe("aft");
    expect(navigation_area(-179)).toBe("aft");
    expect(navigation_area(500)).toBe("aft");
  });
});
