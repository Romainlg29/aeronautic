import { moist_air } from "@aeronautic/core";
import { describe, expect, it } from "vitest";
import {
  humidity_over_water,
  ice_humidity,
  ice_saturation_pressure,
  water_saturation_pressure,
} from "./ice";
import { default_contrail_air } from "./types";

describe("saturation over ice and water", () => {
  it("meets at the triple point, 611.657 Pa", () => {
    expect(water_saturation_pressure(273.16)).toBeCloseTo(611.657, 2);
    expect(ice_saturation_pressure(273.16)).toBeCloseTo(611.657, 2);
  });

  it("holds less over ice than over supercooled water", () => {
    for (const t of [200, 220, 240, 260]) {
      expect(ice_saturation_pressure(t)).toBeLessThan(
        water_saturation_pressure(t),
      );
    }
  });

  it("matches Murphy and Koop's table at -50 °C: 3.94 Pa over ice", () => {
    expect(ice_saturation_pressure(223.15)).toBeCloseTo(3.94, 1);
  });
});

describe("humidity over ice", () => {
  it("is supersaturated in the default air, so its contrail persists", () => {
    const { altitudeM, relativeHumidity, temperatureOffsetK } =
      default_contrail_air();
    const humidity = ice_humidity(
      moist_air(altitudeM, relativeHumidity, temperatureOffsetK),
    );

    expect(humidity).toBeGreaterThan(1.05);
    expect(humidity).toBeLessThan(1.2);
  });

  it("turns back into the humidity over water it came from", () => {
    const air = moist_air(10_000, 0.5, 0);

    expect(
      humidity_over_water(ice_humidity(air), air.temperatureK),
    ).toBeCloseTo(0.5, 3);
  });
});
