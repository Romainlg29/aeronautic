import { describe, expect, it } from "vitest";
import { angle_of_attack_for_load } from "./aerodynamics";
import { moist_air } from "./atmosphere";
import { shape_station, trapezoid_shape, type WingShape } from "./wing-shape";
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

  it("only makes the cone near the speed of sound, and a little past it", () => {
    const sound = moist_air(0, 0.9, 10).sound_m_s;

    const slow = vapor_state(airframe, pulling(0.6 * sound, 1), humid, look);
    const transonic = vapor_state(
      airframe,
      pulling(0.97 * sound, 1),
      humid,
      look,
    );
    const fast = vapor_state(airframe, pulling(1.8 * sound, 1), humid, look);

    expect(transonic.field.cone_bound_m).toBeGreaterThan(
      Math.max(slow.field.cone_bound_m * 3, airframe.fuselage_radius_m * 2),
    );
    expect(fast.field.cone_bound_m).toBe(0);

    // Just supersonic, it holds on round the aft body, its shock at the tail
    const supersonic = vapor_state(
      airframe,
      pulling(1.15 * sound, 1),
      humid,
      look,
    ).field;

    expect(supersonic.cone_bound_m).toBeGreaterThan(0);
    expect(supersonic.cone_shock).toBeGreaterThan(transonic.field.cone_shock);
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

describe("a roll or a sideslip", () => {
  /**
   * The deficit just behind each tip, a few metres down its trail.
   * @param flight The flight
   * @returns The +z side's and the -z side's
   */
  const behind_tips = (flight: VaporFlight) => {
    const state = vapor_state(airframe, flight, humid, look);
    const at = (points: Float32Array) =>
      vapor_deficit(state, points[3 * 6], points[3 * 6 + 1], points[3 * 6 + 2]);

    return [at(state.trails.positive), at(state.trails.negative)];
  };

  it("loads the downgoing wing in a roll", () => {
    const [positive, negative] = behind_tips({
      ...pulling(170, 6),
      roll_rate_rad_s: 3,
    });

    expect(positive).toBeGreaterThan(negative * 1.2);
  });

  it("loads the windward wing in a sideslip, and blows the trails downwind", () => {
    const flight = { ...pulling(170, 6), sideslip_rad: 0.08 };
    const [positive, negative] = behind_tips(flight);

    expect(positive).toBeGreaterThan(negative);

    const { trails } = vapor_state(airframe, flight, humid, look);
    const last = (trails.positive.length / 3 - 1) * 3;

    expect(trails.positive[last + 2]).toBeLessThan(trails.positive[2] - 1);
  });

  it("is symmetric without either", () => {
    const [positive, negative] = behind_tips(pulling(170, 6));

    expect(positive).toBeCloseTo(negative, 8);
  });
});

describe("a second lifting surface", () => {
  /**
   * The default airframe with a second surface of a given kind.
   * @param kind Canard or tailplane
   * @returns The wing, with it
   */
  const with_second = (kind: "canard" | "tail"): WingShape => ({
    ...trapezoid_shape(airframe),
    secondary: {
      kind,
      semispan_m: 2.8,
      tip_leading_m: kind === "canard" ? -6 : 7,
      tip_chord_m: 0.9,
      tip_height_m: 0.4,
      area_m2: 7,
    },
  });

  const state_with = (kind: "canard" | "tail") =>
    vapor_state(airframe, pulling(150, 7), humid, look, with_second(kind))
      .field;

  it("trails a canard's tips in a hard pull", () => {
    const field = state_with("canard");

    expect(field.second_circulation).toBeGreaterThan(0);
    expect(field.second_reach_m).toBeGreaterThan(5);
  });

  it("takes the canard's lift off the wing", () => {
    expect(state_with("canard").tip_circulation).toBeLessThan(
      vapor_state(airframe, pulling(150, 7), humid, look).field.tip_circulation,
    );
  });

  it("loads a tailplane far more lightly than a canard", () => {
    expect(state_with("tail").second_circulation).toBeLessThan(
      state_with("canard").second_circulation / 4,
    );
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
   * The most suction lost over a few stations, aft of the leading edge's own
   * peak, as a share of the strongest along the chord.
   * @param deficits The deficits along the chord
   * @param stations Over how many fiftieths of the chord
   * @returns The share
   */
  const sharpest_drop = (deficits: number[], stations = 1) =>
    Math.max(
      ...deficits
        .slice(10 + stations - 1)
        .map((d, i) => (deficits[i + 10 - 1] - d) / Math.max(...deficits)),
    );

  it("ends in a shock once the flow over it goes supersonic", () => {
    const sound = moist_air(0, 0.9, 10).sound_m_s;
    const state = vapor_state(airframe, pulling(0.97 * sound, 5), humid, look);

    // A quarter of the suction gone within one evaporation length behind
    // the shock: a few tenths of a metre on this chord
    expect(sharpest_drop(along_chord(state, 3), 8)).toBeGreaterThan(0.25);
  });

  it("lets bigger droplets linger longer behind the shock", () => {
    const sound = moist_air(0, 0.9, 10).sound_m_s;
    const flight = pulling(0.97 * sound, 5);

    const fine = vapor_state(airframe, flight, humid, {
      ...look,
      droplet_radius_m: 1e-6,
    });
    const coarse = vapor_state(airframe, flight, humid, {
      ...look,
      droplet_radius_m: 3e-6,
    });

    expect(coarse.field.evaporation_m).toBeCloseTo(
      fine.field.evaporation_m * 9,
      6,
    );
    expect(sharpest_drop(along_chord(coarse, 3), 2)).toBeLessThan(
      sharpest_drop(along_chord(fine, 3), 2),
    );
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
