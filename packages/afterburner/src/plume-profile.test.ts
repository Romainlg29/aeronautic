import { describe, expect, it } from "vitest";
import {
  burner_lit,
  jet_centreline,
  jet_half_width,
  jet_state,
  plume_lod,
  plume_screen_span,
  soot_formation,
  PLUME_LOD_CULLED,
  PLUME_LOD_FAR,
  PLUME_LOD_MID,
  PLUME_LOD_NEAR,
} from "./plume-profile";
import {
  default_afterburner_params,
  default_afterburner_profile,
} from "./types";

const profile = default_afterburner_profile();

describe("burner_lit", () => {
  it("is out below the threshold", () => {
    expect(burner_lit(profile.burner_threshold - 0.01, profile)).toBe(0);
    expect(burner_lit(0, profile)).toBe(0);
  });

  it("is fully in at full throttle", () => {
    expect(burner_lit(1, profile)).toBeCloseTo(1);
  });

  it("climbs smoothly between, and never past one", () => {
    const middle = (profile.burner_threshold + 1) / 2;

    expect(burner_lit(middle, profile)).toBeCloseTo(0.5);
    expect(burner_lit(2, profile)).toBeCloseTo(1);
  });

  it("survives a threshold set at full power, where the span degenerates", () => {
    const stepped = { ...profile, burner_threshold: 1 };

    expect(Number.isFinite(burner_lit(1, stepped))).toBe(true);
  });
});

describe("burner_lit, for a rocket", () => {
  it("is always lit when there is no burner to light", () => {
    const rocket = { ...profile, burner_threshold: 0 };

    expect(burner_lit(0, rocket)).toBe(1);
    expect(burner_lit(0.5, rocket)).toBe(1);
  });
});

describe("jet_state", () => {
  const params = default_afterburner_params();

  it("leaves a matched nozzle at its own Mach number and radius", () => {
    const matched = { ...params, pressure_ratio: 1 };
    const state = jet_state(matched, 1, { ...profile, idle_pressure: 1 });

    expect(state.mach).toBeCloseTo(matched.exit_mach, 5);
    expect(state.radius_m).toBeCloseTo(matched.nozzle_radius_m, 5);
    expect(state.temperature_k).toBeCloseTo(matched.exit_temperature_k, 3);
  });

  it("expands an underexpanded jet: faster, colder and wider", () => {
    const state = jet_state({ ...params, pressure_ratio: 2 }, 1, profile);

    expect(state.mach).toBeGreaterThan(params.exit_mach);
    expect(state.temperature_k).toBeLessThan(params.exit_temperature_k);
    expect(state.radius_m).toBeGreaterThan(params.nozzle_radius_m);
  });

  it("pinches an overexpanded one", () => {
    const state = jet_state({ ...params, pressure_ratio: 0.6 }, 1, profile);

    expect(state.mach).toBeLessThan(params.exit_mach);
    expect(state.radius_m).toBeLessThan(params.nozzle_radius_m);
  });

  it("spaces the shock cells as Pack's formula does", () => {
    const state = jet_state(params, 1, profile);

    expect(state.shock_spacing_m).toBeCloseTo(
      1.306 * 2 * state.radius_m * Math.sqrt(state.mach ** 2 - 1),
      6,
    );
  });

  it("makes no shock train in a subsonic jet", () => {
    const state = jet_state(
      { ...params, exit_mach: 0.6, pressure_ratio: 1 },
      1,
      profile,
    );

    expect(state.shock_heat).toBe(0);
  });

  it("grows the potential core with the Mach number", () => {
    const slow = jet_state(
      { ...params, pressure_ratio: 1, exit_mach: 1.2 },
      1,
      profile,
    );
    const fast = jet_state(
      { ...params, pressure_ratio: 1, exit_mach: 2.5 },
      1,
      profile,
    );

    expect(fast.core_length_m / fast.radius_m).toBeGreaterThan(
      slow.core_length_m / slow.radius_m,
    );
  });

  it("is shorter on dry thrust than in full reheat", () => {
    expect(jet_state(params, 0.3, profile).reach_m).toBeLessThan(
      jet_state(params, 1, profile).reach_m,
    );
  });

  it("scales every length with the engine", () => {
    const one = jet_state(params, 1, profile);
    const two = jet_state(params, 1, profile, 2);

    expect(two.core_length_m).toBeCloseTo(one.core_length_m * 2, 6);
    expect(two.reach_m).toBeCloseTo(one.reach_m * 2, 6);
    expect(two.velocity_m_s).toBeCloseTo(one.velocity_m_s, 6);
  });
});

