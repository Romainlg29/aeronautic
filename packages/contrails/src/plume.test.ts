import { moist_air, type MoistAir } from "@aeronautic/core";
import { describe, expect, it } from "vitest";
import { ice_humidity } from "./ice";
import {
  age_at_dilution,
  dilution,
  extinction_efficiency,
  mixing_slope,
  plume_at,
  plume_formation,
  schmidt_appleman,
} from "./plume";
import { CONTRAIL_FUEL } from "./types";

const kerosene = CONTRAIL_FUEL.kerosene;
const efficiency = 0.3;

/**
 * Schumann's (1996) fit for the tangent point, in kelvin.
 * @param g The mixing line's slope, Pa/K
 * @returns T_LM
 */
const schumann_tangent = (g: number) => {
  const l = Math.log(g - 0.053);

  return 273.15 - 46.46 + 9.43 * l + 0.72 * l * l;
};

const plume = (age: number, air: MoistAir) =>
  plume_at(
    age,
    {
      fuelPerMetreKg: 1e-3,
      efficiency,
      formation: plume_formation(air, kerosene, efficiency),
    },
    air,
    kerosene,
  );

describe("dilution", () => {
  it("is Schumann et al.'s 7000 t^0.8, and inverts", () => {
    expect(dilution(1)).toBeCloseTo(7000, 6);
    expect(dilution(10)).toBeCloseTo(7000 * Math.pow(10, 0.8), 3);
    expect(age_at_dilution(dilution(3.7))).toBeCloseTo(3.7, 6);
  });
});

describe("the Schmidt–Appleman criterion", () => {
  it("has Schumann's slope: 1.64 Pa/K for kerosene at 250 hPa, η = 0.3", () => {
    expect(mixing_slope(25_000, kerosene, 0.3)).toBeCloseTo(1.64, 1);
  });

  it("finds Schumann's tangent point", () => {
    for (const pressure of [20_000, 25_000, 30_000]) {
      const air = { ...moist_air(10_000, 0, 0), pressurePa: pressure };
      const criterion = schmidt_appleman(air, kerosene, efficiency);

      expect(criterion.tangentK).toBeCloseTo(
        schumann_tangent(criterion.slopePaPerK),
        0,
      );
    }
  });

  it("forms at 11 km on a standard day, not on one 20 K warmer", () => {
    expect(
      schmidt_appleman(moist_air(11_000, 0.3, 0), kerosene, 0.3).forms,
    ).toBe(true);
    expect(
      schmidt_appleman(moist_air(11_000, 0.3, 20), kerosene, 0.3).forms,
    ).toBe(false);
  });

  it("forms in warmer air for hydrogen, and for a more efficient engine", () => {
    const air = moist_air(10_000, 0.3, 0);
    const threshold = schmidt_appleman(air, kerosene, 0.3).thresholdK;

    expect(
      schmidt_appleman(air, CONTRAIL_FUEL.hydrogen, 0.3).thresholdK,
    ).toBeGreaterThan(threshold + 5);
    expect(schmidt_appleman(air, kerosene, 0.4).thresholdK).toBeGreaterThan(
      threshold,
    );
  });

  it("agrees with the plume followed out", () => {
    for (const offset of [-10, 0, 3, 6, 10, 20]) {
      const air = moist_air(11_000, 0.4, offset);

      expect(
        Number.isFinite(plume_formation(air, kerosene, 0.3).dilution),
      ).toBe(schmidt_appleman(air, kerosene, 0.3).forms);
    }
  });
});

describe("the plume", () => {
  it("forms a fraction of a second behind the engine, and freezes", () => {
    const formation = plume_formation(
      moist_air(11_000, 0.66, 0),
      kerosene,
      0.3,
    );
    const age = age_at_dilution(formation.dilution);

    expect(age).toBeGreaterThan(0.02);
    expect(age).toBeLessThan(1);
    expect(formation.freezeDilution).toBeGreaterThanOrEqual(formation.dilution);
    expect(Number.isFinite(formation.freezeDilution)).toBe(true);
  });

  it("is clear before it forms", () => {
    expect(plume(0.01, moist_air(11_000, 0.66, 0)).extinctionM).toBe(0);
  });

  it("lasts in air supersaturated over ice, and fades in dry air", () => {
    const wet = moist_air(11_000, 0.66, 0);
    const dry = moist_air(11_000, 0.3, 0);

    expect(ice_humidity(wet)).toBeGreaterThan(1);
    expect(ice_humidity(dry)).toBeLessThan(1);

    expect(plume(1, dry).extinctionM).toBeGreaterThan(0);
    expect(plume(300, dry).extinctionM).toBe(0);
    expect(plume(1800, wet).extinctionM).toBeGreaterThan(
      plume(1, wet).extinctionM,
    );
  });

  it("spreads as the air it mixes with: σ grows as t^0.4", () => {
    const air = moist_air(11_000, 0.66, 0);
    const ratio = plume(100, air).sigmaM / plume(1, air).sigmaM;

    expect(ratio).toBeCloseTo(Math.pow(100, 0.4), 0);
  });

  it("has micron crystals, and an optical depth near one when young", () => {
    const young = plume(1, moist_air(11_000, 0.66, 0));
    const tau = young.extinctionM / (Math.sqrt(2 * Math.PI) * young.sigmaM);

    expect(young.crystalRadiusM).toBeGreaterThan(0.2e-6);
    expect(young.crystalRadiusM).toBeLessThan(5e-6);
    expect(tau).toBeGreaterThan(0.1);
    expect(tau).toBeLessThan(5);
  });
});

describe("extinction efficiency", () => {
  it("tends to two for large particles, and to nothing for small", () => {
    expect(extinction_efficiency(1e-3)).toBeCloseTo(2, 2);
    expect(extinction_efficiency(1e-9)).toBeLessThan(1e-3);
  });
});
