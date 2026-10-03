import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  nearest_along,
  straight_trails,
  TRAIL_POINTS,
  TrailHistory,
  type TrailLayout,
} from "./trails";

const layout: TrailLayout = {
  tip_x: 5,
  tip_y: 0,
  semispan_m: 7,
  cos_alpha: 1,
  sin_alpha: 0,
  flow_z: 0,
  descent: 0,
  rollup_m: 1e9,
  length_m: 200,
};

const point = (points: Float32Array, index: number) =>
  new Vector3().fromArray(points, index * 3);

/**
 * Fly a history at a constant rate of turn.
 * @param axis What it turns about, in its own canonical frame
 * @param rate_rad_s How fast
 * @param seconds For how long
 * @param speed The airspeed
 * @returns The history
 */
const fly = (
  axis: Vector3,
  rate_rad_s: number,
  seconds: number,
  speed = 200,
  fps = 60,
) => {
  const history = new TrailHistory();
  const attitude = new Quaternion();
  const step = new Quaternion().setFromAxisAngle(axis, rate_rad_s / fps);

  for (let frame = 0; frame < seconds * fps; frame++) {
    // Turning about its own axis: the step on the right
    attitude.multiply(step);
    history.advance(1 / fps, attitude, speed, 1, 0, 400);
  }

  return history;
};

describe("TrailHistory", () => {
  it("lays straight trails in steady flight", () => {
    const flown = fly(new Vector3(1, 0, 0), 0, 3).paths(layout);
    const straight = straight_trails(layout);

    for (let index = 0; index < TRAIL_POINTS; index += 7) {
      expect(
        point(flown.positive, index).distanceTo(
          point(straight.positive, index),
        ),
      ).toBeLessThan(1e-3);
    }
  });

  it("corkscrews in a roll", () => {
    // A roll about the flight path, the canonical x, at a turn a second: at
    // 200 m/s, the trail turns once every 200 m of air
    const { positive } = fly(new Vector3(1, 0, 0), 2 * Math.PI, 3).paths(
      layout,
    );

    const at = (metres: number) =>
      point(positive, Math.round((metres / 200) * (TRAIL_POINTS - 1)));

    // Still on the tip's circle round the axis, but turned: half a turn back
    // at 100 m, it is on the other side
    expect(Math.hypot(at(100).y, at(100).z)).toBeCloseTo(7, 0);
    expect(at(100).z).toBeLessThan(-6);
    expect(at(200).z).toBeGreaterThan(6);
    // And a hundred metres of air back, give or take a point's spacing
    expect(Math.abs(at(100).x - 105)).toBeLessThan(200 / (TRAIL_POINTS - 1));
  });

  it("curves round a turn, at its radius", () => {
    // A level turn about the canonical y at 0.2 rad/s: a 1000 m radius at
    // 200 m/s. A hundred metres back, the path has fallen s²/2R to one side
    const { positive, negative } = fly(new Vector3(0, 1, 0), 0.2, 3).paths(
      layout,
    );

    const back = Math.round((100 / 200) * (TRAIL_POINTS - 1));
    const offset = point(positive, back).z - point(positive, 0).z;
    const along = (back / (TRAIL_POINTS - 1)) * 200;

    expect(Math.abs(Math.abs(offset) - (along * along) / 2000)).toBeLessThan(
      0.5,
    );

    // Both trails bend the same way
    expect(Math.sign(point(negative, back).z - point(negative, 0).z)).toBe(
      Math.sign(offset),
    );
  });

  it("lays the same trail at three frames a second as at sixty", () => {
    const smooth = fly(new Vector3(1, 0, 0), 2, 3).paths(layout);
    const choppy = fly(new Vector3(1, 0, 0), 2, 3, 200, 3).paths(layout);

    for (let index = 0; index < TRAIL_POINTS; index += 9) {
      expect(
        point(smooth.positive, index).distanceTo(point(choppy.positive, index)),
      ).toBeLessThan(0.5);
    }
  });

  it("starts again after a long gap", () => {
    const history = fly(new Vector3(1, 0, 0), 2, 1);

    history.advance(5, new Quaternion(), 200, 1, 0, 400);

    // Nothing but the frame after the gap: straight
    const straight = straight_trails(layout).positive;

    expect(
      point(history.paths(layout).positive, 40).distanceTo(point(straight, 40)),
    ).toBeLessThan(1e-3);
  });
});

describe("nearest_along", () => {
  it("finds how far along a curved trail a point beside it is", () => {
    const { positive, spacing_m } = fly(new Vector3(0, 1, 0), 0.4, 3).paths(
      layout,
    );

    const index = 40;
    const beside = point(positive, index).add(new Vector3(0, 0.5, 0));

    expect(
      nearest_along(positive, spacing_m, layout, beside.x, beside.y, beside.z),
    ).toBeCloseTo(index * spacing_m, 0);
  });
});
