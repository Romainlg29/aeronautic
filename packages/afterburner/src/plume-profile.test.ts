import { describe, expect, it } from "vitest";
import {
  AFTERBURNER_MAX_THROTTLE,
  burner_lit,
  clamp_throttle,
  dry_temperature,
  plume_adaptation,
  PLUME_LIGHT_OFF,
  PLUME_MAX_ADAPTATION,
  PLUME_MIN_REHEAT,
  PLUME_PHOTOPIC_K,
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

// Full power, the burner and all
const FULL = AFTERBURNER_MAX_THROTTLE;

describe("burner_lit", () => {
  it("is out below the threshold, all the way to military power", () => {
    expect(burner_lit(profile.burner_threshold - 0.01, profile)).toBe(0);
    expect(burner_lit(0, profile)).toBe(0);
    expect(burner_lit(1, profile)).toBe(0);
  });

  it("is fully in at the end of the travel", () => {
    expect(burner_lit(AFTERBURNER_MAX_THROTTLE, profile)).toBeCloseTo(1);
  });

  it("fades its first zone in just past the threshold", () => {
    const lighting = burner_lit(
      profile.burner_threshold + PLUME_LIGHT_OFF / 2,
      profile,
    );

    const lit = burner_lit(profile.burner_threshold + PLUME_LIGHT_OFF, profile);

    expect(lighting).toBeGreaterThan(0);
    expect(lighting).toBeLessThan(PLUME_MIN_REHEAT);
    expect(lit).toBeGreaterThanOrEqual(PLUME_MIN_REHEAT);
    expect(lit).toBeLessThan(0.5);
  });

  it("stages in between, and never past one", () => {
    let last = 0;

    for (let throttle = 1; throttle <= 1.2; throttle += 0.005) {
      const lit = burner_lit(throttle, profile);

      expect(lit).toBeGreaterThanOrEqual(last);
      expect(lit).toBeLessThanOrEqual(1);

      last = lit;
    }
  });

  it("survives a threshold set at full travel, where the span degenerates", () => {
    const stepped = { ...profile, burner_threshold: AFTERBURNER_MAX_THROTTLE };

    expect(Number.isFinite(burner_lit(AFTERBURNER_MAX_THROTTLE, stepped))).toBe(
      true,
    );
  });
});

describe("clamp_throttle", () => {
  it("holds the throttle inside its travel", () => {
    expect(clamp_throttle(-1)).toBe(0);
    expect(clamp_throttle(0.4)).toBe(0.4);
    expect(clamp_throttle(1.05)).toBe(1.05);
    expect(clamp_throttle(3)).toBe(AFTERBURNER_MAX_THROTTLE);
  });

  it("reads anything that is not a number as idle", () => {
    expect(clamp_throttle(Number.NaN)).toBe(0);
    expect(clamp_throttle(Infinity)).toBe(0);
  });
});

describe("dry thrust", () => {
  const params = default_afterburner_params();

  it("runs hotter the harder the dry engine is pushed", () => {
    const idle = jet_state(params, 0, profile);
    const half = jet_state(params, 0.5, profile);
    const military = jet_state(params, 1, profile);

    expect(idle.exit_temperature_k).toBeLessThan(half.exit_temperature_k);
    expect(half.exit_temperature_k).toBeLessThan(military.exit_temperature_k);
    expect(military.exit_temperature_k).toBeCloseTo(params.dry_temperature_k);
  });

  it("leaves a little over the air at idle", () => {
    const ambient = 288.15;

    expect(dry_temperature(params, 0, profile, ambient)).toBeCloseTo(
      ambient + (params.dry_temperature_k - ambient) * profile.idle_temperature,
    );
  });

  it("opens the camera up for a burner just lit, and not before", () => {
    const military = jet_state(params, 1, profile);
    const light_off = jet_state(params, 1.04, profile);
    const full = jet_state(params, AFTERBURNER_MAX_THROTTLE, profile);

    expect(military.adaptation).toBe(1);
    expect(light_off.adaptation).toBeGreaterThan(1);
    expect(full.adaptation).toBeCloseTo(1);
  });

  it("glows instead, brighter the harder the engine runs", () => {
    const idle = jet_state(params, 0, profile);
    const military = jet_state(params, 1, profile);

    expect(idle.glow).toBeGreaterThan(0);
    expect(military.glow).toBeGreaterThan(idle.glow);
  });

  it("drowns the glow once the burner lights", () => {
    expect(jet_state(params, 1.04, profile).glow).toBe(0);
    expect(jet_state(params, AFTERBURNER_MAX_THROTTLE, profile).glow).toBe(0);
  });

  it("shows no diamonds until the burner relights the train", () => {
    const military = jet_state(params, 1, profile);
    const full = jet_state(params, AFTERBURNER_MAX_THROTTLE, profile);

    expect(military.shock_heat).toBe(0);
    expect(military.compression).toBe(1);
    expect(full.shock_heat).toBeGreaterThan(0);
  });

  it("never opens up for a rocket, which has no dry state", () => {
    const rocket = { ...profile, burner_threshold: 0 };

    expect(jet_state(params, 0, rocket).adaptation).toBe(1);
    expect(jet_state(params, 0, rocket).glow).toBe(0);
  });
});

describe("plume_adaptation", () => {
  it("is one when the plume is as hot as at full power, or hotter", () => {
    expect(plume_adaptation(1700, 1700, 0.6)).toBe(1);
    expect(plume_adaptation(2000, 1700, 0.6)).toBe(1);
  });

  it("is one when the camera does not follow", () => {
    expect(plume_adaptation(800, 1700, 0)).toBe(1);
  });

  it("follows Wien's law all the way when it follows fully", () => {
    expect(plume_adaptation(1200, 1700, 1)).toBeCloseTo(
      Math.exp(PLUME_PHOTOPIC_K * (1 / 1200 - 1 / 1700)),
    );
  });

  it("is bounded however cold the plume", () => {
    expect(plume_adaptation(1, 1700, 1)).toBe(PLUME_MAX_ADAPTATION);
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
    const state = jet_state(matched, FULL, { ...profile, idle_pressure: 1 });

    expect(state.mach).toBeCloseTo(matched.exit_mach, 5);
    expect(state.radius_m).toBeCloseTo(matched.nozzle_radius_m, 5);
    expect(state.temperature_k).toBeCloseTo(matched.exit_temperature_k, 3);
  });

  it("expands an underexpanded jet: faster, colder and wider", () => {
    const state = jet_state({ ...params, pressure_ratio: 2 }, FULL, profile);

    expect(state.mach).toBeGreaterThan(params.exit_mach);
    expect(state.temperature_k).toBeLessThan(params.exit_temperature_k);
    expect(state.radius_m).toBeGreaterThan(params.nozzle_radius_m);
  });

  it("pinches an overexpanded one", () => {
    const state = jet_state({ ...params, pressure_ratio: 0.6 }, FULL, profile);

    expect(state.mach).toBeLessThan(params.exit_mach);
    expect(state.radius_m).toBeLessThan(params.nozzle_radius_m);
  });

  it("spaces the shock cells as Pack's formula does", () => {
    const state = jet_state(params, FULL, profile);

    expect(state.shock_spacing_m).toBeCloseTo(
      1.306 * 2 * state.radius_m * Math.sqrt(state.mach ** 2 - 1),
      6,
    );
  });

  it("makes no shock train in a subsonic jet", () => {
    const state = jet_state(
      { ...params, exit_mach: 0.6, pressure_ratio: 1 },
      FULL,
      profile,
    );

    expect(state.shock_heat).toBe(0);
  });

  it("grows the potential core with the Mach number", () => {
    const slow = jet_state(
      { ...params, pressure_ratio: 1, exit_mach: 1.2 },
      FULL,
      profile,
    );
    const fast = jet_state(
      { ...params, pressure_ratio: 1, exit_mach: 2.5 },
      FULL,
      profile,
    );

    expect(fast.core_length_m / fast.radius_m).toBeGreaterThan(
      slow.core_length_m / slow.radius_m,
    );
  });

  it("is shorter on dry thrust than in full reheat", () => {
    expect(jet_state(params, 0.3, profile).reach_m).toBeLessThan(
      jet_state(params, FULL, profile).reach_m,
    );
  });

  it("scales every length with the engine", () => {
    const one = jet_state(params, FULL, profile);
    const two = jet_state(params, FULL, profile, 2);

    expect(two.core_length_m).toBeCloseTo(one.core_length_m * 2, 6);
    expect(two.reach_m).toBeCloseTo(one.reach_m * 2, 6);
    expect(two.velocity_m_s).toBeCloseTo(one.velocity_m_s, 6);
  });
});

describe("jet_half_width and jet_centreline", () => {
  const state = jet_state(default_afterburner_params(), FULL, profile);

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
      jet_state(default_afterburner_params(), FULL, profile).reach_m,
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
