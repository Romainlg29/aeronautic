import { describe, expect, it } from "vitest";
import {
  dew_point,
  moist_air,
  saturation_pressure,
  standard_atmosphere,
} from "./atmosphere";

describe("standard_atmosphere", () => {
  it("is the standard day at sea level", () => {
    const air = standard_atmosphere(0);

    expect(air.temperature_k).toBeCloseTo(288.15);
    expect(air.pressure_pa).toBeCloseTo(101_325);
  });

  it("is the tropopause's at 11 km", () => {
    const air = standard_atmosphere(11_000);

    expect(air.temperature_k).toBeCloseTo(216.65, 1);
    expect(air.pressure_pa / 1000).toBeCloseTo(22.632, 1);
  });
});

describe("saturation_pressure", () => {
  it("matches the tables", () => {
    expect(saturation_pressure(273.15)).toBeCloseTo(611, -1);
    expect(saturation_pressure(293.15)).toBeCloseTo(2339, -2);
    expect(saturation_pressure(303.15)).toBeCloseTo(4246, -2);
  });

  it("is what dew_point inverts", () => {
    for (const temperature_k of [250, 273.15, 290, 310]) {
      expect(dew_point(saturation_pressure(temperature_k))).toBeCloseTo(
        temperature_k,
        6,
      );
    }
  });
});

describe("moist_air", () => {
  it("is at its dew point when saturated", () => {
    const air = moist_air(0, 1);

    expect(air.dew_point_k).toBeCloseTo(air.temperature_k, 6);
  });

  it("holds more water on a hot day at the same humidity", () => {
    expect(moist_air(0, 0.8, 15).mixing_ratio).toBeGreaterThan(
      moist_air(0, 0.8, -10).mixing_ratio * 2,
    );
  });

  it("is lighter for being moist", () => {
    expect(moist_air(0, 1, 10).density_kg_m3).toBeLessThan(
      moist_air(0, 0, 10).density_kg_m3,
    );
  });
});
