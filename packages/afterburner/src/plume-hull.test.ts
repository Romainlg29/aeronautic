import { describe, expect, it } from "vitest";
import { build_plume_hull } from "./plume-hull";
import { jet_half_width, jet_state, plume_extent } from "./plume-profile";
import {
  AFTERBURNER_PRESETS,
  resolve_afterburner_params,
  resolve_afterburner_profile,
  type AfterburnerPresetName,
} from "./presets";

/**
 * Read one vertex out of a hull.
 * @param positions The hull's position buffer
 * @param vertex Which vertex to read
 * @returns It, as [x, y, z]
 */
const vertex_at = (
  positions: ArrayLike<number>,
  vertex: number,
): [number, number, number] => [
  positions[vertex * 3],
  positions[vertex * 3 + 1],
  positions[vertex * 3 + 2],
];

describe("build_plume_hull", () => {
  const sides = 10;

  const hull = build_plume_hull(sides);

  const positions = hull.getAttribute("position").array;

  it("runs from the nozzle at the origin to the tip at x = 1", () => {
    expect(vertex_at(positions, 0)).toEqual([0, 0, 0]);
    expect(vertex_at(positions, 1)).toEqual([1, 0, 0]);
  });

  it("has two rings and a centre at each end", () => {
    expect(positions.length / 3).toBe(2 + sides * 2);
  });

  it("circumscribes the unit circle at both ends", () => {
    for (let side = 0; side < sides * 2; side++) {
      const [, y, z] = vertex_at(positions, 2 + side);

      expect(Math.hypot(y, z)).toBeGreaterThanOrEqual(1);
    }
  });

  it("is wound so every triangle exists", () => {
    expect(hull.getIndex()?.count).toBe(sides * 12);
  });
});

// The vertex stage opens the rings to the field's extent at each end, so the
// straight line between them has to hold the field everywhere between
describe("the per instance frustum", () => {
  for (const name of Object.keys(
    AFTERBURNER_PRESETS,
  ) as AfterburnerPresetName[]) {
    it(`holds every station of ${name}`, () => {
      const params = resolve_afterburner_params(undefined, name);
      const profile = resolve_afterburner_profile(undefined, name);

      for (const throttle of [0, 0.5, 1]) {
        const state = jet_state(params, throttle, profile);
        const extent = plume_extent(params);

        for (let step = 0; step <= 40; step++) {
          const x = (state.reachM * step) / 40;
          const along = x / state.reachM;

          const hull_m =
            state.outerNearM + (state.outerFarM - state.outerNearM) * along;

          expect(hull_m).toBeGreaterThanOrEqual(
            (jet_half_width(x, state) * extent) / 1.05 - 1e-9,
          );
        }
      }
    });
  }
});
