import { moist_air, SEA_LEVEL_K, SEA_LEVEL_PA } from "@aeronautic/core";
import { describe, expect, it } from "vitest";
import { reheat_consumption, thrust_lapse } from "./thrust";

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

  it("falls faster dry than with reheat once the inlet is hot", () => {
    expect(thrust_lapse(SEA_LEVEL_PA, SEA_LEVEL_K, 1, "military")).toBeLessThan(
      thrust_lapse(SEA_LEVEL_PA, SEA_LEVEL_K, 1),
    );

    // And the same while it is not
    const air = moist_air(11_000, 0, 0);

    expect(
      thrust_lapse(air.pressurePa, air.temperatureK, 0.85, "military"),
    ).toBe(thrust_lapse(air.pressurePa, air.temperatureK, 0.85));
  });
});

describe("reheat's consumption", () => {
  it("costs Mattingly's 1.8 times the dry standing, 1.6 at Mach 0.85", () => {
    expect(reheat_consumption(0)).toBeCloseTo(1.778, 3);
    expect(reheat_consumption(0.85)).toBeCloseTo(1.584, 3);
  });
});
