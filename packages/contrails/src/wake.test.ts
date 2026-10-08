import { describe, expect, it } from "vitest";
import {
  buoyancy_frequency,
  exhaust_offset,
  link_time,
  wake,
  wake_descent,
} from "./wake";

describe("the wake", () => {
  it("has an isothermal stratosphere's buoyancy frequency, g / √(cp T)", () => {
    expect(buoyancy_frequency(15_000)).toBeCloseTo(0.021, 3);
    expect(buoyancy_frequency(8000)).toBeCloseTo(0.0116, 3);
  });

  it("of an airliner sinks a couple of metres a second, a hundred-odd metres in all", () => {
    // An A330 at cruise: 200 t, 60 m, 0.41 kg/m³, 240 m/s
    const airliner = wake(
      200_000,
      1,
      60,
      0.41,
      240,
      buoyancy_frequency(10_500),
    );

    expect(airliner.circulationM2PerS).toBeGreaterThan(400);
    expect(airliner.circulationM2PerS).toBeLessThan(600);
    expect(airliner.descentMPerS).toBeGreaterThan(1.2);
    expect(airliner.descentMPerS).toBeLessThan(2.5);

    const final = wake_descent(airliner, 1e4);

    expect(final).toBeGreaterThan(80);
    expect(final).toBeLessThan(250);
    expect(wake_descent(airliner, 1e5)).toBe(final);
  });

  it("draws the exhaust in to its side's core", () => {
    const fighter = wake(20_000, 1, 14, 0.36, 250, buoyancy_frequency(11_000));
    const [x, y, z] = exhaust_offset(fighter, [7, 0, 0.75], 30);

    expect(x).toBe(7);
    expect(y).toBeLessThan(-50);
    expect(z).toBeCloseTo(fighter.spacingM / 2, 2);

    expect(exhaust_offset(fighter, [7, 0, 0], 30)[2]).toBe(0);
  });

  it("links in Crow and Bate's time, continuous across Sarpkaya's fits", () => {
    expect(link_time(0)).toBe(9);
    expect(link_time(0.001)).toBeCloseTo(9, 1);
    expect(link_time(0.0121)).toBeCloseTo(7, 1);
    expect(link_time(0.0122)).toBeCloseTo(7, 1);
    expect(link_time(0.2534)).toBeCloseTo(2.25, 1);
    expect(link_time(0.2536)).toBeCloseTo(2.25, 1);
    expect(link_time(1)).toBeCloseTo(0.8039, 4);
  });

  it("of an airliner lives minutes in the upper troposphere", () => {
    // Unterstrasser's A340: b₀ 47.3 m, w₀ 1.55 m/s, linking near 3 minutes
    const airliner = wake(
      200_000,
      1,
      60,
      0.41,
      240,
      buoyancy_frequency(10_500),
    );

    expect(airliner.lifetimeS).toBeGreaterThan(150);
    expect(airliner.lifetimeS).toBeLessThan(300);
  });

  it("pulled hard, lives briefly and sinks a few spacings, not hundreds of metres", () => {
    const n = buoyancy_frequency(11_000);
    const gentle = wake(20_000, 1, 14, 0.36, 250, n);
    const hard = wake(20_000, 9, 14, 0.36, 300, n);

    expect(hard.lifetimeS).toBeLessThan(gentle.lifetimeS / 4);

    const sunk = wake_descent(hard, 60);

    expect(sunk).toBe(wake_descent(hard, hard.lifetimeS));
    expect(sunk / hard.spacingM).toBeGreaterThan(3);
    expect(sunk / hard.spacingM).toBeLessThan(12);
  });

  it("pushed negative, rises", () => {
    const pushed = wake(20_000, -2, 14, 0.36, 250, buoyancy_frequency(11_000));

    expect(pushed.descentMPerS).toBeLessThan(0);
    expect(wake_descent(pushed, 5)).toBeLessThan(0);
    expect(exhaust_offset(pushed, [7, 0, 0.75], 5)[1]).toBeGreaterThan(0);
  });
});
