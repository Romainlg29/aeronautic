import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import { moist_air } from "./atmosphere";
import { Flight } from "./flight";

const DEG = Math.PI / 180;

/**
 * Fly an object for a while, a step at a time, tracking it.
 * @param flight The flight
 * @param object The object
 * @param step Moves the object by one step
 * @param frames How many steps
 * @param delta_s How long each one is
 */
const fly = (
  flight: Flight,
  object: Object3D,
  step: (object: Object3D, delta_s: number) => void,
  frames = 120,
  delta_s = 1 / 60,
) => {
  flight.track(object, delta_s);

  for (let frame = 0; frame < frames; frame++) {
    step(object, delta_s);
    object.updateMatrixWorld();
    flight.track(object, delta_s);
  }
};

describe("Flight", () => {
  it("works out the air and the speeds from what is written", () => {
    const flight = new Flight({
      airspeed_m_s: 340.3,
      altitude_m: 0,
      relative_humidity: 0,
    });

    expect(flight.values.mach).toBeCloseTo(1, 2);
    expect(flight.values.density_ratio).toBeCloseTo(1, 2);
    expect(flight.values.dynamic_pressure_pa).toBeCloseTo(
      0.5 * 1.225 * 340.3 * 340.3,
      -2,
    );
  });

  it("reads the same air as the atmosphere", () => {
    const flight = new Flight({
      altitude_m: 9000,
      temperature_offset_k: 4,
      relative_humidity: 0.3,
    });

    const air = moist_air(9000, 0.3, 4);

    expect(flight.values.temperature_k).toBe(air.temperature_k);
    expect(flight.values.density_kg_m3).toBe(air.density_kg_m3);
    expect(flight.values.sound_m_s).toBe(air.sound_m_s);
  });

  it("keeps one values object for its life", () => {
    const flight = new Flight();
    const values = flight.values;

    flight.set({ airspeed_m_s: 200, altitude_m: 5000 });

    expect(flight.values).toBe(values);
    expect(values.airspeed_m_s).toBe(200);
  });

  it("counts and tells of writes, and only of real ones", () => {
    const flight = new Flight();
    let heard = 0;

    const stop = flight.subscribe(() => heard++);

    flight.set({ throttle: 0.5 });
    flight.set({ throttle: 0.5 });
    flight.set({ throttle: 0.7, pitch: 0.2 });

    expect(heard).toBe(2);
    expect(flight.version).toBe(2);

    stop();
    flight.set({ throttle: 1 });

    expect(heard).toBe(2);
  });

  it("thins with the altitude", () => {
    const flight = new Flight({ airspeed_m_s: 250 });
    const low = flight.values.dynamic_pressure_pa;

    flight.set({ altitude_m: 10_000 });

    expect(flight.values.dynamic_pressure_pa).toBeLessThan(low / 2);
    expect(flight.values.mach).toBeGreaterThan(250 / 340.3);
  });
});

