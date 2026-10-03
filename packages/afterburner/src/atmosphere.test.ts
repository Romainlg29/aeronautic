import { describe, expect, it } from "vitest";
import { atmosphere, standard_atmosphere } from "./atmosphere";
import { jet_state } from "./plume-profile";
import {
  resolve_afterburner_params,
  resolve_afterburner_profile,
} from "./presets";
import {
  default_afterburner_params,
  default_afterburner_profile,
} from "./types";

describe("standard_atmosphere", () => {
  it("matches the standard's tables at its layer boundaries", () => {
    expect(standard_atmosphere(0).pressure).toBeCloseTo(1);
    expect(standard_atmosphere(11_000).temperature_k).toBeCloseTo(216.65);
    expect(standard_atmosphere(11_000).pressure).toBeCloseTo(0.2234, 3);
    expect(standard_atmosphere(20_000).pressure).toBeCloseTo(0.05403, 4);
    expect(standard_atmosphere(32_000).temperature_k).toBeCloseTo(228.65);
    expect(standard_atmosphere(32_000).pressure).toBeCloseTo(0.008567, 5);
  });

  it("never runs out of air", () => {
    expect(standard_atmosphere(1e7).pressure).toBeGreaterThan(0);
    expect(standard_atmosphere(-500).pressure).toBe(1);
  });
});

describe("atmosphere", () => {
  it("thins the air on a hot day, at the same pressure", () => {
    const hot = atmosphere({
      ...default_afterburner_profile(),
      temperature_offset_k: 30,
    });

    expect(hot.pressure).toBeCloseTo(1);
    expect(hot.density).toBeLessThan(1);
  });

  it("rams an inlet that is moving", () => {
    const still = atmosphere(default_afterburner_profile());
    const flying = atmosphere({
      ...default_afterburner_profile(),
      airspeed_m_s: 300,
    });

    expect(still.ram).toBeCloseTo(1);
    expect(flying.ram).toBeGreaterThan(1.5);
  });
});

describe("jet_state in the air", () => {
  const rocket = {
    params: resolve_afterburner_params(undefined, "rocket_kerolox"),
    profile: resolve_afterburner_profile(undefined, "rocket_kerolox"),
  };

  const at = (altitude_m: number) => ({ ...rocket.profile, altitude_m });

  it("balloons and thins a rocket's plume as it climbs", () => {
    const low = jet_state(rocket.params, 1, at(0), 1);
    const high = jet_state(rocket.params, 1, at(30_000), 1);

    expect(high.pressure_ratio).toBeGreaterThan(50 * low.pressure_ratio);
    expect(high.radius_m).toBeGreaterThan(2 * low.radius_m);
    expect(high.thinning).toBeLessThan(low.thinning / 4);
  });

  it("quenches what burns in the plume once the air is too thin", () => {
    const low = jet_state(rocket.params, 1, at(0), 1);
    const high = jet_state(rocket.params, 1, at(60_000), 1);

    expect(high.afterburning_k).toBeLessThan(low.afterburning_k * 0.1);
  });

  it("keeps a jet's pressure ratio with altitude, the inlet thinning too", () => {
    const params = default_afterburner_params();
    const profile = default_afterburner_profile();

    const low = jet_state(params, 1, profile);
    const high = jet_state(params, 1, { ...profile, altitude_m: 11_000 });

    expect(high.pressure_ratio).toBeCloseTo(low.pressure_ratio);
  });

  it("stretches the core and the shock train in flight", () => {
    const params = default_afterburner_params();
    const profile = default_afterburner_profile();

    const still = jet_state(params, 1, profile);
    const flying = jet_state(params, 1, { ...profile, airspeed_m_s: 250 });

    expect(flying.core_length_m).toBeGreaterThan(still.core_length_m * 1.2);
    expect(flying.shock_length_m).toBeGreaterThan(still.shock_length_m);
    expect(flying.pressure_ratio).toBeGreaterThan(still.pressure_ratio);
  });
});