describe("jet_half_width and jet_centreline", () => {
  const state = jet_state(default_afterburner_params(), 1, profile);

  it("leaves the lip at the jet's radius, at full strength", () => {
    expect(jet_half_width(0, state)).toBeCloseTo(state.radius_m);
    expect(jet_centreline(0, state)).toBeCloseTo(1);
  });

  it("decays as one over the distance far downstream", () => {
    const x = state.core_length_m * 20;

    expect(jet_centreline(x, state) * (x / state.core_length_m)).toBeCloseTo(
      1,
      3,
    );
  });

  it("spreads faster once the core has closed", () => {
    const core = state.core_length_m;

    const before =
      jet_half_width(core, state) - jet_half_width(core - 1, state);
    const after = jet_half_width(core + 1, state) - jet_half_width(core, state);

    expect(after).toBeGreaterThan(before);
  });
});

describe("plume_screen_span", () => {
  it("is the length over the distance, in screen heights", () => {
    expect(plume_screen_span(9, 900, 1)).toBeCloseTo(0.01);
  });

  it("fills the screen when the camera is inside the plume", () => {
    expect(plume_screen_span(9, 0, 1)).toBe(Infinity);
  });
});

describe("plume_lod", () => {
  const screen_scale = 1;
  const floor = 0.001;

  it("marches what is near", () => {
    expect(plume_lod(9, 100, screen_scale, floor, 900, 3000)).toBe(
      PLUME_LOD_NEAR,
    );
  });

  it("drops the eddies past the detail distance", () => {
    expect(plume_lod(9, 1500, screen_scale, floor, 900, 3000)).toBe(
      PLUME_LOD_MID,
    );
  });

  it("drops the march past the cheap distance", () => {
    expect(plume_lod(9, 4000, screen_scale, floor, 900, 3000)).toBe(
      PLUME_LOD_FAR,
    );
  });

  it("drops an engine that is not running however near it is", () => {
    expect(plume_lod(0, 10, screen_scale, floor, 900, 3000)).toBe(
      PLUME_LOD_CULLED,
    );
  });

  it("answers the screen floor before the distance tiers", () => {
    // Well past the cheap distance, so the far tier would otherwise claim it
    expect(plume_lod(9, 50000, screen_scale, floor, 900, 3000)).toBe(
      PLUME_LOD_CULLED,
    );
  });

  // The floor and the one-sample tier are tied together, and drift apart the
  // moment the plume's length changes without it. A 9m flame under a 0.25%
  // floor is culled two kilometres inside the cheap distance, so everything
  // the tier exists to draw is dropped before it ever reaches the tier
  it("leaves the one-sample tier something to draw at the defaults", () => {
    // What the default flame still spans where the marching is dropped
    // Read off the defaults rather than written down, so changing the plume's
    // length is what fails this rather than a comment going quietly stale
    const at_changeover = plume_screen_span(
      jet_state(default_afterburner_params(), 1, profile).reach_m,
      3000,
      screen_scale,
    );

    expect(at_changeover).toBeGreaterThan(floor);
  });
});

describe("soot_formation", () => {
  it("leaves the sea level look alone", () => {
    expect(soot_formation(1, 1, 1)).toBe(1);
  });

  it("falls away for a jet as the air thins", () => {
    expect(soot_formation(0.3, 1, 1)).toBeLessThan(0.2);
  });

  it("leaves a rocket's alone, its chamber setting the pressure", () => {
    expect(soot_formation(0.3, 1, 0)).toBe(1);
  });
});
