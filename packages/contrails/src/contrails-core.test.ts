import { Flight } from "@aeronautic/core";
import { Matrix4, Object3D, type DataTexture } from "three";
import { describe, expect, it } from "vitest";
import { Contrails } from "./contrails-core";
import { puff_texel } from "./material";

const render = (trails: Contrails, frame: number) => {
  const camera = new Object3D() as unknown as Parameters<
    NonNullable<typeof trails.mesh.onBeforeRender>
  >[2];

  Object.assign(camera, {
    projectionMatrix: new Matrix4().makePerspective(-1, 1, 1, -1, 1, 1000),
    matrixWorldInverse: new Matrix4(),
  });

  trails.mesh.onBeforeRender(
    { info: { frame } } as never,
    null as never,
    camera,
    null as never,
    null as never,
    null as never,
  );
};

/**
 * The puffs' texture, as the shader reads it.
 * @param trails The trails
 * @returns Its floats
 */
const texels = (trails: Contrails) =>
  (
    (trails as unknown as { _puffs: DataTexture })._puffs.image
      .data as Float32Array
  ).slice();

describe("Contrails", () => {
  it("forms and persists on the default day", () => {
    const trails = new Contrails();

    expect(trails.state.visible).toBe(true);
    expect(trails.state.persistent).toBe(true);
    expect(trails.state.efficiency).toBeGreaterThan(0.2);
    expect(trails.state.efficiency).toBeLessThan(0.4);
  });

  it("keeps its trails unloaded and pushed, the engines still pushing", () => {
    const level = new Contrails().state.fuelPerMetreKg;

    for (const loadFactor of [0, -1, -3]) {
      const trails = new Contrails({ flight: { loadFactor } });

      expect(trails.state.visible).toBe(true);
      expect(trails.state.fuelPerMetreKg).toBeGreaterThan(0.7 * level);
    }

    // The drag polar: a quarter less unloaded, the same pushed as pulled
    expect(
      new Contrails({ flight: { loadFactor: 0 } }).state.fuelPerMetreKg,
    ).toBeCloseTo(0.75 * level, 12);
    expect(
      new Contrails({ flight: { loadFactor: -2 } }).state.fuelPerMetreKg,
    ).toBeCloseTo(
      new Contrails({ flight: { loadFactor: 2 } }).state.fuelPerMetreKg,
      12,
    );
  });

  it("burns no more in a hard pull than its engines make dry up there", () => {
    const level = new Contrails().state.fuelPerMetreKg;
    const pulled = new Contrails({ flight: { loadFactor: 9 } }).state;

    // Both engines' 70.6 kN dry, 0.36 of it at 11 km and Mach 0.85, over the
    // 21.8 kN it takes level: about 2.3 times
    expect(pulled.fuelPerMetreKg / level).toBeGreaterThan(2.1);
    expect(pulled.fuelPerMetreKg / level).toBeLessThan(2.5);

    // Without the cap the drag polar would ask for (3 + 81) / 4 = 21 times
    const unbounded = new Contrails({
      airframe: { maxThrustN: Infinity, dryThrustN: Infinity },
      flight: { loadFactor: 9 },
    }).state;

    expect(unbounded.fuelPerMetreKg / level).toBeCloseTo(21, 6);
  });

  it("burns the reheat's fuel, and lays that fuel's water", () => {
    const dry = new Contrails().state;
    const lit = new Contrails({ flight: { throttle: 1.1 } }).state;

    expect(dry.reheat).toBe(0);
    expect(lit.reheat).toBeCloseTo(1, 9);

    // Both engines' 118 kN at full reheat, 0.36 of it up here, at 1.58 times
    // the dry consumption: about six times the fuel of cruise
    expect(lit.thrustN).toBeCloseTo(2 * 117_680 * 0.358, -3);
    expect(lit.fuelPerMetreKg / dry.fuelPerMetreKg).toBeGreaterThan(5.5);
    expect(lit.fuelPerMetreKg / dry.fuelPerMetreKg).toBeLessThan(6.5);

    // Less of its heat pushes, so the mixing line is shallower: a colder
    // threshold, and a plume that takes longer to cool to it
    expect(lit.efficiency).toBeCloseTo(0.16, 2);
    expect(lit.criterion.thresholdK).toBeLessThan(dry.criterion.thresholdK);
    expect(lit.formation.dilution).toBeGreaterThan(dry.formation.dilution);
  });

  it("lights the burner on a core already at military power", () => {
    const dry = new Contrails({ flight: { throttle: 1 } }).state;
    const just = new Contrails({ flight: { throttle: 1.001 } }).state;
    const lit = new Contrails({ flight: { throttle: 1.03 } }).state;

    // Past the detent it is lit before it is staged
    expect(just.thrustN).toBeGreaterThan(dry.thrustN);
    expect(lit.thrustN).toBeGreaterThan(2 * 70_608 * 0.358);

    let last = 0;

    for (let throttle = 1; throttle <= 1.1; throttle += 0.005) {
      const state = new Contrails({ flight: { throttle } }).state;

      expect(state.fuelPerMetreKg).toBeGreaterThanOrEqual(last);
      last = state.fuelPerMetreKg;
    }
  });

  it("has no burner to light on an engine without reheat", () => {
    const dry = new Contrails().state;
    const pushed = new Contrails({
      airframe: { dryThrustN: 117_680 },
      flight: { throttle: 1.1 },
    }).state;

    expect(pushed.reheat).toBe(0);
    expect(pushed.fuelPerMetreKg).toBeCloseTo(dry.fuelPerMetreKg, 12);
  });

  it("forms nothing low down on a mild day", () => {
    const trails = new Contrails({
      air: { altitudeM: 3000, relativeHumidity: 0.5 },
    });

    expect(trails.state.visible).toBe(false);
  });

  it("flies the source's flight and air", () => {
    const flight = new Flight({
      airspeedMPerS: 220,
      loadFactor: 2,
      throttle: 1.1,
      altitudeM: 9500,
      relativeHumidity: 0.4,
    });

    const trails = new Contrails({ source: flight });

    render(trails, 1);

    expect(trails.flight.airspeedMPerS).toBe(220);
    expect(trails.flight.loadFactor).toBe(2);
    expect(trails.flight.throttle).toBe(1.1);
    expect(trails.state.reheat).toBeCloseTo(1, 9);
    expect(trails.air.altitudeM).toBe(9500);
    expect(trails.air.relativeHumidity).toBe(0.4);
  });

  it("rebuilds for a different number of engines", () => {
    const trails = new Contrails();
    const before = trails.mesh.geometry.index!.count;

    trails.updateAirframe({
      engines: [
        [-10, 0, 2],
        [-5, 0, 1],
        [5, 0, 1],
        [10, 0, 2],
      ],
    });

    expect(trails.mesh.geometry.index!.count).toBe(before * 2);
  });

  it("lays each trail aft from its engine, and below as it ages", () => {
    const trails = new Contrails({ quality: { points: 16, puffs: 256 } });

    render(trails, 1);

    const data = texels(trails);
    const drawn = trails.mesh.geometry.drawRange.count / 6 / 2;

    expect(drawn).toBeGreaterThan(100);
    expect(drawn).toBeLessThanOrEqual(256);

    // The first engine's youngest and oldest puffs, where they were left
    const first_at = puff_texel(0, 3, 256);
    const last_at = puff_texel(drawn - 1, 3, 256);
    const first = data.slice(first_at, first_at + 3);
    const last = data.slice(last_at, last_at + 3);
    const age = data[0];

    // The engine, at -Z forward: the canonical frame has it 7 m aft, and the
    // youngest puff its age's flight behind that
    expect(first[0]).toBeCloseTo(7 + 250 * age, 0);
    expect(last[0]).toBeGreaterThan(250 * 50);
    expect(last[1]).toBeLessThan(-50);

    // Ice along the trail, which runs back aft at the airspeed
    const middle = puff_texel(drawn >> 1, 1, 256);

    expect(data[middle]).toBeGreaterThan(0);
    expect(data[middle + 1]).toBeGreaterThan(0);
    expect(data[middle + 2]).toBeCloseTo(250, 3);
    expect(data[puff_texel(drawn >> 1, 2, 256)]).toBeCloseTo(1, 3);
  });
});
