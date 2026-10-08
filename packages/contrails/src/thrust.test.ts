import { moist_air, SEA_LEVEL_K, SEA_LEVEL_PA } from "@aeronautic/core";
import { describe, expect, it } from "vitest";
import { thrust_lapse } from "./thrust";

describe("the thrust lapse", () => {
  it("is the whole thrust standing at sea level", () => {
    expect(thrust_lapse(SEA_LEVEL_PA, SEA_LEVEL_K, 0)).toBeCloseTo(1, 6);
  });

  it("leaves about a third at the tropopause at Mach 0.85", () => {
    const air = moist_air(11_000, 0, 0);

    expect(thrust_lapse(air.pressurePa, air.temperatureK, 0.85)).toBeCloseTo(
      0.358,
      2,
    );
  });

  it("falls faster once the inlet is hotter than the throttle ratio", () => {
    const at = (mach: number) =>
      thrust_lapse(SEA_LEVEL_PA, SEA_LEVEL_K, mach) /
      (1 + 0.2 * mach ** 2) ** 3.5;

    expect(at(0.8)).toBeLessThan(at(0));
  });
});
