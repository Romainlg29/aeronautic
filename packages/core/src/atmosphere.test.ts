import { describe, expect, it } from "vitest";
import {
  dew_point,
  moist_air,
  ram_pressure,
  saturation_pressure,
  speed_of_sound,
  standard_atmosphere,
} from "./atmosphere";

describe("standard_atmosphere", () => {
  it("is the standard day at sea level", () => {
    const air = standard_atmosphere(0);

    expect(air.temperatureK).toBeCloseTo(288.15);
    expect(air.pressurePa).toBeCloseTo(101_325);
  });

  it("is the tropopause's at 11 km", () => {
    const air = standard_atmosphere(11_000);

    expect(air.temperatureK).toBeCloseTo(216.65, 1);
    expect(air.pressurePa / 1000).toBeCloseTo(22.632, 1);
  });

  it("matches the standard's tables at its layer boundaries", () => {
    expect(standard_atmosphere(0).pressure).toBeCloseTo(1);
    expect(standard_atmosphere(11_000).pressure).toBeCloseTo(0.2234, 3);
    expect(standard_atmosphere(20_000).pressure).toBeCloseTo(0.05403, 4);
    expect(standard_atmosphere(32_000).temperatureK).toBeCloseTo(228.65);
    expect(standard_atmosphere(32_000).pressure).toBeCloseTo(0.008567, 5);
    expect(standard_atmosphere(71_000).temperatureK).toBeCloseTo(214.65, 1);
  });

  it("never runs out of air", () => {
    expect(standard_atmosphere(1e7).pressure).toBeGreaterThan(0);
    expect(standard_atmosphere(-500).pressure).toBe(1);
  });
});

describe("speed_of_sound", () => {
  it("is 340 m/s on a standard day at sea level", () => {
    expect(speed_of_sound(288.15)).toBeCloseTo(340.3, 0);
  });
});

describe("ram_pressure", () => {
  it("recovers nothing at rest, and more the faster it goes", () => {
    expect(ram_pressure(0)).toBe(1);
    expect(ram_pressure(0.9)).toBeGreaterThan(ram_pressure(0.5));
  });

  it("is isentropic below Mach 1, and loses some to the shocks above", () => {
    expect(ram_pressure(0.8)).toBeCloseTo(1.524, 3);
    expect(ram_pressure(2)).toBeLessThan(Math.pow(1 + 0.2 * 4, 3.5));
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

    expect(air.dewPointK).toBeCloseTo(air.temperatureK, 6);
  });

  it("holds more water on a hot day at the same humidity", () => {
    expect(moist_air(0, 0.8, 15).mixingRatio).toBeGreaterThan(
      moist_air(0, 0.8, -10).mixingRatio * 2,
    );
  });

  it("is lighter for being moist", () => {
    expect(moist_air(0, 1, 10).densityKgPerM3).toBeLessThan(
      moist_air(0, 0, 10).densityKgPerM3,
    );
  });
});
