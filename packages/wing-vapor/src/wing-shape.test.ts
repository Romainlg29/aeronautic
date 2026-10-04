import { describe, expect, it } from "vitest";
import { default_vapor_airframe } from "./types";
import {
  lattice_loading,
  SHAPE_STATIONS,
  shape_planform,
  shape_station,
  trapezoid_shape,
} from "./wing-shape";

const airframe = default_vapor_airframe();

describe("trapezoid_shape", () => {
  it("is the airframe's planform", () => {
    const shape = trapezoid_shape(airframe);
    const tip = shape_station(shape, airframe.span_m / 2);

    expect(shape.leading_m[0]).toBeCloseTo(airframe.apex_m);
    expect(shape.chord_m[0]).toBeCloseTo(airframe.root_chord_m);
    expect(tip.chord_m).toBeCloseTo(airframe.tip_chord_m);

    const planform = shape_planform(shape);

    expect(planform.area_m2).toBeCloseTo(
      (airframe.span_m * (airframe.root_chord_m + airframe.tip_chord_m)) / 2,
      1,
    );
    expect(planform.sweep_rad).toBeCloseTo(airframe.leading_edge_sweep_rad, 3);
  });
});

describe("lattice_loading", () => {
  it("is elliptic on an elliptic wing", () => {
    // Prandtl's result: an elliptic planform, unswept at its quarter chord,
    // carries an elliptic loading
    const shape = trapezoid_shape({ ...airframe, span_m: 20 });

    for (let station = 0; station < SHAPE_STATIONS; station++) {
      const eta = station / (SHAPE_STATIONS - 1);
      const chord = 2 * Math.sqrt(Math.max(1 - eta * eta, 0));

      shape.chord_m[station] = Math.max(chord, 1e-3);
      shape.leading_m[station] = -chord / 4;
    }

    shape.loading.set(lattice_loading(shape));

    for (const eta of [0, 0.3, 0.6, 0.85]) {
      const elliptic = (4 / Math.PI) * Math.sqrt(1 - eta * eta);

      expect(
        Math.abs(shape_station(shape, eta * 10).loading - elliptic),
      ).toBeLessThan(0.06);
    }
  });

  it("averages one, and is nothing at the tip", () => {
    const { loading } = trapezoid_shape(airframe);

    let mean = 0;

    for (let station = 1; station < SHAPE_STATIONS; station++) {
      mean += (loading[station - 1] + loading[station]) / 2;
    }

    expect(mean / (SHAPE_STATIONS - 1)).toBeCloseTo(1, 3);
    expect(loading[SHAPE_STATIONS - 1]).toBe(0);
  });

  it("loads a swept wing's tips more than a straight one's", () => {
    const straight = {
      ...airframe,
      leading_edge_sweep_rad: 0,
      tip_chord_m: 9.2,
    };
    const swept = { ...straight, leading_edge_sweep_rad: 0.8 };

    expect(shape_station(trapezoid_shape(swept), 5.5).loading).toBeGreaterThan(
      shape_station(trapezoid_shape(straight), 5.5).loading,
    );
  });
});
