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

    const out_s =
      countermeasures.flare.ignitionDelayS + countermeasures.burnTimeS;

    fly(countermeasures, out_s - 0.1);
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

  it("draws its meshes before any flare leaves, built with the scene", () => {
    const countermeasures = new Countermeasures();

    render(countermeasures, 0);

    // One triangle of no area: drawn, so its pipeline is built now and not
    // when the first flare leaves
    const glare = countermeasures.glare.geometry;

    expect(glare.drawRange.count).toBe(3);
    expect(glare.getAttribute("position").getX(2)).toBe(0);
  });

  it("leaves a trail behind each flare in the airstream", () => {
    const countermeasures = new Countermeasures();
    const camera = new PerspectiveCamera(50, 1, 0.1, 10_000);

    camera.position.set(-40, 0, 50);
    camera.updateMatrixWorld();
    render(countermeasures, 0);
    countermeasures.release(0);
    fly(countermeasures, 0.25);

    const draw = () =>
      countermeasures.trail.onBeforeRender(
        {
          info: { frame },
          getDrawingBufferSize: (target: {
            set: (x: number, y: number) => void;
          }) => target.set(800, 800),
        } as never,
        { fog: null } as never,
        camera,
        null as never,
        null as never,
        null as never,
      );

    draw();
    expect(countermeasures.trail.geometry.drawRange.count).toBe(24);

    const colors = countermeasures.trail.geometry.getAttribute("color");

    // Brightest at the grain, fading back along it
    expect(colors.getX(0)).toBeGreaterThan(colors.getX(1));
  });

  it("lights the scene from its brightest", () => {
    const countermeasures = new Countermeasures({ quality: { lights: 1 } });
    const lights = countermeasures.group.children.filter(
      (child): child is PointLight => child instanceof PointLight,
    );

    expect(lights).toHaveLength(1);

    render(countermeasures, 0);
    expect(lights[0].intensity).toBe(0);

    countermeasures.release();
    render(countermeasures, 1 / 60);

    // The igniter has still to light it
    expect(lights[0].intensity).toBe(0);

    fly(countermeasures, 0.15);
    expect(lights[0].intensity).toBeGreaterThan(0);
  });

  it("burns longer high up, in thinner air", () => {
    const low = new Countermeasures({ air: { altitudeM: 0 } });
    const high = new Countermeasures({ air: { altitudeM: 12_000 } });

    // MTV's rate goes with the pressure to the 0.094: a fifth of sea
    // level's at 12 km burns 14 % slower
    expect(high.burnTimeS / low.burnTimeS).toBeCloseTo(
      (101_325 / 19_330) ** 0.094,
      2,
    );
  });

  it("leaves smoke behind that lingers after the flare is out", () => {
    const countermeasures = new Countermeasures();
    const camera = new PerspectiveCamera(50, 1, 0.1, 10_000);

    camera.position.set(-200, 0, 300);
    camera.updateMatrixWorld();
    render(countermeasures, 0);
    countermeasures.release(0);
    fly(countermeasures, 1);

    const draw = () =>
      countermeasures.smoke.onBeforeRender(
        {
          info: { frame },
          getDrawingBufferSize: (target: {
            set: (x: number, y: number) => void;
          }) => target.set(800, 800),
        } as never,
        { fog: null } as never,
        camera,
        null as never,
        null as never,
        null as never,
      );

    draw();
    expect(countermeasures.smoking).toBe(1);

    const geometry = countermeasures.smoke.geometry;
    const depths = geometry.getAttribute("smoke");
    const colors = geometry.getAttribute("color");

    expect(geometry.drawRange.count).toBeGreaterThan(0);

    // Thick enough to see, lit by its own flare
    expect(depths.getY(0)).toBeGreaterThan(0.1);
    expect(colors.getX(0)).toBeGreaterThan(0);

    fly(countermeasures, countermeasures.burnTimeS);
    expect(countermeasures.burning).toBe(0);
    expect(countermeasures.smoking).toBe(1);

    countermeasures.clear();
    expect(countermeasures.smoking).toBe(0);
  });

  it("lays chaff where it left, sinking, until it spreads too thin", () => {
    const countermeasures = new Countermeasures({
      look: { sunIntensity: 3 },
    });
    const camera = new PerspectiveCamera(50, 1, 0.1, 10_000);

    camera.position.set(-200, 0, 300);
    camera.updateMatrixWorld();
    render(countermeasures, 0);
    countermeasures.fire({ payload: "chaff", burst: 1, salvo: 1 });
    fly(countermeasures, 1);

    expect(countermeasures.burning).toBe(0);
    expect(countermeasures.chaffClouds).toBe(1);

    const draw = () =>
      countermeasures.clouds.onBeforeRender(
        {
          info: { frame },
          getDrawingBufferSize: (target: {
            set: (x: number, y: number) => void;
          }) => target.set(800, 800),
        } as never,
        { fog: null } as never,
        camera,
        null as never,
        null as never,
        null as never,
      );

    draw();

    const geometry = countermeasures.clouds.geometry;
    const depths = geometry.getAttribute("chaff");
    const positions = geometry.getAttribute("position");

    expect(geometry.drawRange.count).toBe(6);
    expect(depths.getZ(0)).toBeGreaterThan(SEEN);
    expect(geometry.getAttribute("color").getX(0)).toBeGreaterThan(0);

    // A second at 250 m/s: the aircraft is 250 m on, the cloud behind it
    let z = 0;

    for (let corner = 0; corner < 6; corner++) z += positions.getZ(corner) / 6;

    expect(z).toBeGreaterThan(230);
    expect(z).toBeLessThan(260);

    // Spread by the turbulence past seeing, within a minute
    fly(countermeasures, 60);
    expect(countermeasures.chaffClouds).toBe(0);
  });
});

/** Thick enough to see: the thinnest smoke kept */
const SEEN = 0.02;
