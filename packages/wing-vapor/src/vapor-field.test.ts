import { describe, expect, it } from "vitest";
import { angle_of_attack_for_load } from "./aerodynamics";
import { moist_air } from "@aeronautic/core";
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
  altitudeM: 0,
  temperatureOffsetK: 10,
  relativeHumidity: 0.9,
};
const dry: VaporAir = { ...humid, relativeHumidity: 0.2 };
const look = { humiditySpread: 0.05 };

/**
 * A flight pulling a given load at a given speed.
 * @param speed The airspeed
 * @param g The load factor
 * @param air The day
 * @returns The flight
 */
const pulling = (speed: number, g: number, air = humid): VaporFlight => ({
  airspeedMPerS: speed,
  angleOfAttackRad: angle_of_attack_for_load(
    airframe,
    g,
    speed,
    moist_air(air.altitudeM, air.relativeHumidity, air.temperatureOffsetK),
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

    expect(hard.tipReachM).toBeGreaterThan(10);
    expect(gentle.tipReachM).toBe(0);
  });

  it("trails a thread from the tip that swells as it rolls up", () => {
    const state = vapor_state(airframe, pulling(170, 7), humid, look);
    const { field } = state;
    const points = state.trails.positive;

    // How wide the fogging tube is at one point of the trail, straight up
    // from its axis
    const width = (point: number) => {
      const [x, y, z] = points.slice(point * 3, point * 3 + 3);
      let radius = 0;

      while (
        radius < 5 &&
        vapor_deficit(state, x, y + radius, z) > field.saturationDeficit
      ) {
        radius += 0.01;
      }

      return radius;
    };

    const rolled = Math.round((2 * field.tipRollupM) / field.trailSpacingM);

    expect(field.tipRollupM).toBeGreaterThan(0.5 * airframe.spanM);
    expect(width(0)).toBeGreaterThan(0);
    expect(width(0)).toBeLessThan(0.7 * width(rolled));
  });

  it("trails them further in moister air", () => {
    const moister = { ...humid, relativeHumidity: 0.97 };

    expect(
      vapor_state(airframe, pulling(170, 6, moister), moister, look).field
        .tipReachM,
    ).toBeGreaterThan(
      vapor_state(airframe, pulling(170, 6), humid, look).field.tipReachM,
    );
  });

  it("only makes the cone near the speed of sound, and a little past it", () => {
    const sound = moist_air(0, 0.9, 10).soundMPerS;
    const at = (mach: number) =>
      vapor_state(airframe, pulling(mach * sound, 1), humid, look).field;

    const slow = at(0.6);
    const subcritical = at(0.9);
    const transonic = at(0.99);

    expect(transonic.coneBoundM).toBeGreaterThan(
      Math.max(slow.coneBoundM * 3, airframe.fuselageRadiusM * 2),
    );
    // Short of the body's critical Mach number there's no pocket to fill
    expect(subcritical.coneBoundM).toBeLessThan(transonic.coneBoundM / 2);

    // Just supersonic, it holds on round the aft body, its shock at the tail
    const supersonic = at(1.05);

    expect(supersonic.coneBoundM).toBeGreaterThan(0);
    expect(supersonic.coneShock).toBeGreaterThan(transonic.coneShock);

    // And a few hundredths on it's gone
    expect(at(1.15).coneBoundM).toBe(0);
    expect(at(1.8).coneBoundM).toBe(0);
  });

  it("swells the cone smoothly through the critical Mach number", () => {
    const sound = moist_air(0, 0.9, 10).soundMPerS;
    let last: number | undefined;

    for (let mach = 0.9; mach <= 1.0; mach += 0.002) {
      const { coneStrength: cone_strength } = vapor_state(
        airframe,
        pulling(mach * sound, 1),
        humid,
        look,
      ).field;

      if (last !== undefined) {
        expect(Math.abs(cone_strength - last)).toBeLessThan(0.005);
      }
      last = cone_strength;
    }
  });

  it("fits every part inside its bounds", () => {
    const state = vapor_state(airframe, pulling(300, 6), humid, look);
    const { min, max } = state.bounds;

    // A point well outside the box fogs nothing
    const outside = vapor_deficit(state, max[0] + 5, max[1] + 5, max[2] + 5);

    expect(outside).toBeLessThan(state.field.saturationDeficit);
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
      rollRateRadPerS: 3,
    });

    expect(positive).toBeGreaterThan(negative * 1.2);
  });

  it("loads the windward wing in a sideslip, and blows the trails downwind", () => {
    const flight = { ...pulling(170, 6), sideslipRad: 0.08 };
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
      semispanM: 2.8,
      tipLeadingM: kind === "canard" ? -6 : 7,
      tipChordM: 0.9,
      tipHeightM: 0.4,
      areaM2: 7,
    },
  });

  const state_with = (kind: "canard" | "tail") =>
    vapor_state(airframe, pulling(150, 7), humid, look, with_second(kind))
      .field;

  it("trails a canard's tips in a hard pull", () => {
    const field = state_with("canard");

    expect(field.secondCirculation).toBeGreaterThan(0);
    expect(field.secondReachM).toBeGreaterThan(5);
  });

  it("takes the canard's lift off the wing", () => {
    expect(state_with("canard").tipCirculation).toBeLessThan(
      vapor_state(airframe, pulling(150, 7), humid, look).field.tipCirculation,
    );
  });

  it("loads a tailplane far more lightly than a canard", () => {
    expect(state_with("tail").secondCirculation).toBeLessThan(
      state_with("canard").secondCirculation / 4,
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
        station.leadingM + xi * station.chordM,
        station.midM +
          2 * station.thickness * station.chordM * xi * (1 - xi) +
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
    const sound = moist_air(0, 0.9, 10).soundMPerS;
    const state = vapor_state(airframe, pulling(0.97 * sound, 5), humid, look);

    // A quarter of the suction gone within one evaporation length behind
    // the shock: a few tenths of a metre on this chord
    expect(sharpest_drop(along_chord(state, 3), 8)).toBeGreaterThan(0.25);
  });

  it("lets bigger droplets linger longer behind the shock", () => {
    const sound = moist_air(0, 0.9, 10).soundMPerS;
    const flight = pulling(0.97 * sound, 5);

    const fine = vapor_state(airframe, flight, humid, {
      ...look,
      dropletRadiusM: 1e-6,
    });
    const coarse = vapor_state(airframe, flight, humid, {
      ...look,
      dropletRadiusM: 3e-6,
    });

    expect(coarse.field.evaporationM).toBeCloseTo(
      fine.field.evaporationM * 9,
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
      wing_deficit(state, station.leadingM + 1, station.midM - 0.5, 3),
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
