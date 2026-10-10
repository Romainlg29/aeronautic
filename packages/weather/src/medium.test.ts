import { describe, expect, it } from "vitest";
import { cloud_layer } from "./genera";
import { weather_medium } from "./medium";
import { Weather } from "./weather";

const storm = () =>
  new Weather({
    layers: [
      cloud_layer("cumulonimbus", {
        cover: 0,
        cells: [{ at: [0, 0], diameterM: 10_000 }],
      }),
    ],
    look: {
      sunDirection: [0, 1, 0],
      sun: [3, 3, 3],
      sky: [0, 0, 0],
      ground: [0, 0, 0],
    },
  });

describe("weather_medium", () => {
  it("is nothing in clear air", () => {
    const medium = weather_medium(new Weather(), 0, 1000, 0);

    expect(medium.extinction).toBe(0);
    expect(medium.color.r).toBe(0);
  });

  it("is the cloud's extinction, and its light, inside one", () => {
    const weather = storm();
    const medium = weather_medium(weather, 0, 5000, 0);

    expect(medium.extinction).toBeCloseTo(
      weather.sample(0, 5000, 0).extinction,
    );
    expect(medium.color.r).toBeGreaterThan(0);
    expect(Number.isFinite(medium.color.r)).toBe(true);

    // Lit by the sun alone, through no more than all of it
    expect(medium.color.r).toBeLessThan(3);
  });

  it("lets the sun through as the cloud towards it does", () => {
    const weather = storm();
    const medium = weather_medium(weather, 0, 5000, 0);

    expect(medium.sunTransmittance).toBeLessThan(1e-3);
    expect(medium.light!.r).toBeGreaterThan(0);
    expect(medium.light!.r).toBeLessThanOrEqual(medium.color.r);
    expect(weather_medium(new Weather(), 0, 1000, 0).sunTransmittance).toBe(1);
  });

  it("is darker deeper under the sun", () => {
    const weather = storm();
    const top = weather.resolve().layers[0].topM;
    const high = weather_medium(weather, 0, top - 300, 0).color.r;
    const low = weather_medium(weather, 0, 3000, 0).color.r;

    expect(low).toBeLessThan(high);
  });
});
