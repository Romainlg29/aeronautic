import { Matrix4, Object3D, Vector3 } from "three";
import { Flight } from "@aeronautic/core";
import { describe, expect, it, vi } from "vitest";
import { AFTERBURNER_ATTRIBUTES } from "./afterburner-material";
import { AfterburnerBatch, axis_distance } from "./afterburner-batch";

const render = (batch: AfterburnerBatch, frame: number) => {
  const camera = new Object3D() as unknown as Parameters<
    NonNullable<typeof batch.mesh.onBeforeRender>
  >[2];

  Object.assign(camera, {
    projectionMatrix: new Matrix4().makePerspective(-1, 1, 1, -1, 1, 1000),
    matrixWorldInverse: new Matrix4(),
  });

  batch.mesh.onBeforeRender(
    { info: { frame } } as never,
    null as never,
    camera,
    null as never,
    null as never,
    null as never,
  );
};

const slot_of = (batch: AfterburnerBatch, name: string, slot: number) => {
  const attribute = batch.mesh.geometry.getAttribute(name);

  return [0, 1, 2, 3].map((component) =>
    attribute.getComponent(slot, component),
  );
};

describe("AfterburnerBatch", () => {
  it("draws one instance per nozzle", () => {
    const batch = new AfterburnerBatch();

    batch.add();
    batch.add();

    expect(batch.mesh.geometry.instanceCount).toBe(2);
  });

  it("writes the throttle into the instance", () => {
    const batch = new AfterburnerBatch({ response_s: 0 });
    const nozzle = batch.add({ throttle: 0.4 });

    nozzle.throttle = 0.7;

    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.place, 0)[3]).toBeCloseTo(0.7);
  });

  it("eases the drawn throttle toward the one asked for", () => {
    const now = vi.spyOn(performance, "now");

    try {
      const batch = new AfterburnerBatch({ response_s: 0.25 });
      const nozzle = batch.add({ throttle: 1 });
      const drawn = () => slot_of(batch, AFTERBURNER_ATTRIBUTES.place, 0)[3];

      now.mockReturnValue(0);
      render(batch, 1);

      nozzle.throttle = 1.1;

      expect(nozzle.throttle).toBeCloseTo(1.1);
      expect(drawn()).toBeCloseTo(1);

      now.mockReturnValue(50);
      render(batch, 2);

      expect(drawn()).toBeGreaterThan(1);
      expect(drawn()).toBeLessThan(1.05);
      expect(nozzle.drawn_throttle).toBeCloseTo(drawn());

      for (let frame = 3; frame < 60; frame++) {
        now.mockReturnValue(frame * 50);
        render(batch, frame);
      }

      expect(drawn()).toBeCloseTo(1.1);
    } finally {
      now.mockRestore();
    }
  });

  it("moves the last nozzle into a removed one's slot", () => {
    const batch = new AfterburnerBatch();

    const first = batch.add({ params: { nozzle_radius_m: 1 } });
    const last = batch.add({ params: { nozzle_radius_m: 2 } });

    first.remove();

    expect(batch.nozzles).toEqual([last]);
    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.shape, 0)[0]).toBe(2);
  });

  it("grows past its capacity", () => {
    const batch = new AfterburnerBatch({ capacity: 2 });

    for (let index = 0; index < 5; index++) {
      batch.add({ params: { nozzle_radius_m: index + 1 } });
    }

    expect(batch.mesh.geometry.instanceCount).toBe(5);
    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.shape, 4)[0]).toBe(5);
    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.shape, 0)[0]).toBe(1);
  });

  it("follows its object, measured from an anchor", () => {
    const batch = new AfterburnerBatch();
    const object = new Object3D();

    object.position.set(5_000_000, 10, 20);
    object.updateMatrixWorld();

    batch.add({ object });
    render(batch, 1);

    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.place, 0).slice(0, 3)).toEqual(
      [0, 0, 0],
    );
    expect(batch.mesh.matrixWorld.elements[12]).toBe(5_000_000);

    object.position.x += 3;
    object.updateMatrixWorld();
    render(batch, 2);

    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.place, 0)[0]).toBeCloseTo(3);
  });

  it("scales a scaled nozzle's lengths", () => {
    const batch = new AfterburnerBatch();
    const object = new Object3D();

    object.scale.setScalar(2);
    object.updateMatrixWorld();

    batch.add({ object, params: { nozzle_radius_m: 0.5 } });
    render(batch, 1);

    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.shape, 0)[0]).toBe(1);
  });

  it("only builds the haze variant when a nozzle refracts", () => {
    const batch = new AfterburnerBatch();
    const clear = batch.mesh.material;

    batch.add({ params: { refraction_m: 0 } });
    expect(batch.mesh.material).toBe(clear);

    batch.add({ params: { refraction_m: 0.1 } });
    expect(batch.mesh.material).not.toBe(clear);
  });

  it("draws the furthest plume first", () => {
    const batch = new AfterburnerBatch({ response_s: 0 });
    const near = new Object3D();
    const far = new Object3D();

    near.position.set(0, 0, -10);
    far.position.set(0, 0, -100);
    near.updateMatrixWorld();
    far.updateMatrixWorld();

    batch.add({ object: near, params: { nozzle_radius_m: 1 } });
    batch.add({ object: far, params: { nozzle_radius_m: 2 } });
    render(batch, 1);

    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.shape, 0)[0]).toBe(2);
    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.shape, 1)[0]).toBe(1);
    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.place, 0)[2]).toBeCloseTo(-90);

    // The throttle follows its nozzle into its new slot
    batch.nozzles[1].throttle = 0.3;

    expect(slot_of(batch, AFTERBURNER_ATTRIBUTES.place, 1)[3]).toBeCloseTo(0.3);
  });

  it("measures a plume by the nearest point of its axis", () => {
    const elements = new Matrix4().makeTranslation(0, 0, 0).elements;

    expect(axis_distance(elements, 10, { x: 5, y: 3, z: 0 })).toBeCloseTo(3);
    expect(axis_distance(elements, 10, { x: 14, y: 3, z: 0 })).toBeCloseTo(5);
    expect(axis_distance(elements, 10, { x: -4, y: 3, z: 0 })).toBeCloseTo(5);
  });

  it("advances its clock once a frame", () => {
    const batch = new AfterburnerBatch();

    batch.add();
    render(batch, 1);

    const before = batch.uniforms.time.value;

    render(batch, 1);

    expect(batch.uniforms.time.value).toBe(before);
  });
});

