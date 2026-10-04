import { describe, expect, it } from "vitest";
import { atmosphere } from "./atmosphere";
import { jet_state } from "./plume-profile";
import {
  resolve_afterburner_params,
  resolve_afterburner_profile,
} from "./presets";
import {
  default_afterburner_params,
  default_afterburner_profile,
} from "./types";

describe("atmosphere", () => {
  it("thins the air on a hot day, at the same pressure", () => {
    const hot = atmosphere({
      ...default_afterburner_profile(),
      temperatureOffsetK: 30,
    });

    expect(hot.pressure).toBeCloseTo(1);
    expect(hot.density).toBeLessThan(1);
  });

  it("rams an inlet that is moving", () => {
    const still = atmosphere(default_afterburner_profile());
    const flying = atmosphere({
      ...default_afterburner_profile(),
      airspeedMPerS: 300,
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

  const at = (altitude_m: number) => ({
    ...rocket.profile,
    altitudeM: altitude_m,
  });

  it("balloons and thins a rocket's plume as it climbs", () => {
    const low = jet_state(rocket.params, 1, at(0), 1);
    const high = jet_state(rocket.params, 1, at(30_000), 1);

    expect(high.pressureRatio).toBeGreaterThan(50 * low.pressureRatio);
    expect(high.radiusM).toBeGreaterThan(2 * low.radiusM);
    expect(high.thinning).toBeLessThan(low.thinning / 4);
  });

  it("quenches what burns in the plume once the air is too thin", () => {
    const low = jet_state(rocket.params, 1, at(0), 1);
    const high = jet_state(rocket.params, 1, at(60_000), 1);

    expect(high.afterburningK).toBeLessThan(low.afterburningK * 0.1);
  });

  it("keeps a jet's pressure ratio with altitude, the inlet thinning too", () => {
    const params = default_afterburner_params();
    const profile = default_afterburner_profile();

    const low = jet_state(params, 1, profile);
    const high = jet_state(params, 1, { ...profile, altitudeM: 11_000 });

    expect(high.pressureRatio).toBeCloseTo(low.pressureRatio);
  });

  it("stretches the core and the shock train in flight", () => {
    const params = default_afterburner_params();
    const profile = default_afterburner_profile();

    const still = jet_state(params, 1, profile);
    const flying = jet_state(params, 1, { ...profile, airspeedMPerS: 250 });

    expect(flying.coreLengthM).toBeGreaterThan(still.coreLengthM * 1.2);
    expect(flying.shockLengthM).toBeGreaterThan(still.shockLengthM);
  });

  it("opens a jet's nozzle with the ram, keeping its exit near design", () => {
    const params = default_afterburner_params();
    const profile = default_afterburner_profile();

    const still = jet_state(params, 1, profile);
    const cruise = jet_state(params, 1, { ...profile, airspeedMPerS: 250 });
    const dash = jet_state(params, 1, { ...profile, airspeedMPerS: 560 });

    // Standing, the nozzle is as built
    expect(still.lipTemperatureK).toBeCloseTo(still.exitTemperatureK);

    // Subsonic, it opens just enough to hold its pressure ratio
    expect(cruise.pressureRatio).toBeCloseTo(still.pressureRatio);
    expect(cruise.lipTemperatureK).toBeLessThan(still.lipTemperatureK);

    // Past its widest, the ram outruns it, but nothing like a fixed nozzle
    expect(dash.pressureRatio).toBeGreaterThan(still.pressureRatio);
    expect(dash.pressureRatio).toBeLessThan(2);
    expect(dash.exitTemperatureK).toBeCloseTo(still.exitTemperatureK);
  });

  it("leaves a rocket's bell as built", () => {
    const flying = jet_state(rocket.params, 1, {
      ...rocket.profile,
      airspeedMPerS: 600,
    });

    expect(flying.lipTemperatureK).toBeCloseTo(flying.exitTemperatureK);
  });
});
