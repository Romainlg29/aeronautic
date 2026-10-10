import { describe, expect, it } from "vitest";
import {
  adiabatic_profile,
  condensation_level,
  droplet_extinction,
  DROPLET_SPREAD,
  DROPLETS_PER_M3,
  effective_radius,
  ice_extinction,
  ice_share,
  mie,
  mie_phase,
  moist_lapse_rate,
  rain_extinction,
  saturation_mixing_ratio,
  visibility,
} from "./microphysics";

describe("condensation_level", () => {
  it("is close to Espy's 125 m a kelvin of dew point depression", () => {
    const level = condensation_level(303.15, 293.15);

    expect(level.altitudeM).toBeGreaterThan(1150);
    expect(level.altitudeM).toBeLessThan(1350);
  });

  it("is at the ground in saturated air", () => {
    expect(condensation_level(288.15, 288.15).altitudeM).toBeLessThan(5);
  });

  it("saturates the parcel there", () => {
    const level = condensation_level(298.15, 285.15, 300);

    expect(
      saturation_mixing_ratio(level.temperatureK, level.altitudeM),
    ).toBeCloseTo(level.mixingRatio, 5);
  });
});

describe("moist_lapse_rate", () => {
  it("is about 4 K/km in warm air and nears the dry 9.8 in cold", () => {
    const warm = moist_lapse_rate(298.15, saturation_mixing_ratio(298.15, 0));
    const cold = moist_lapse_rate(
      233.15,
      saturation_mixing_ratio(233.15, 9000),
    );

    expect(warm * 1000).toBeGreaterThan(3.5);
    expect(warm * 1000).toBeLessThan(4.5);
    expect(cold * 1000).toBeGreaterThan(9);
  });
});

describe("adiabatic_profile", () => {
  it("condenses about 2 g/m³ a kilometre above a warm base", () => {
    const base = condensation_level(300.15, 293.15);
    const profile = adiabatic_profile(base, base.altitudeM + 1000, 11);

    expect(profile.waterKgPerM3[0]).toBeCloseTo(0, 4);
    expect(profile.waterKgPerM3[10] * 1000).toBeGreaterThan(1.5);
    expect(profile.waterKgPerM3[10] * 1000).toBeLessThan(2.8);
  });

  it("cools on the moist adiabat, slower than the dry", () => {
    const base = condensation_level(300.15, 293.15);
    const profile = adiabatic_profile(base, base.altitudeM + 1000, 2);
    const cooled = profile.temperatureK[0] - profile.temperatureK[1];

    expect(cooled).toBeGreaterThan(3);
    expect(cooled).toBeLessThan(6);
  });

  it("never condenses more than the parcel carried", () => {
    const base = condensation_level(300.15, 293.15);
    const profile = adiabatic_profile(base, 11_000, 32);
    const most = Math.max(...profile.waterKgPerM3);

    // The water a kilogram carried, in at most a kilogram of air a cubic metre
    expect(most).toBeLessThan(base.mixingRatio * 1.2);
  });
});

describe("droplets", () => {
  it("are about 11 µm in a maritime cloud of 0.5 g/m³", () => {
    const radius = effective_radius(
      5e-4,
      DROPLETS_PER_M3.maritime,
      DROPLET_SPREAD.maritime,
    );

    expect(radius * 1e6).toBeCloseTo(12.3, 0);
  });

  it("see about 50 m inside a cumulus", () => {
    const extinction = droplet_extinction(
      5e-4,
      DROPLETS_PER_M3.continental,
      DROPLET_SPREAD.continental,
    );

    expect(visibility(extinction)).toBeGreaterThan(30);
    expect(visibility(extinction)).toBeLessThan(80);
  });

  it("stop more light, the more of them share the water", () => {
    const water = 3e-4;

    expect(
      droplet_extinction(water, DROPLETS_PER_M3.continental, 0.8),
    ).toBeGreaterThan(droplet_extinction(water, DROPLETS_PER_M3.maritime, 0.8));
  });
});

describe("ice", () => {
  it("is none above freezing and all of it below −38 °C", () => {
    expect(ice_share(275)).toBe(0);
    expect(ice_share(230)).toBe(1);
    expect(ice_share(254.15)).toBeCloseTo(0.5, 2);
  });

  it("stops light as Fu's crystals do", () => {
    expect(ice_extinction(1e-5, 50e-6)).toBeCloseTo(6.7e-4, 5);
  });
});

describe("mie_phase", () => {
  it("is a sharp forward peak and a broad bulk", () => {
    const phase = mie_phase(20e-6);

    expect(phase.hg).toBeGreaterThan(0.98);
    expect(phase.draine).toBeGreaterThan(0.5);
    expect(phase.draine).toBeLessThan(0.7);
    expect(phase.weight).toBeGreaterThan(0.3);
    expect(phase.weight).toBeLessThan(0.6);
  });

  it("integrates to one over the sphere", () => {
    const phase = mie_phase(15e-6);
    const steps = 200_000;
    let sum = 0;

    for (let step = 0; step < steps; step++) {
      const cosine = -1 + (2 * (step + 0.5)) / steps;

      sum += mie(cosine, phase) * (2 / steps) * 2 * Math.PI;
    }

    expect(sum).toBeCloseTo(1, 2);
  });
});

describe("rain_extinction", () => {
  it("is 0.365 R^0.63 per kilometre", () => {
    expect(rain_extinction(10) * 1000).toBeCloseTo(0.365 * 10 ** 0.63, 2);
  });

  it("lets one see a couple of kilometres through 10 mm/h", () => {
    expect(visibility(rain_extinction(10))).toBeGreaterThan(2000);
    expect(visibility(rain_extinction(10))).toBeLessThan(3000);
  });
});
