import { describe, expect, it } from "vitest";
import { equivalence_ratio, propellant_effects } from "./propellant";
import { AFTERBURNER_PRESETS, resolve_afterburner_params } from "./presets";

describe("propellant_effects", () => {
  it("lands near the presets at their own mixes", () => {
    const kerolox = AFTERBURNER_PRESETS.rocket_kerolox;
    const effects = propellant_effects(kerolox.propellant);

    expect(effects.sootPerM).toBeCloseTo(kerolox.params.sootPerM, 0);
    expect(effects.afterburningK).toBeCloseTo(kerolox.params.afterburningK, -2);
  });

  it("burns clean and leaves nothing to burn at an even mix", () => {
    const even = propellant_effects({ fuel: "kerosene", mixtureRatio: 3.4 });

    expect(equivalence_ratio({ fuel: "kerosene", mixtureRatio: 3.4 })).toBe(1);
    expect(even.sootPerM).toBe(0);
    expect(even.afterburningK).toBe(0);
  });

  it("makes no soot from hydrogen however rich", () => {
    expect(
      propellant_effects({ fuel: "hydrogen", mixtureRatio: 3 }).sootPerM,
    ).toBe(0);
  });

  it("makes less soot from methane than kerosene, as rich", () => {
    const methane = propellant_effects({ fuel: "methane", mixtureRatio: 2.8 });
    const kerosene = propellant_effects({
      fuel: "kerosene",
      mixtureRatio: 2.38,
    });

    expect(methane.sootPerM).toBeLessThan(kerosene.sootPerM);
  });
});

describe("resolve_afterburner_params with a propellant", () => {
  it("gives a preset back unchanged at its own mix", () => {
    const own = resolve_afterburner_params(undefined, "rocket_kerolox");
    const mixed = resolve_afterburner_params(
      { propellant: AFTERBURNER_PRESETS.rocket_kerolox.propellant },
      "rocket_kerolox",
    );

    expect(mixed.sootPerM).toBeCloseTo(own.sootPerM);
    expect(mixed.afterburningK).toBeCloseTo(own.afterburningK);
    expect(mixed.exitTemperatureK).toBeCloseTo(own.exitTemperatureK);
  });

  it("runs sootier and with more to burn, richer", () => {
    const own = resolve_afterburner_params(undefined, "rocket_kerolox");
    const rich = resolve_afterburner_params(
      { propellant: { fuel: "kerosene", mixtureRatio: 1.8 } },
      "rocket_kerolox",
    );

    expect(rich.sootPerM).toBeGreaterThan(own.sootPerM);
    expect(rich.afterburningK).toBeGreaterThan(own.afterburningK);
    expect(rich.exitTemperatureK).toBeLessThan(own.exitTemperatureK);
  });

  it("lets a param given outright win over the mix", () => {
    const params = resolve_afterburner_params(
      { propellant: { fuel: "kerosene", mixtureRatio: 1.8 }, sootPerM: 1 },
      "rocket_kerolox",
    );

    expect(params.sootPerM).toBe(1);
  });
});
