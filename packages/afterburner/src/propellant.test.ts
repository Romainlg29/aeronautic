import { describe, expect, it } from "vitest";
import { equivalence_ratio, propellant_effects } from "./propellant";
import { AFTERBURNER_PRESETS, resolve_afterburner_params } from "./presets";

describe("propellant_effects", () => {
  it("lands near the presets at their own mixes", () => {
    const kerolox = AFTERBURNER_PRESETS.rocket_kerolox;
    const effects = propellant_effects(kerolox.propellant);

    expect(effects.soot_per_m).toBeCloseTo(kerolox.params.soot_per_m, 0);
    expect(effects.afterburning_k).toBeCloseTo(
      kerolox.params.afterburning_k,
      -2,
    );
  });

  it("burns clean and leaves nothing to burn at an even mix", () => {
    const even = propellant_effects({ fuel: "kerosene", mixture_ratio: 3.4 });

    expect(equivalence_ratio({ fuel: "kerosene", mixture_ratio: 3.4 })).toBe(1);
    expect(even.soot_per_m).toBe(0);
    expect(even.afterburning_k).toBe(0);
  });

  it("makes no soot from hydrogen however rich", () => {
    expect(
      propellant_effects({ fuel: "hydrogen", mixture_ratio: 3 }).soot_per_m,
    ).toBe(0);
  });

  it("makes less soot from methane than kerosene, as rich", () => {
    const methane = propellant_effects({ fuel: "methane", mixture_ratio: 2.8 });
    const kerosene = propellant_effects({
      fuel: "kerosene",
      mixture_ratio: 2.38,
    });

    expect(methane.soot_per_m).toBeLessThan(kerosene.soot_per_m);
  });
});

describe("resolve_afterburner_params with a propellant", () => {
  it("gives a preset back unchanged at its own mix", () => {
    const own = resolve_afterburner_params(undefined, "rocket_kerolox");
    const mixed = resolve_afterburner_params(
      { propellant: AFTERBURNER_PRESETS.rocket_kerolox.propellant },
      "rocket_kerolox",
    );

    expect(mixed.soot_per_m).toBeCloseTo(own.soot_per_m);
    expect(mixed.afterburning_k).toBeCloseTo(own.afterburning_k);
    expect(mixed.exit_temperature_k).toBeCloseTo(own.exit_temperature_k);
  });

  it("runs sootier and with more to burn, richer", () => {
    const own = resolve_afterburner_params(undefined, "rocket_kerolox");
    const rich = resolve_afterburner_params(
      { propellant: { fuel: "kerosene", mixture_ratio: 1.8 } },
      "rocket_kerolox",
    );

    expect(rich.soot_per_m).toBeGreaterThan(own.soot_per_m);
    expect(rich.afterburning_k).toBeGreaterThan(own.afterburning_k);
    expect(rich.exit_temperature_k).toBeLessThan(own.exit_temperature_k);
  });

  it("lets a param given outright win over the mix", () => {
    const params = resolve_afterburner_params(
      { propellant: { fuel: "kerosene", mixture_ratio: 1.8 }, soot_per_m: 1 },
      "rocket_kerolox",
    );

    expect(params.soot_per_m).toBe(1);
  });
});