describe("Flight.track", () => {
  it("only starts watching on its first call", () => {
    const flight = new Flight();

    flight.track(new Object3D(), 1 / 60);

    expect(flight.version).toBe(0);
  });

  it("reads level flight: the speed, no angles, one g", () => {
    const flight = new Flight();
    const object = new Object3D();

    fly(flight, object, (o, dt) => o.translateZ(-200 * dt));

    expect(flight.values.airspeed_m_s).toBeCloseTo(200, 0);
    expect(flight.values.angle_of_attack_rad).toBeCloseTo(0, 3);
    expect(flight.values.sideslip_rad).toBeCloseTo(0, 3);
    expect(flight.values.load_factor).toBeCloseTo(1, 2);
  });

  it("reads the angle of attack with the nose above the path", () => {
    const flight = new Flight();
    const object = new Object3D();

    object.rotation.x = 6 * DEG;

    fly(flight, object, (o, dt) => (o.position.z -= 200 * dt));

    expect(flight.values.angle_of_attack_rad / DEG).toBeCloseTo(6, 1);
  });

  it("reads sideslip with the air from the right as positive", () => {
    const flight = new Flight();
    const object = new Object3D();

    fly(flight, object, (o, dt) => {
      o.position.z -= 200 * dt;
      o.position.x += 20 * dt;
    });

    expect(flight.values.sideslip_rad).toBeGreaterThan(0);
    expect(flight.values.sideslip_rad).toBeCloseTo(Math.asin(20 / 201), 2);
  });

  it("takes the wind out of the airspeed", () => {
    const flight = new Flight();
    const object = new Object3D();

    flight.track(object, 1 / 60, { wind: [0, 0, -50] });

    for (let frame = 0; frame < 120; frame++) {
      object.position.z -= 200 / 60;
      object.updateMatrixWorld();
      flight.track(object, 1 / 60, { wind: [0, 0, -50] });
    }

    expect(flight.values.airspeed_m_s).toBeCloseTo(150, 0);
  });

  it("reads the load factor of a level turn", () => {
    const flight = new Flight();
    const object = new Object3D();

    const speed = 200;
    const radius = 1000;
    const g = (speed * speed) / radius / 9.80665;
    const bank = Math.atan(g);

    let angle = 0;

    fly(
      flight,
      object,
      (o, dt) => {
        angle += (speed / radius) * dt;

        // Round a circle about the origin, nose along it, banked into it
        o.position.set(radius * Math.cos(angle), 0, -radius * Math.sin(angle));
        o.rotation.set(0, angle + Math.PI, 0, "YXZ");
        o.rotation.z = -bank;
      },
      240,
    );

    expect(flight.values.load_factor).toBeCloseTo(Math.hypot(1, g), 1);
    expect(flight.values.yaw_rate_rad_s).not.toBe(0);
  });

  it("reads the rates in the aircraft's own frame, right, up and right", () => {
    const rate = (turn: (o: Object3D, angle: number) => void) => {
      const flight = new Flight();
      const object = new Object3D();

      fly(flight, object, (o, dt) => {
        o.translateZ(-100 * dt);
        turn(o, 0.5 * dt);
      });

      return flight.values;
    };

    // Right wing down: about the nose's axis, forward
    const roll = rate((o, a) => o.rotateOnAxis(new Vector3(0, 0, -1), a));

    expect(roll.roll_rate_rad_s).toBeCloseTo(0.5, 2);
    expect(roll.pitch_rate_rad_s).toBeCloseTo(0, 3);

    // Nose up: about the right wing
    const pitch = rate((o, a) => o.rotateX(a));

    expect(pitch.pitch_rate_rad_s).toBeCloseTo(0.5, 2);

    // Nose right: about down
    const yaw = rate((o, a) => o.rotateY(-a));

    expect(yaw.yaw_rate_rad_s).toBeCloseTo(0.5, 2);
  });

  it("reads the altitude above sea level when given", () => {
    const flight = new Flight({ altitude_m: 123 });
    const object = new Object3D();

    object.position.y = 3000;

    fly(flight, object, (o, dt) => o.translateZ(-100 * dt), 4);

    expect(flight.values.altitude_m).toBe(123);

    flight.track(object, 1 / 60, { sea_level_y: -500 });

    expect(flight.values.altitude_m).toBe(3500);
  });

  it("tracks a model that flies along +X", () => {
    const flight = new Flight();
    const object = new Object3D();

    flight.track(object, 1 / 60, { forward: [1, 0, 0] });

    for (let frame = 0; frame < 120; frame++) {
      object.position.x += 150 / 60;
      object.updateMatrixWorld();
      flight.track(object, 1 / 60, { forward: [1, 0, 0] });
    }

    expect(flight.values.airspeed_m_s).toBeCloseTo(150, 0);
    expect(flight.values.angle_of_attack_rad).toBeCloseTo(0, 3);
  });
});
