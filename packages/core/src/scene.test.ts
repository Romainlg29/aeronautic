import { screenUV } from "three/tsl";
import { describe, expect, it } from "vitest";
import { Color, Fog, FogExp2, Scene } from "three";
import {
  create_scene_fog,
  fog_factor,
  SCENE_FOG_DENSITY,
  SCENE_FOG_MEDIUM,
  SCENE_FOG_NONE,
  SCENE_FOG_RANGE,
  scene_color,
  scene_depth,
  set_scene_medium,
  write_scene_fog,
} from "./scene";

describe("scene_depth", () => {
  it("is one node, so the depth is copied once a render", () => {
    expect(scene_depth()).toBe(scene_depth());
  });
});

describe("scene_color", () => {
  it("is one node, and every sample of it copies into its texture", () => {
    const color = scene_color();
    const sample = color.sample(screenUV) as unknown as {
      referenceNode: unknown;
    };

    expect(scene_color()).toBe(color);
    expect(sample.referenceNode).toBe(color);
  });
});

describe("write_scene_fog", () => {
  it("writes no fog for a scene without one", () => {
    const fog = create_scene_fog();

    write_scene_fog(fog, new Scene());

    expect(fog.kind.value).toBe(SCENE_FOG_NONE);
  });

  it("writes a range fog's colour and distances", () => {
    const fog = create_scene_fog();
    const scene = new Scene();

    scene.fog = new Fog(0x8899aa, 100, 2000);
    write_scene_fog(fog, scene);

    expect(fog.kind.value).toBe(SCENE_FOG_RANGE);
    expect(fog.near.value).toBe(100);
    expect(fog.far.value).toBe(2000);
    expect(fog.color.value.equals(new Color(0x8899aa))).toBe(true);
  });

  it("writes a density fog, and forgets it once it is taken away", () => {
    const fog = create_scene_fog();
    const scene = new Scene();

    scene.fog = new FogExp2(0xffffff, 0.002);
    write_scene_fog(fog, scene);

    expect(fog.kind.value).toBe(SCENE_FOG_DENSITY);
    expect(fog.density.value).toBe(0.002);

    scene.fog = null;
    write_scene_fog(fog, scene);

    expect(fog.kind.value).toBe(SCENE_FOG_NONE);
  });
});

describe("fog_factor", () => {
  it("is three's smoothstep between near and far", () => {
    const fog = new Fog(0, 100, 300);

    expect(fog_factor(fog, 50)).toBe(0);
    expect(fog_factor(fog, 200)).toBeCloseTo(0.5, 12);
    expect(fog_factor(fog, 400)).toBe(1);
  });

  it("is three's squared exponential for a density fog", () => {
    // 1 - e^-(ρd)²: at ρd = 1, 1 - 1/e
    expect(fog_factor(new FogExp2(0, 0.01), 100)).toBeCloseTo(
      1 - 1 / Math.E,
      12,
    );
  });

  it("is nothing without fog", () => {
    expect(fog_factor(null, 1e6)).toBe(0);
  });
});

describe("scene medium", () => {
  it("is written over the fog while it is thick, and gone with it", () => {
    const fog = create_scene_fog();
    const scene = new Scene();

    scene.fog = new FogExp2(0xffffff, 0.002);
    set_scene_medium(scene, {
      extinction: 0.05,
      color: new Color(0.5, 0.5, 0.5),
    });
    write_scene_fog(fog, scene);

    expect(fog.kind.value).toBe(SCENE_FOG_MEDIUM);
    expect(fog.density.value).toBe(0.05);
    expect(fog.color.value.r).toBeCloseTo(0.5);

    set_scene_medium(scene, null);
    write_scene_fog(fog, scene);

    expect(fog.kind.value).toBe(SCENE_FOG_DENSITY);
  });

  it("lets e^(-σd) of the light through, Beer and Lambert's", () => {
    const medium = { extinction: 0.05, color: new Color() };

    expect(fog_factor(medium, 0)).toBe(0);
    expect(fog_factor(medium, 20)).toBeCloseTo(1 - Math.exp(-1));
  });
});
