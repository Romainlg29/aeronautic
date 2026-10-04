import { Color } from "three";
import { describe, expect, it } from "vitest";
import {
  AFTERBURNER_PRESETS,
  resolve_afterburner_params,
  resolve_afterburner_profile,
  resolve_afterburner_quality,
} from "./presets";
import {
  default_afterburner_params,
  default_afterburner_profile,
  default_afterburner_quality,
} from "./types";

describe("resolve_afterburner_params", () => {
  it("returns the defaults when given nothing", () => {
    expect(resolve_afterburner_params()).toEqual(default_afterburner_params());
  });

  it("overrides only what it is given", () => {
    const params = resolve_afterburner_params({ exitMach: 2 });

    expect(params.exitMach).toBe(2);
    expect(params.gamma).toBe(default_afterburner_params().gamma);
  });

  it("takes colours in any form three does", () => {
    const params = resolve_afterburner_params({ bandColor: "#ff0000" });

    expect(params.bandColor).toBeInstanceOf(Color);
    expect(params.bandColor.getHexString()).toBe("ff0000");
  });

  it("starts from a preset", () => {
    const params = resolve_afterburner_params(undefined, "rocket_hydrolox");

    expect(params.sootPerM).toBe(0);
    expect(params.nozzleRadiusM).toBe(
      AFTERBURNER_PRESETS.rocket_hydrolox.params.nozzleRadiusM,
    );
  });

  // Everything else about the plume's size comes out of the nozzle radius
  // through the physics, so the haze is the one length left to carry along
  it("scales a preset's haze with its nozzle", () => {
    const base = resolve_afterburner_params(undefined, "rocket_kerolox");
    const big = resolve_afterburner_params(
      { nozzleRadiusM: base.nozzleRadiusM * 2 },
      "rocket_kerolox",
    );

    expect(big.refractionM).toBeCloseTo(base.refractionM * 2);
    expect(big.exitMach).toBe(base.exitMach);
  });

  it("does not scale a length given explicitly", () => {
    const params = resolve_afterburner_params(
      { nozzleRadiusM: 2, refractionM: 0.01 },
      "afterburner",
    );

    expect(params.refractionM).toBe(0.01);
  });

  it("never shares colour objects between calls", () => {
    const a = resolve_afterburner_params(undefined, "plasma");
    const b = resolve_afterburner_params(undefined, "plasma");

    expect(a.bandColor).not.toBe(b.bandColor);
  });
});

describe("resolve_afterburner_profile", () => {
  it("fills in from the defaults, under the default preset", () => {
    expect(resolve_afterburner_profile()).toEqual({
      ...default_afterburner_profile(),
      ...AFTERBURNER_PRESETS.afterburner_turbulent.profile,
    });
  });

  it("layers the preset under the input", () => {
    const profile = resolve_afterburner_profile(
      { spreadScale: 0.5 },
      "rocket_kerolox",
    );

    expect(profile.burnerThreshold).toBe(0);
    expect(profile.spreadScale).toBe(0.5);
  });
});

describe("resolve_afterburner_quality", () => {
  it("defaults to high", () => {
    expect(resolve_afterburner_quality()).toEqual(
      default_afterburner_quality(),
    );
  });

  it("takes a name", () => {
    expect(resolve_afterburner_quality("low").turbulenceOctaves).toBe(1);
  });

  it("holds the counts in range", () => {
    const quality = resolve_afterburner_quality({
      nearSteps: 10.4,
      midSteps: 40,
      turbulenceOctaves: 9,
    });

    expect(quality).toEqual({
      nearSteps: 10,
      midSteps: 10,
      turbulenceOctaves: 3,
    });
  });
});

describe("AFTERBURNER_PRESETS", () => {
  it("only names params and profile keys that exist", () => {
    const params = Object.keys(default_afterburner_params());
    const profile = Object.keys(default_afterburner_profile());

    for (const preset of Object.values(AFTERBURNER_PRESETS)) {
      for (const key of Object.keys(preset.params)) {
        expect(params).toContain(key);
      }

      for (const key of Object.keys(preset.profile)) {
        expect(profile).toContain(key);
      }
    }
  });
});
