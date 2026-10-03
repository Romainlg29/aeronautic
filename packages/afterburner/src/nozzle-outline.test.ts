import { describe, expect, it } from "vitest";
import {
  clamp_nozzle_squareness,
  nozzle_outline_fit,
  NOZZLE_SQUARENESS_MAX,
  NOZZLE_SQUARENESS_MIN,
} from "./nozzle-outline";
import { jet_state } from "./plume-profile";
import {
  resolve_afterburner_params,
  resolve_afterburner_profile,
} from "./presets";

/**
 * The shader's measure of a point against an outline, at the lip, on the CPU.
 * @param y Up the nozzle frame
 * @param z Across it
 * @param aspect Width over height
 * @param squareness The exponent
 * @returns The point's radius, in round radii of the outline's area
 */
const measure = (y: number, z: number, aspect: number, squareness: number) => {
  const { area_scale } = nozzle_outline_fit(aspect, squareness);
  const n = clamp_nozzle_squareness(squareness);
  const stretch = Math.sqrt(aspect);

  return (
    (Math.abs(z / stretch) ** n + Math.abs(y * stretch) ** n) ** (1 / n) /
    area_scale
  );
};

const SHAPES: [number, number][] = [
  [1, 2],
  [1.4, 2],
  [3, 4],
  [2, 8],
  [1, 1],
  [0.5, 0.7],
  [4, 24],
];

describe("nozzle_outline_fit", () => {
  it("is a unit circle for a round nozzle", () => {
    const fit = nozzle_outline_fit(1, 2);

    expect(fit.area_scale).toBeCloseTo(1, 10);
    expect(fit.reach).toBeCloseTo(1, 10);
  });

  it("keeps the area of the round exit", () => {
    for (const [aspect, squareness] of SHAPES) {
      // Count the grid cells inside, over a square holding the whole outline
      const { reach } = nozzle_outline_fit(aspect, squareness);
      const cells = 600;
      const size = (2 * reach) / cells;
      let inside = 0;

      for (let i = 0; i < cells; i += 1) {
        for (let j = 0; j < cells; j += 1) {
          const y = -reach + (i + 0.5) * size;
          const z = -reach + (j + 0.5) * size;

          if (measure(y, z, aspect, squareness) < 1) inside += 1;
        }
      }

      expect(inside * size * size).toBeCloseTo(Math.PI, 1);
    }
  });

  it("reaches as far as the outline does, and not much further", () => {
    for (const [aspect, squareness] of SHAPES) {
      const { reach } = nozzle_outline_fit(aspect, squareness);
      let furthest = 0;

      // Walk the outline: every direction, out to where the measure is one
      for (let step = 0; step < 3600; step += 1) {
        const angle = (step / 3600) * 2 * Math.PI;
        const y = Math.sin(angle);
        const z = Math.cos(angle);

        // The measure is one-homogeneous, so the outline is at 1 / measure
        furthest = Math.max(furthest, 1 / measure(y, z, aspect, squareness));
      }

      expect(furthest).toBeLessThanOrEqual(reach + 1e-9);
      expect(furthest).toBeGreaterThan(reach * 0.7);
    }
  });

  it("holds the squareness to what can be drawn", () => {
    expect(clamp_nozzle_squareness(0)).toBe(NOZZLE_SQUARENESS_MIN);
    expect(clamp_nozzle_squareness(1000)).toBe(NOZZLE_SQUARENESS_MAX);
    expect(clamp_nozzle_squareness(3)).toBe(3);
  });

  it("widens the plume's bounds by its reach", () => {
    const profile = resolve_afterburner_profile();
    const round = jet_state(resolve_afterburner_params(), 1, profile);
    const oval = jet_state(
      resolve_afterburner_params({ nozzle_aspect: 2 }),
      1,
      profile,
    );
    const { reach } = nozzle_outline_fit(2, 2);

    expect(oval.outer_near_m).toBeCloseTo(round.outer_near_m * reach, 6);
    expect(oval.outer_far_m).toBeCloseTo(round.outer_far_m * reach, 6);
    expect(oval.reach_m).toBeCloseTo(round.reach_m, 6);
  });
});
