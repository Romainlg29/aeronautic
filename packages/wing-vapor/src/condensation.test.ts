import { describe, expect, it } from "vitest";
import { AIR_CP, AIR_GAS_CONSTANT, moist_air } from "@aeronautic/core";
import {
  CONDENSATION_TEXELS,
  cloud_extinction,
  condensate,
  condensation_table,
  moistest,
  saturation_ratio,
} from "./condensation";

const humid = moist_air(0, 0.9, 10);

describe("condensate", () => {
  it("leaves unexpanded air as it is", () => {
    const parcel = condensate(1, humid);

    expect(parcel.liquid).toBe(0);
    expect(parcel.temperatureK).toBeCloseTo(humid.temperatureK);
  });

  it("condenses nothing until the expansion reaches the dew point", () => {
    // About 1.2 % of pressure per kelvin, near the ground
    const short_of_it =
      1 -
      ((humid.temperatureK - humid.dewPointK) * AIR_CP) /
        (AIR_GAS_CONSTANT * humid.temperatureK) /
        2;

    expect(condensate(short_of_it, humid).liquid).toBe(0);
    expect(condensate(0.9, humid).liquid).toBeGreaterThan(0);
  });

  it("is warmer than the dry adiabat, for the latent heat", () => {
    const dry = humid.temperatureK * Math.pow(0.85, AIR_GAS_CONSTANT / AIR_CP);

    expect(condensate(0.85, humid).temperatureK).toBeGreaterThan(dry + 1);
  });

  it("makes cloud of a real cloud's water content", () => {
    // A tenth off the pressure of warm, humid air: grams per cubic metre
    const grams = condensate(0.9, humid).waterKgPerM3 * 1000;

    expect(grams).toBeGreaterThan(0.3);
    expect(grams).toBeLessThan(5);
  });

  it("makes more the deeper the expansion and the moister the air", () => {
    expect(condensate(0.8, humid).liquid).toBeGreaterThan(
      condensate(0.9, humid).liquid,
    );
    expect(condensate(0.9, humid, 1.05).liquid).toBeGreaterThan(
      condensate(0.9, humid).liquid,
    );
  });

  it("makes nothing in dry air", () => {
    expect(condensate(0.85, moist_air(0, 0.2, 10)).liquid).toBe(0);
  });
});

describe("condensation_table", () => {
  it("falls to nothing at one, over the range a wing reaches", () => {
    const table = condensation_table(humid);

    expect(table.length).toBe(CONDENSATION_TEXELS * 4);
    expect(table[(CONDENSATION_TEXELS - 1) * 4 + 1]).toBe(0);

    // Below about half an atmosphere's ratio the thinning air holds less per
    // cubic metre for all it condenses: the table is only monotonic above
    for (
      let texel = CONDENSATION_TEXELS / 2;
      texel < CONDENSATION_TEXELS;
      texel++
    ) {
      expect(table[texel * 4 + 1]).toBeLessThanOrEqual(
        table[(texel - 1) * 4 + 1],
      );
      expect(table[texel * 4]).toBeLessThanOrEqual(table[texel * 4 + 1]);
      expect(table[texel * 4 + 2]).toBeGreaterThanOrEqual(table[texel * 4 + 1]);
    }
  });
});

describe("moistest", () => {
  it("keeps the moistest patches short of saturation", () => {
    const air = moist_air(0, 0.97, 10);

    expect(air.relativeHumidity * moistest(air, 0.06)).toBeLessThan(1);
    expect(moistest(moist_air(0, 0.5, 10), 0.06)).toBeCloseTo(1.06);
  });

  it("condenses nothing in unexpanded air, however humid the day", () => {
    const air = moist_air(0, 0.99, 10);

    expect(condensate(1, air, moistest(air, 0.1)).liquid).toBe(0);
  });
});

describe("saturation_ratio", () => {
  it("is nearer one the moister the air", () => {
    expect(saturation_ratio(moist_air(0, 0.95, 10))).toBeGreaterThan(
      saturation_ratio(moist_air(0, 0.6, 10)),
    );
  });
});

describe("cloud_extinction", () => {
  it("is a cloud's: tens of metres of visibility at a gram per cubic metre", () => {
    const per_m = cloud_extinction(1e-3, 10e-6);

    expect(3.9 / per_m).toBeGreaterThan(10);
    expect(3.9 / per_m).toBeLessThan(100);
  });
});
