import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  TRAIL_MIN_AGE_S,
  TRAIL_POINTS_PER_EFOLD,
  TrailHistory,
  trail_ages,
  type TrailFlight,
} from "./history";
import { wake } from "./wake";

const flight = (fuel = 1e-3): TrailFlight => ({
  speedMPerS: 200,
  cosAlpha: 1,
  sinAlpha: 0,
  flowZ: 0,

  // No lift: the exhaust stays where it was left
  wake: wake(0, 0, 10, 0.4, 200, 0.01),
  fuelPerMetreKg: fuel,
});

const blank = (count: number) =>
  Array.from({ length: count }, () => ({
    x: 0,
    y: 0,
    z: 0,
    fuelPerMetreKg: 0,
    backX: 0,
    backY: 0,
    backZ: 0,
    speedMPerS: 0,
  }));

describe("trail ages", () => {
  it("start at the engine and end at the length", () => {
    const ages = trail_ages(10, 60);

    expect(ages[0]).toBe(0);
    expect(ages[9]).toBeCloseTo(60, 6);

    for (let index = 1; index < ages.length; index++) {
      expect(ages[index]).toBeGreaterThan(ages[index - 1]);
    }
  });

  it("go evenly in the plume's ageing", () => {
    const ages = trail_ages(160, 60);
    const aged = (index: number) => Math.log1p(ages[index] / TRAIL_MIN_AGE_S);

    expect(aged(2) - aged(1)).toBeCloseTo(aged(101) - aged(100), 9);
    expect(1 / (aged(2) - aged(1))).toBeGreaterThan(TRAIL_POINTS_PER_EFOLD);
  });

  it("spread from where the plume forms", () => {
    const ages = trail_ages(160, 60, 0.13);
    const before = ages.filter((age) => age > 0 && age < 0.13).length;

    // ln 2 of the ln(1 + 60 / 0.13) the trail spans: an eighth of it
    expect(before).toBeLessThan(160 / 8 + 2);
    expect(trail_ages(160, 60, Infinity)[1]).toBeCloseTo(
      trail_ages(160, 60)[1],
      12,
    );
  });
});

describe("the trail history", () => {
  it("lays straight back along the stream with no history", () => {
    const history = new TrailHistory();
    const points = blank(8);

    history.lay([1, 0, 2], trail_ages(8, 10), flight(), points);

    expect(points[7].x).toBeCloseTo(1 + 200 * 10, 3);
    expect(points[7].z).toBeCloseTo(2, 4);
  });

  it("lays a turn as the curve it was flown", () => {
    const history = new TrailHistory();
    const attitude = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const turning = flight();

    history.advance(0, attitude, turning, 30);

    // A level turn at 0.1 rad/s for ten seconds
    for (let frame = 0; frame < 600; frame++) {
      attitude.multiply(new Quaternion().setFromAxisAngle(up, 0.1 / 60));
      history.advance(1 / 60, attitude, turning, 30);
    }

    const points = blank(16);

    history.lay([0, 0, 0], trail_ages(16, 10), turning, points);

    // A turn's chord over a radian of it is 2 r sin ½, r = V / ω
    const end = points[15];

    expect(Math.hypot(end.x, end.z)).toBeCloseTo(2 * 2000 * Math.sin(0.5), -1);
    expect(Math.abs(end.z)).toBeGreaterThan(100);
  });

  it("lays an age in the same place whatever else is laid", () => {
    const history = new TrailHistory();
    const attitude = new Quaternion();
    const up = new Vector3(0, 1, 0);

    history.advance(0, attitude, flight(), 30);

    // Straight, then a hard turn, then straight again
    for (let frame = 0; frame < 900; frame++) {
      if (frame >= 300 && frame < 600) {
        attitude.multiply(new Quaternion().setFromAxisAngle(up, 0.5 / 60));
      }

      history.advance(1 / 60, attitude, flight(), 30);
    }

    const alone = blank(1);
    const among = blank(5);

    history.lay([1, 0, 2], new Float64Array([10.3]), flight(), alone);
    history.lay(
      [1, 0, 2],
      new Float64Array([0, 4.9, 10.3, 10.31, 14]),
      flight(),
      among,
    );

    expect(among[2].x).toBe(alone[0].x);
    expect(among[2].y).toBe(alone[0].y);
    expect(among[2].z).toBe(alone[0].z);

    // Back along the way it was flown then: a unit vector, and at the
    // airspeed
    expect(
      Math.hypot(alone[0].backX, alone[0].backY, alone[0].backZ),
    ).toBeCloseTo(1, 9);
    expect(alone[0].speedMPerS).toBe(200);
  });

  it("keeps the fuel each stretch was left with", () => {
    const history = new TrailHistory();
    const attitude = new Quaternion();
    const heavy = flight(2e-3);
    const light = flight(1e-3);

    for (let frame = 0; frame < 120; frame++) {
      history.advance(1 / 60, attitude, frame < 60 ? heavy : light, 10);
    }

    const points = blank(3);

    history.lay([0, 0, 0], new Float64Array([0, 0.5, 1.5]), light, points);

    expect(points[0].fuelPerMetreKg).toBe(1e-3);
    expect(points[2].fuelPerMetreKg).toBe(2e-3);
  });

  it("starts again after a long gap", () => {
    const history = new TrailHistory();
    const attitude = new Quaternion();

    for (let frame = 0; frame < 60; frame++) {
      history.advance(1 / 60, attitude, flight(), 10);
    }

    history.advance(5, attitude, flight(), 10);

    expect(history.spanS).toBe(0);
  });
});
