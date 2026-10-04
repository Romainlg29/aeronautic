import { describe, expect, it } from "vitest";
import {
  angle_of_attack_for_load,
  breakdown_angles,
  breakdown_fraction,
  critical_pressure,
  flight_state,
  karman_tsien,
  lift_slope,
  planform,
  polhamus,
} from "./aerodynamics";
import { moist_air } from "./atmosphere";
import { default_vapor_airframe } from "./types";

const airframe = default_vapor_airframe();
const air = moist_air(0, 0.8);
const DEG = Math.PI / 180;

describe("planform", () => {
  it("is the docs' fighter: a low aspect ratio delta", () => {
    const shape = planform(airframe);

    expect(shape.area_m2).toBeCloseTo(75.6, 1);
    expect(shape.aspect_ratio).toBeGreaterThan(2);
    expect(shape.aspect_ratio).toBeLessThan(3);
  });
});

describe("lift_slope", () => {
  it("is slender-wing theory's πA/2 for a slender wing", () => {
    const slender = {
      ...airframe,
      span_m: 2,
      root_chord_m: 20,
      tip_chord_m: 0,
    };
    const a = planform(slender).aspect_ratio;

    expect(lift_slope(slender, 0)).toBeCloseTo((Math.PI * a) / 2, 1);
  });

  it("nears 2π for a long straight wing", () => {
    const glider = {
      ...airframe,
      span_m: 40,
      root_chord_m: 1,
      tip_chord_m: 1,
      leading_edge_sweep_rad: 0,
    };

    expect(lift_slope(glider, 0)).toBeGreaterThan(5.2);
    expect(lift_slope(glider, 0)).toBeLessThan(2 * Math.PI);
  });

  it("rises with Mach number", () => {
    expect(lift_slope(airframe, 0.8)).toBeGreaterThan(lift_slope(airframe, 0));
  });
});

describe("polhamus", () => {
  it("gives a sharp swept edge about π of vortex lift, and a round one less", () => {
    expect(polhamus(airframe, 0).vortex).toBeGreaterThan(2.5);
    expect(polhamus(airframe, 0).vortex).toBeLessThan(4);
    expect(
      polhamus({ ...airframe, leading_edge_sharpness: 0.5 }, 0).vortex,
    ).toBeCloseTo(polhamus(airframe, 0).vortex / 2);
  });
});

describe("breakdown", () => {
  it("bursts later on a more swept edge", () => {
    expect(breakdown_angles(70 * DEG).trailing_edge).toBeGreaterThan(
      breakdown_angles(55 * DEG).trailing_edge,
    );
    expect(breakdown_angles(70 * DEG).trailing_edge / DEG).toBeCloseTo(30, -1);
  });

  it("marches up the wing with the angle of attack", () => {
    let last = 1;

    for (let degrees = 0; degrees <= 40; degrees += 2) {
      const whole = breakdown_fraction(airframe, degrees * DEG);

      expect(whole).toBeLessThanOrEqual(last);
      last = whole;
    }

    expect(breakdown_fraction(airframe, 2 * DEG)).toBe(1);
    expect(breakdown_fraction(airframe, 40 * DEG)).toBe(0);
  });
});

describe("flight_state", () => {
  it("is one g in a level cruise, near enough", () => {
    const alpha = angle_of_attack_for_load(airframe, 1, 200, air);
    const state = flight_state(
      airframe,
      { airspeed_m_s: 200, angle_of_attack_rad: alpha },
      air,
    );

    expect(state.load_factor).toBeCloseTo(1, 3);
    expect(alpha / DEG).toBeGreaterThan(1);
    expect(alpha / DEG).toBeLessThan(6);
  });

  it("needs more angle of attack to pull harder, and the circulation follows", () => {
    const easy = angle_of_attack_for_load(airframe, 3, 180, air);
    const hard = angle_of_attack_for_load(airframe, 7, 180, air);

    expect(hard).toBeGreaterThan(easy);

    const circulation = (alpha: number) =>
      flight_state(
        airframe,
        { airspeed_m_s: 180, angle_of_attack_rad: alpha },
        air,
      ).tip_circulation;

    expect(circulation(hard) / circulation(easy)).toBeCloseTo(7 / 3, 3);
  });

  it("stops at the stall", () => {
    const alpha = angle_of_attack_for_load(airframe, 50, 100, air);

    expect(alpha / DEG).toBeGreaterThan(20);
    expect(alpha / DEG).toBeLessThan(50);
  });

  it("grows its leading-edge vortex with the angle of attack", () => {
    const at = (degrees: number) =>
      flight_state(
        airframe,
        { airspeed_m_s: 150, angle_of_attack_rad: degrees * DEG },
        air,
      ).leading_edge_circulation;

    expect(at(0)).toBe(0);
    expect(at(10)).toBeGreaterThan(at(5));
  });
});

describe("compressibility", () => {
  it("is Prandtl–Glauert for a weak disturbance", () => {
    expect(karman_tsien(-1e-4, 0.6)).toBeCloseTo(-1e-4 / 0.8, 8);
  });

  it("is sonic at a pressure coefficient of zero at Mach one", () => {
    expect(critical_pressure(1)).toBeCloseTo(0, 6);
    expect(critical_pressure(0.8)).toBeCloseTo(-0.435, 2);
  });
});
