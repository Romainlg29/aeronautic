import { describe, expect, it } from "vitest";
import {
  curved_altitude,
  dome_slope,
  hand_clouds,
  layer_column,
  layer_density,
  layer_extinction,
  resolve_layer,
  size_octaves,
  TROPOPAUSE_M,
} from "./field";
import { cloud_layer } from "./genera";
import { visibility } from "./microphysics";
import { pcg3d, unit } from "./noise";
import { default_weather_day } from "./types";

const day = default_weather_day();

/**
 * The share of random points a layer's columns cover.
 * @param genus The layer's genus
 * @param cover Its cover
 * @returns The share
 */
const measured_cover = (
  layer: ReturnType<typeof cloud_layer>,
  samples = 20_000,
): number => {
  const resolved = resolve_layer(layer, day, 7, 0);
  const hand = hand_clouds(resolved);
  let inside = 0;

  for (let index = 0; index < samples; index++) {
    const h = pcg3d(index, 3, 9);
    const x = unit(h[0]) * 200_000;
    const z = unit(h[1]) * 200_000;

    if (layer_column(resolved, hand, x, z).height > 0) inside++;
  }

  return inside / samples;
};

describe("size_octaves", () => {
  it("covers the asked share of the sky", () => {
    const { cover } = size_octaves(
      cloud_layer("cumulus-mediocris", { cover: 0.4 }),
    );

    expect(cover).toBeCloseTo(0.4, 3);
  });

  it("stops at a cloud in every cell", () => {
    const { cover, octaves } = size_octaves(
      cloud_layer("cumulus-humilis", { cover: 0.99 }),
    );

    expect(cover).toBeLessThan(0.99);
    expect(octaves.every((octave) => octave.probability <= 1)).toBe(true);
  });
});

describe("layer_column", () => {
  it("lays cumulus over their cover", () => {
    expect(
      measured_cover(cloud_layer("cumulus-mediocris", { cover: 0.35 })),
    ).toBeCloseTo(0.35, 1);
  });

  it("lays a sheet over its cover", () => {
    expect(
      measured_cover(cloud_layer("stratocumulus", { cover: 0.6 })),
    ).toBeCloseTo(0.6, 1);
  });

  it("puts a storm where it is told, its anvil downwind", () => {
    const layer = cloud_layer("cumulonimbus", {
      cover: 0,
      cells: [{ at: [0, 0], diameterM: 10_000 }],
    });
    const resolved = resolve_layer(layer, day, 1, 0);
    const hand = hand_clouds(resolved);

    const core = layer_column(resolved, hand, 0, 0);
    const downwind = layer_column(resolved, hand, 15_000, 0);
    const upwind = layer_column(resolved, hand, -15_000, 0);

    expect(core.height).toBeCloseTo(TROPOPAUSE_M - resolved.baseM, 0);
    expect(core.rain).toBeCloseTo(40, 5);
    expect(downwind.anvil).toBeGreaterThan(0);
    expect(upwind.anvil).toBe(0);
  });
});

describe("resolve_layer", () => {
  it("bases cumulus at the condensation level", () => {
    const resolved = resolve_layer(cloud_layer("cumulus-humilis"), day, 0, 0);

    // 70 % at 15 °C: a dew point 5.6 K below, about 700 m
    expect(resolved.baseM).toBeGreaterThan(550);
    expect(resolved.baseM).toBeLessThan(850);
  });

  it("is more ice the higher and colder", () => {
    const cirrus = resolve_layer(cloud_layer("cirrus"), day, 0, 0);

    // −37 °C at its 8 km base, just warmer than homogeneous freezing
    expect(cirrus.table[2]).toBeGreaterThan(0.95);
    expect(cirrus.table[(64 - 1) * 4 + 2]).toBe(1);
    expect(cirrus.table[(64 - 1) * 4]).toBe(0);
  });
});

describe("layer_density and layer_extinction", () => {
  const resolved = resolve_layer(cloud_layer("cumulus-mediocris"), day, 0, 0);
  const column = { height: 2000, slope: 0, anvil: 0, rain: 0 };
  const full = { shape: 1, detail: 1 };

  it("is full deep inside and empty above", () => {
    expect(layer_density(resolved, column, resolved.baseM + 1000, full)).toBe(
      1,
    );
    expect(layer_density(resolved, column, resolved.baseM + 2100, full)).toBe(
      0,
    );
  });

  it("wears the top down where the noise is low", () => {
    const worn = { shape: 0, detail: 0 };

    expect(layer_density(resolved, column, resolved.baseM + 1900, worn)).toBe(
      0,
    );
  });

  it("lets one see tens of metres inside a cumulus", () => {
    const altitude = resolved.baseM + 1000;
    const [water, ice] = layer_extinction(resolved, column, altitude, 1, 0);

    expect(visibility(water + ice)).toBeGreaterThan(15);
    expect(visibility(water + ice)).toBeLessThan(80);
  });
});

describe("curved_altitude", () => {
  it("drops the ground away as d² / 2R", () => {
    expect(curved_altitude(100_000, 0, 0)).toBeCloseTo(785, 0);
  });
});

describe("dome_slope", () => {
  it("is the dome's own steepness", () => {
    const cloud = {
      x: 0,
      z: 0,
      radius: 800,
      height: 1500,
      crown: 2.5,
      anvil: null,
      rain: 0,
    };
    const dome = (r: number) =>
      cloud.height * (1 - (r / cloud.radius) ** 2) ** (1 / cloud.crown);

    for (const r of [100, 400, 700]) {
      const numeric = (dome(r - 0.01) - dome(r + 0.01)) / 0.02;

      expect(dome_slope(cloud, (r / cloud.radius) ** 2)).toBeCloseTo(
        numeric,
        3,
      );
    }
  });
});
