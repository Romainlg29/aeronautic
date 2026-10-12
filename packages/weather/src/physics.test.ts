import { describe, expect, it } from "vitest";
import {
  air_temperature,
  droplet_extinction,
  effective_radius,
  fall_speed,
  ice_share,
  lift_parcel,
  mie,
  mie_phase,
  rain_extinction,
  raindrops,
  visibility,
} from "./physics";

describe("the standard atmosphere", () => {
  it("is 15 °C at sea level, 6.5 K colder a kilometre", () => {
    expect(air_temperature(0, 0)).toBeCloseTo(288.15, 2);
    expect(air_temperature(1000, 0)).toBeCloseTo(281.65, 2);
  });

  it("is warmer by the offset at every altitude", () => {
    expect(air_temperature(3000, 5) - air_temperature(3000, 0)).toBeCloseTo(
      5,
      6,
    );
  });
});

describe("a parcel", () => {
  it("condenses higher the drier the air", () => {
    const humid = lift_parcel(0, 0, 0.9, 1);
    const dry = lift_parcel(0, 0, 0.5, 1);

    expect(dry.baseM).toBeGreaterThan(humid.baseM);
  });
});

describe("water and ice", () => {
  it("freezes between 0 °C and −38 °C", () => {
    expect(ice_share(280)).toBe(0);
    expect(ice_share(230)).toBe(1);
    expect(ice_share(255)).toBeGreaterThan(0);
    expect(ice_share(255)).toBeLessThan(1);
  });

  it("grows its droplets with its water", () => {
    expect(effective_radius(1e-3, "maritime")).toBeGreaterThan(
      effective_radius(1e-4, "maritime"),
    );
  });

  it("hides more of the light in continental air, its droplets more and smaller", () => {
    expect(droplet_extinction(5e-4, "continental")).toBeGreaterThan(
      droplet_extinction(5e-4, "maritime"),
    );
  });
});

describe("rain", () => {
  it("dims as it falls harder", () => {
    expect(rain_extinction(20)).toBeGreaterThan(rain_extinction(1));
    expect(rain_extinction(0)).toBe(0);
  });

  it("has fewer drops the larger", () => {
    expect(raindrops(5, 2)).toBeLessThan(raindrops(5, 1));
  });

  it("falls at about 9 m/s at its largest", () => {
    expect(fall_speed(5)).toBeGreaterThan(8.5);
    expect(fall_speed(5)).toBeLessThan(9.65);
    expect(fall_speed(1)).toBeLessThan(fall_speed(2));
  });
});

describe("the light", () => {
  it("sees 3.9 / σ far: Koschmieder's", () => {
    expect(visibility(3.912e-3)).toBeCloseTo(1000, -1);
  });

  it("scatters forward through a droplet", () => {
    const phase = mie_phase(20e-6);

    expect(mie(1, phase)).toBeGreaterThan(mie(0, phase));
    expect(mie(0, phase)).toBeGreaterThan(0);
  });
});
