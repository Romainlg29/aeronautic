import { describe, expect, it } from "vitest";
import {
  clamp_throttle,
  REHEAT_FIRST_ZONE,
  REHEAT_LIGHT_OFF,
  reheat_share,
  THROTTLE_MAX,
} from "./reheat";

describe("reheat_share", () => {
  it("is out on dry thrust, up to the detent", () => {
    expect(reheat_share(0)).toBe(0);
    expect(reheat_share(0.99)).toBe(0);
    expect(reheat_share(1)).toBe(0);
  });

  it("is full at the stop", () => {
    expect(reheat_share(THROTTLE_MAX)).toBeCloseTo(1, 9);
  });

  it("lights its first zone with a thump, then stages in", () => {
    const lit = reheat_share(1 + REHEAT_LIGHT_OFF);

    expect(lit).toBeGreaterThanOrEqual(REHEAT_FIRST_ZONE);
    expect(lit).toBeLessThan(0.5);

    let last = 0;

    for (let throttle = 1; throttle <= THROTTLE_MAX; throttle += 0.005) {
      const share = reheat_share(throttle);

      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
  });

  it("is always lit for an engine with no detent", () => {
    expect(reheat_share(0, 0)).toBe(1);
    expect(reheat_share(0.5, -1)).toBe(1);
  });

  it("holds the throttle in its travel", () => {
    expect(clamp_throttle(-1)).toBe(0);
    expect(clamp_throttle(1.05)).toBe(1.05);
    expect(clamp_throttle(3)).toBe(THROTTLE_MAX);
    expect(clamp_throttle(Number.NaN)).toBe(0);
  });
});
