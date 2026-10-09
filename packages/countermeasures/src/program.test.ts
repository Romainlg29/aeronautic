import { describe, expect, it } from "vitest";
import { default_program, program_releases } from "./program";

describe("program_releases", () => {
  it("lets go the burst times the salvo", () => {
    const releases = program_releases(default_program(), 2);

    expect(releases).toHaveLength(8);
    expect(releases.map((release) => release.timeS)).toEqual([
      0, 0.25, 1, 1.25, 2, 2.25, 3, 3.25,
    ]);
  });

  it("takes turns, from the one asked", () => {
    const releases = program_releases(default_program(), 2, 1);

    expect(releases.map((release) => release.dispenser)).toEqual([
      1, 0, 1, 0, 1, 0, 1, 0,
    ]);
  });

  it("keeps to one dispenser, not alternating", () => {
    const releases = program_releases(
      { ...default_program(), alternate: false },
      2,
      1,
    );

    expect(new Set(releases.map((release) => release.dispenser))).toEqual(
      new Set([1]),
    );
  });

  it("lets nothing go for an empty program", () => {
    expect(program_releases({ ...default_program(), salvo: 0 }, 2)).toEqual([]);
  });
});
