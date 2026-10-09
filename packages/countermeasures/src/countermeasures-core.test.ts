import { Flight } from "@aeronautic/core";
import { PerspectiveCamera, PointLight, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Countermeasures } from "./countermeasures-core";

let now_ms = 0;
let frame = 0;

/**
 * Draw a frame a while after the last.
 * @param countermeasures What to draw
 * @param delta_s How long after, seconds
 */
const render = (countermeasures: Countermeasures, delta_s: number) => {
  now_ms += delta_s * 1000;
  vi.spyOn(performance, "now").mockReturnValue(now_ms);

  const camera = new PerspectiveCamera(50, 1, 0.1, 10_000);

  camera.position.set(0, 0, 50);
  camera.updateMatrixWorld();

  countermeasures.group.updateMatrixWorld();
  countermeasures.glare.onBeforeRender(
    {
      info: { frame: frame++ },
      getDrawingBufferSize: (target: { set: (x: number, y: number) => void }) =>
        target.set(800, 800),
    } as never,
    { fog: null } as never,
    camera,
    null as never,
    null as never,
    null as never,
  );
};

/**
 * Fly a while in frames of a sixtieth of a second.
 * @param countermeasures What to fly
 * @param seconds How long
 */
const fly = (countermeasures: Countermeasures, seconds: number) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 1 / 60) {
    render(countermeasures, 1 / 60);
  }
};

/**
 * Where the burning flares are from the group, world axes.
 * @param countermeasures Them
 * @returns Their positions
 */
const positions = (countermeasures: Countermeasures) =>
  (
    countermeasures as unknown as { _burning: { position: Vector3 }[] }
  )._burning.map((flare) => flare.position.clone());

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Countermeasures", () => {
  it("lets a program's flares go over its seconds", () => {
    const countermeasures = new Countermeasures();

    render(countermeasures, 0);
    expect(countermeasures.fire()).toBe(8);

    render(countermeasures, 1 / 60);
    expect(countermeasures.burning).toBe(1);

    fly(countermeasures, 1.3);
    expect(countermeasures.burning).toBe(4);
    expect(countermeasures.pending).toBe(4);

    countermeasures.stop();
    expect(countermeasures.pending).toBe(0);
  });

  it("burns them out", () => {
    const countermeasures = new Countermeasures();

    render(countermeasures, 0);
    countermeasures.release();
    fly(countermeasures, countermeasures.burnTimeS - 0.1);
    expect(countermeasures.burning).toBe(1);

    fly(countermeasures, 0.2);
    expect(countermeasures.burning).toBe(0);
  });

  it("lets go when pressed, long after the last frame", () => {
    const countermeasures = new Countermeasures();

    render(countermeasures, 0);

    // A tab that has stopped drawing for ten seconds
    now_ms += 10_000;
    vi.spyOn(performance, "now").mockReturnValue(now_ms);
    countermeasures.release();

    render(countermeasures, 1 / 60);
    expect(countermeasures.burning).toBe(1);
  });

  it("leaves them behind and below, the aircraft flying on", () => {
    const countermeasures = new Countermeasures();

    render(countermeasures, 0);
    countermeasures.release(0);
    fly(countermeasures, 1);

    const [flare] = positions(countermeasures);

    // Slowed by its drag, it falls back aft of the dispenser, +Z: more than
    // a few tens of metres in its first second at 250 m/s
    expect(flare.z).toBeGreaterThan(50);
    expect(flare.z).toBeLessThan(250);

    // Thrown down at 30 m/s and slowed, then falling
    expect(flare.y).toBeLessThan(-5);
  });

  it("flies with a shared flight", () => {
    const flight = new Flight();
    const countermeasures = new Countermeasures({ source: flight });

    flight.set({ airspeedMPerS: 0 });
    render(countermeasures, 0);
    countermeasures.release(0);
    fly(countermeasures, 1);

    // Still air, a still aircraft: it only falls, thrown down
    const [flare] = positions(countermeasures);

    expect(Math.abs(flare.z - 5)).toBeLessThan(1e-6);
    expect(flare.y).toBeLessThan(-10);
  });

  it("lights the scene from its brightest", () => {
    const countermeasures = new Countermeasures({ quality: { lights: 1 } });
    const lights = countermeasures.group.children.filter(
      (child): child is PointLight => child instanceof PointLight,
    );

    expect(lights).toHaveLength(1);

    render(countermeasures, 0);
    expect(lights[0].visible).toBe(false);

    countermeasures.release();
    render(countermeasures, 1 / 60);
    expect(lights[0].visible).toBe(true);
    expect(lights[0].intensity).toBeGreaterThan(0);
  });
});
