import { describe, expect, it } from "vitest";
import {
  band_intensity,
  burn_time,
  drag_per_speed2,
  FLARE,
  flare_light,
  grain_at,
  grain_length,
  luminous_per_band,
  mass_rate,
  mixture_density,
  MTV_DENSITIES,
  MTV_FRACTIONS,
  terminal_speed,
} from "./flare";
import { band_radiance, blackbody_luminance } from "./graybody";

const mju7 = FLARE.mju7;

describe("the flame as a graybody", () => {
  // The candela's definition before 1979: a blackbody at platinum's
  // freezing point, 2042 K, is 60 cd/cm²
  it("is as bright as the old candela says at platinum's freezing point", () => {
    expect(blackbody_luminance(2042) / 6e5).toBeCloseTo(1, 1);
  });

  it("gives a seeker's two bands about what MTV1 measures", () => {
    // Debnath et al. measure 179 and 149 W s/(sr g): 1.2. A graybody gives
    // the short band more; the long band's surplus is the CO₂'s
    const ratio =
      band_radiance(1.8e-6, 2.6e-6, 2100) / band_radiance(3e-6, 5e-6, 2100);

    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.8);
  });
});

describe("the MJU-7's grain", () => {
  it("is as dense as its mixture", () => {
    expect(mixture_density(MTV_FRACTIONS, MTV_DENSITIES)).toBeCloseTo(1906, 0);
  });

  it("fits its 8 inch case", () => {
    const length = grain_length(mju7);

    expect(length).toBeGreaterThan(0.1);
    expect(length).toBeLessThan(0.2032);
  });

  it("burns for about three seconds, under the five a flare lasts", () => {
    expect(burn_time(mju7)).toBeCloseTo(0.0226 / (2 * 3.86e-3), 6);
    expect(burn_time(mju7)).toBeLessThan(5);
  });

  it("is gone when its thinnest side is", () => {
    const grain = grain_at(mju7, burn_time(mju7));

    expect(grain.massKg).toBe(0);
    expect(grain.surfaceM2).toBe(0);
  });

  it("radiates its measured energy over its burn", () => {
    // ∫ I dt = E m: integrated finely, the burn's whole energy in the band
    const steps = 20_000;
    const span = burn_time(mju7);
    let energy = 0;
    let burnt = 0;

    for (let step = 0; step < steps; step++) {
      const grain = grain_at(mju7, ((step + 0.5) * span) / steps);

      energy += (band_intensity(mju7, grain) * span) / steps;
      burnt += (mass_rate(mju7, grain) * span) / steps;
    }

    expect(burnt / mju7.massKg).toBeCloseTo(1, 3);
    expect(energy / (mju7.bandEnergyJPerKgSr * mju7.massKg)).toBeCloseTo(1, 3);
  });
});

describe("the MJU-7's flame", () => {
  const light = flare_light(mju7, grain_at(mju7, 0));

  it("is a few hundred thousand candela", () => {
    expect(light.intensityCd).toBeGreaterThan(1e5);
    expect(light.intensityCd).toBeLessThan(1e6);
  });

  it("is under a metre across, as an MTV flame is", () => {
    expect(light.radiusM).toBeGreaterThan(0.1);
    expect(light.radiusM * 2).toBeLessThan(1);
  });

  it("is as bright on its face as a graybody at its temperature", () => {
    const luminance = light.intensityCd / (Math.PI * light.radiusM ** 2);

    expect(luminance / (0.95 * blackbody_luminance(2100))).toBeCloseTo(1, 6);
  });

  it("is brighter for the eye, hotter", () => {
    expect(luminous_per_band({ ...mju7, temperatureK: 2200 })).toBeGreaterThan(
      luminous_per_band(mju7),
    );
  });
});

describe("the MJU-7's flight", () => {
  it("is slowed hard at an aircraft's speed", () => {
    // About 760 m/s² at 250 m/s near sea level: some 77 g
    const k = drag_per_speed2(mju7, grain_at(mju7, 0), 1.225);

    expect(k * 250 ** 2).toBeGreaterThan(600);
    expect(k * 250 ** 2).toBeLessThan(900);
  });

  it("falls at a few tens of metres a second", () => {
    expect(terminal_speed(mju7, 1.225)).toBeGreaterThan(20);
    expect(terminal_speed(mju7, 1.225)).toBeLessThan(40);
  });
});
