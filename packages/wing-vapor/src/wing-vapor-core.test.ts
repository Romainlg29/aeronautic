import { Flight } from "@aeronautic/core";
import { Matrix4, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { WingVapor } from "./wing-vapor-core";

const render = (vapor: WingVapor, frame: number) => {
  const camera = new Object3D() as unknown as Parameters<
    NonNullable<typeof vapor.mesh.onBeforeRender>
  >[2];

  Object.assign(camera, {
    projectionMatrix: new Matrix4().makePerspective(-1, 1, 1, -1, 1, 1000),
    matrixWorldInverse: new Matrix4(),
  });

  vapor.mesh.onBeforeRender(
    { info: { frame } } as never,
    null as never,
    camera,
    null as never,
    null as never,
    null as never,
  );
};

describe("WingVapor with a source", () => {
  it("flies the source's flight and air", () => {
    const flight = new Flight({
      airspeedMPerS: 120,
      angleOfAttackRad: 0.1,
      altitudeM: 1234,
      relativeHumidity: 0.9,
    });

    const vapor = new WingVapor({ source: flight });

    render(vapor, 1);

    expect(vapor.flight.airspeedMPerS).toBe(120);
    expect(vapor.flight.angleOfAttackRad).toBe(0.1);
    expect(vapor.air.relativeHumidity).toBe(0.9);

    // To the nearest ten metres, so the table is not rebuilt every frame
    expect(vapor.air.altitudeM).toBe(1230);

    vapor.dispose();
  });

  it("turns the flight's sideslip, from the right, into its own, from +z", () => {
    const flight = new Flight({ sideslipRad: 0.05 });
    const vapor = new WingVapor({ source: flight });

    render(vapor, 1);

    expect(vapor.flight.sideslipRad).toBe(-0.05);

    vapor.dispose();
  });

  it("flies only what is written with no source", () => {
    const vapor = new WingVapor({ flight: { airspeedMPerS: 80 } });

    render(vapor, 1);

    expect(vapor.flight.airspeedMPerS).toBe(80);

    vapor.dispose();
  });
});
