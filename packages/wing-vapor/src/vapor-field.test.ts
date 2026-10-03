import { describe, expect, it } from "vitest";
import { angle_of_attack_for_load } from "./aerodynamics";
import { moist_air } from "./atmosphere";
import { shape_station } from "./wing-shape";
import {
  cone_pocket,
  vapor_deficit,
  vapor_state,
  wing_deficit,
  type VaporGeometry,
} from "./vapor-field";
import {
  default_vapor_airframe,
  type VaporAir,
  type VaporFlight,
} from "./types";

const airframe = default_vapor_airframe();
const humid: VaporAir = {
  altitude_m: 0,
  temperature_offset_k: 10,
  relative_humidity: 0.9,
};
const dry: VaporAir = { ...humid, relative_humidity: 0.2 };
const look = { humidity_spread: 0.05 };

/**
 * A flight pulling a given load at a given speed.
 * @param speed The airspeed
 * @param g The load factor
 * @param air The day
 * @returns The flight
 */
const pulling = (speed: number, g: number, air = humid): VaporFlight => ({
  airspeed_m_s: speed,
  angle_of_attack_rad: angle_of_attack_for_load(
    airframe,
    g,
    speed,
    moist_air(air.altitude_m, air.relative_humidity, air.temperature_offset_k),
  ),
});

describe("vapor_state", () => {
  it("draws nothing in dry air, however hard the pull", () => {
    expect(vapor_state(airframe, pulling(180, 8, dry), dry, look).visible).toBe(
      false,
    );
  });

  it("trails the tips in a hard pull, and not in a gentle one", () => {
    const hard = vapor_state(airframe, pulling(170, 7), humid, look).field;
    const gentle = vapor_state(airframe, pulling(170, 1), humid, look).field;

    expect(hard.tip_reach_m).toBeGreaterThan(10);
    expect(gentle.tip_reach_m).toBe(0);
  });

  it("trails them further in moister air", () => {
    const moister = { ...humid, relative_humidity: 0.97 };

    expect(
      vapor_state(airframe, pulling(170, 6, moister), moister, look).field
        .tip_reach_m,
    ).toBeGreaterThan(
      vapor_state(airframe, pulling(170, 6), humid, look).field.tip_reach_m,
    );
  });

  it("only makes the cone near the speed of sound", () => {
    const sound = moist_air(0, 0.9, 10).sound_m_s;

    const slow = vapor_state(airframe, pulling(0.6 * sound, 1), humid, look);
    const transonic = vapor_state(
      airframe,
      pulling(0.97 * sound, 1),
      humid,
      look,
    );
    const fast = vapor_state(airframe, pulling(1.3 * sound, 1), humid, look);

    expect(transonic.field.cone_bound_m).toBeGreaterThan(
      Math.max(slow.field.cone_bound_m * 3, airframe.fuselage_radius_m * 2),
    );
    expect(fast.field.cone_bound_m).toBe(0);
  });

  it("fits every part inside its bounds", () => {
    const state = vapor_state(airframe, pulling(300, 6), humid, look);
    const { min, max } = state.bounds;

    // A point well outside the box fogs nothing
    const outside = vapor_deficit(state, max[0] + 5, max[1] + 5, max[2] + 5);

    expect(outside).toBeLessThan(state.field.saturation_deficit);
    expect(min[0]).toBeLessThan(max[0]);
  });

  it("is the same on both wings", () => {
    const state = vapor_state(airframe, pulling(250, 6), humid, look);

    for (const [x, y, z] of [
      [0, 0.5, 3],
      [6, 1, 6.5],
      [20, 2, 5],
    ]) {
      expect(vapor_deficit(state, x, y, z)).toBeCloseTo(
        vapor_deficit(state, x, y, -z),
        10,
      );
    }
  });
});

describe("wing_deficit", () => {
  /**
   * The deficit just above the wing's surface, along one chord.
   * @param state The field and the wing's tables
   * @param span How far out
   * @returns The deficit at fifty stations, leading to trailing edge
   */
  const along_chord = (state: VaporGeometry, span: number) => {
    const station = shape_station(state.shape, span);

    return Array.from({ length: 50 }, (_, i) => {
      const xi = (i + 0.5) / 50;

      return wing_deficit(
        state,
        station.leading_m + xi * station.chord_m,
        station.mid_m +
          2 * station.thickness * station.chord_m * xi * (1 - xi) +
          0.01,
        span,
      );
    });
  };

  /**
   * The most suction lost from one station to the next, aft of the leading
   * edge's own peak, as a share of the strongest along the chord.
   * @param deficits The deficits along the chord
   * @returns The share
   */
  const sharpest_drop = (deficits: number[]) =>
    Math.max(
      ...deficits
        .slice(10)
        .map((d, i) => (deficits[i + 9] - d) / Math.max(...deficits)),
    );

  it("ends in a shock once the flow over it goes supersonic", () => {
    const sound = moist_air(0, 0.9, 10).sound_m_s;
    const state = vapor_state(airframe, pulling(0.97 * sound, 5), humid, look);

    // Somewhere aft of the nose, a quarter of the suction goes in one
    // fiftieth of the chord
    expect(sharpest_drop(along_chord(state, 3))).toBeGreaterThan(0.25);
  });

  it("recovers smoothly at low speed", () => {
    const state = vapor_state(airframe, pulling(120, 3), humid, look);

    expect(sharpest_drop(along_chord(state, 3))).toBeLessThan(0.08);
  });

  it("is nothing under the wing", () => {
    const state = vapor_state(airframe, pulling(250, 6), humid, look);
    const station = shape_station(state.shape, 3);

    expect(
      wing_deficit(state, station.leading_m + 1, station.mid_m - 0.5, 3),
    ).toBe(0);
  });
});

describe("cone_pocket", () => {
  it("builds from nothing to the shock", () => {
    expect(cone_pocket(0.2, 0.9)).toBe(0);
    expect(cone_pocket(0.7, 0.9)).toBeGreaterThan(cone_pocket(0.6, 0.9));
    expect(cone_pocket(0.9, 0.9)).toBe(1);
  });
});
