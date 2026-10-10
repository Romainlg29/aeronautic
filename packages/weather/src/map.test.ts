import { describe, expect, it } from "vitest";
import { hand_clouds, layer_column, resolve_layer } from "./field";
import { cloud_layer } from "./genera";
import { bake_map, layer_has_map, MAP_CHANNELS, type MapFrame } from "./map";
import { default_weather_day } from "./types";
import { Weather } from "./weather";

const day = default_weather_day();

/**
 * A map's texel nearest a point.
 * @param map The map
 * @param frame Where it lies
 * @param x The point
 * @param z The point
 * @returns Its four channels
 */
const texel_at = (
  map: Float32Array,
  frame: MapFrame,
  x: number,
  z: number,
): number[] => {
  const texel = frame.extent / frame.size;
  const i = Math.floor((x - frame.x + frame.extent / 2) / texel);
  const j = Math.floor((z - frame.z + frame.extent / 2) / texel);
  const at = (j * frame.size + i) * MAP_CHANNELS;

  return [...map.subarray(at, at + MAP_CHANNELS)];
};

describe("bake_map", () => {
  it("leaves fair cumulus to the shader", () => {
    const resolved = resolve_layer(cloud_layer("cumulus-humilis"), day, 1, 0);

    expect(layer_has_map(resolved)).toBe(false);
  });

  it("bakes a sheet as its columns are", () => {
    const resolved = resolve_layer(
      cloud_layer("stratocumulus", { cover: 0.6 }),
      day,
      3,
      0,
    );
    const frame = { x: 0, z: 0, extent: 64_000, size: 128 };
    const map = bake_map(resolved, [], frame);
    const texel = frame.extent / frame.size;

    for (const [x, z] of [
      [0, 0],
      [-20_000, 7_000],
      [13_000, -25_000],
    ]) {
      // At a texel's centre, where it was baked
      const cx = (Math.floor(x / texel) + 0.5) * texel;
      const cz = (Math.floor(z / texel) + 0.5) * texel;

      expect(texel_at(map, frame, cx, cz)[0]).toBeCloseTo(
        layer_column(resolved, [], cx, cz).height,
        3,
      );
    }
  });

  it("lays a storm's rain under it and its anvil downwind", () => {
    const resolved = resolve_layer(
      cloud_layer("cumulonimbus", {
        cover: 0,
        cells: [{ at: [0, 0], diameterM: 10_000 }],
      }),
      day,
      1,
      0,
    );
    const frame = { x: 0, z: 0, extent: 128_000, size: 256 };
    const map = bake_map(resolved, hand_clouds(resolved), frame);

    const [height, , rain] = texel_at(map, frame, 0, 0);

    expect(height).toBeGreaterThan(9000);
    expect(rain).toBeGreaterThan(35);
    expect(texel_at(map, frame, 15_000, 0)[1]).toBeGreaterThan(0);
    expect(texel_at(map, frame, -15_000, 0)[1]).toBe(0);
  });
});

describe("Weather", () => {
  it("is clear air where there is no cloud", () => {
    const weather = new Weather({ layers: [] });
    const air = weather.sample(0, 1000, 0);

    expect(air.extinction).toBe(0);
    expect(air.inCloud).toBe(false);
    expect(air.visibilityM).toBeGreaterThan(1e6);
  });

  it("is in cloud inside a storm, and raining under it", () => {
    const weather = new Weather({
      layers: [
        cloud_layer("cumulonimbus", {
          cover: 0,
          cells: [{ at: [0, 0], diameterM: 10_000 }],
        }),
      ],
    });

    const inside = weather.sample(0, 5000, 0);
    const under = weather.sample(0, 200, 0);

    expect(inside.inCloud).toBe(true);
    expect(inside.visibilityM).toBeLessThan(100);
    expect(under.inCloud).toBe(false);
    expect(under.rain).toBeGreaterThan(0);
  });

  it("drifts its clouds with the wind", () => {
    const layer = cloud_layer("cumulonimbus", {
      cover: 0,
      cells: [{ at: [0, 0], diameterM: 10_000 }],
      windMPerS: [10, 0],
    });
    const weather = new Weather({ layers: [layer] });

    weather.advance(1000);

    expect(weather.sample(0, 5000, 0).inCloud).toBe(false);
    expect(weather.sample(10_000, 5000, 0).inCloud).toBe(true);
  });
});