describe("AfterburnerNozzle placement", () => {
  it("sits on its object at the offset given", () => {
    const batch = new AfterburnerBatch();
    const hull = new Object3D();

    hull.position.set(10, 0, 0);
    hull.rotation.set(0, Math.PI / 2, 0);
    hull.updateMatrixWorld();

    const nozzle = batch.add({
      object: hull,
      offset: { position: [-2, 0, 0], direction: [-1, 0, 0] },
    });

    const world = nozzle.world_matrix();
    const exit = new Vector3().setFromMatrixPosition(world);
    const along = new Vector3(1, 0, 0).transformDirection(world);

    // Two metres back along the hull's -X, which the turn has put on +Z
    expect(exit.x).toBeCloseTo(10);
    expect(exit.z).toBeCloseTo(2);
    expect(along.z).toBeCloseTo(1);
  });

  it("follows an object attached later, and holds still when let go", () => {
    const batch = new AfterburnerBatch();
    const hull = new Object3D();
    const nozzle = batch.add();

    hull.position.set(0, 5, 0);
    hull.updateMatrixWorld();
    nozzle.attach(hull, { position: [1, 0, 0] });

    expect(
      new Vector3().setFromMatrixPosition(nozzle.world_matrix()).toArray(),
    ).toEqual([1, 5, 0]);

    nozzle.attach(null);
    hull.position.set(0, 50, 0);
    hull.updateMatrixWorld();

    expect(
      new Vector3().setFromMatrixPosition(nozzle.world_matrix()).toArray(),
    ).toEqual([1, 5, 0]);
  });

  it("changes some params and keeps the rest", () => {
    const batch = new AfterburnerBatch();
    const nozzle = batch.add({ params: { nozzle_radius_m: 0.7 } });

    nozzle.update_params({ exit_mach: 1.8 });

    expect(nozzle.params.exit_mach).toBe(1.8);
    expect(nozzle.params.nozzle_radius_m).toBe(0.7);
  });

  it("changes some of the profile and keeps the rest", () => {
    const batch = new AfterburnerBatch({ profile: { airspeed_m_s: 200 } });

    batch.update_profile({ altitude_m: 9000 });

    expect(batch.profile.altitude_m).toBe(9000);
    expect(batch.profile.airspeed_m_s).toBe(200);
  });
});

describe("AfterburnerBatch with a source", () => {
  it("flies through the source's air", () => {
    const flight = new Flight({ altitude_m: 0, airspeed_m_s: 0 });
    const batch = new AfterburnerBatch({ source: flight });

    batch.add();
    render(batch, 1);

    expect(batch.profile.altitude_m).toBe(0);

    flight.set({
      altitude_m: 9000,
      airspeed_m_s: 250,
      temperature_offset_k: 5,
    });
    render(batch, 2);

    expect(batch.profile.altitude_m).toBe(9000);
    expect(batch.profile.airspeed_m_s).toBe(250);
    expect(batch.profile.temperature_offset_k).toBe(5);
  });

  it("runs only the nozzles that follow at the source's throttle", () => {
    const flight = new Flight({ throttle: 1 });
    const batch = new AfterburnerBatch({ source: flight, response_s: 0 });

    const following = batch.add({
      throttle: 1,
      throttle_from: (values) => values.throttle,
    });
    const halved = batch.add({
      throttle: 1,
      throttle_from: (values) => values.throttle / 2,
    });
    const own = batch.add({ throttle: 0.5 });

    flight.set({ throttle: 0.3 });
    render(batch, 1);

    expect(following.throttle).toBeCloseTo(0.3);
    expect(halved.throttle).toBeCloseTo(0.15);
    expect(own.throttle).toBeCloseTo(0.5);
  });

  it("is left alone with no source", () => {
    const batch = new AfterburnerBatch({ profile: { altitude_m: 1200 } });

    batch.add();
    render(batch, 1);

    expect(batch.profile.altitude_m).toBe(1200);
  });
});
