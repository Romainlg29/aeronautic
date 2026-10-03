import { describe, expect, it } from "vitest";
import { anchor_adrift, MAX_ANCHOR_DISTANCE_M } from "./plume-anchor";

// A nozzle on a fighter offshore of Corsica, in the geocentric frame the scene
// is actually built in
const NOZZLE: [number, number, number] = [4671000, 702000, 4262000];

describe("anchor_adrift", () => {
  it("is content with an anchor on the nozzle itself", () => {
    expect(anchor_adrift(...NOZZLE, ...NOZZLE)).toBe(false);
  });

  it("is content across a formation", () => {
    const [x, y, z] = NOZZLE;

    expect(anchor_adrift(x, y, z, x + 300, y - 200, z + 50)).toBe(false);
  });

  // The failure this exists for: a nozzle read before its aircraft was placed
  // in the world still carries its local model matrix, so it reads as a few
  // metres from the scene's origin. An anchor planted there is a whole planet
  // from the nozzles it goes on to measure, and every plume in the scene is
  // then described by a float32 that cannot resolve half a metre
  it("catches an anchor left at the scene's origin", () => {
    expect(anchor_adrift(-14.2, 0, 0, ...NOZZLE)).toBe(true);
  });

  it("turns over at the distance it says it does", () => {
    const [x, y, z] = NOZZLE;

    const inside = MAX_ANCHOR_DISTANCE_M - 1;
    const outside = MAX_ANCHOR_DISTANCE_M + 1;

    expect(anchor_adrift(x, y, z, x + inside, y, z)).toBe(false);
    expect(anchor_adrift(x, y, z, x + outside, y, z)).toBe(true);
  });
});
