import { Flight } from "@aeronautic/core";
import { type AnimationClip, type Object3D, Vector3 } from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { load_fighter } from "./fighter.fixture";
import { add_engine } from "./engine";
import { fighter_controls } from "./fighter";
import { rudders } from "./parts";
import { ControlRig, type ControlRigOptions } from "./rig";

let scene: Object3D;
let animations: AnimationClip[];

beforeEach(async () => {
  ({ scene, animations } = await load_fighter());
});

/**
 * Run a rig for a while.
 * @param rig The rig
 * @param seconds How long
 * @param step Each frame's length
 */
const run = (rig: ControlRig, seconds: number, step = 1 / 60) => {
  for (let time = 0; time < seconds; time += step) rig.update(step);
};

/**
 * How far a node is turned from where it was found.
 * @param rig The rig
 * @param name The node
 * @returns The angle, in degrees
 */
const turned = (rig: ControlRig, name: string): number => {
  const node = rig.root.getObjectByName(name)!;

  return (
    (node.quaternion.angleTo(rig.surface(name)!.base_quaternion) * 180) /
    Math.PI
  );
};

/**
 * A rig with a fighter's controls.
 * @param options How the rig is made
 * @returns The rig
 */
const fighter = (options: ControlRigOptions = {}) => {
  const rig = new ControlRig(scene, { animations, ...options });

  fighter_controls(rig);

  return rig;
};

describe("ControlRig", () => {
  it("holds the rest pose with no flight", () => {
    const rig = fighter();

    run(rig, 0.5);

    expect(rig.value("CTRL_Elevon_Outer_L")).toBe(0);
    expect(rig.value("CTRL_Door_MainGear_L")).toBe(102);
  });

  it("settles on the flight's pose at the first read", () => {
    const flight = new Flight({ pitch: 1, gear: 1 });
    const rig = fighter({ source: flight });

    rig.update(1 / 60);

    expect(rig.value("CTRL_Elevon_Outer_L")).toBeLessThan(0);
    expect(rig.value("CTRL_Stick_Pitch")).toBe(15);
  });

  it("moves at the actuators' rates after that", () => {
    const flight = new Flight({ gear: 1 });
    const rig = fighter({ source: flight });

    rig.update(1 / 60);

    flight.set({ yaw: 1 });
    rig.update(0.1);

    // 80 degrees a second for a rudder
    expect(rig.value("CTRL_Rudder_L")).toBeCloseTo(8);
    expect(turned(rig, "CTRL_Rudder_L")).toBeCloseTo(8, 3);

    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(30);
  });

  it("scrubs the gear's clip, and runs it in the clip's time", () => {
    const flight = new Flight({ gear: 1 });
    const rig = fighter({ source: flight });
    const gear = rig.clips.get("ANIM_Gear_Retract")!;

    rig.update(1 / 60);

    expect(gear.position).toBe(0);

    flight.set({ gear: 0 });
    run(rig, gear.clip.duration / 2);

    expect(gear.position).toBeGreaterThan(0.4);
    expect(gear.position).toBeLessThan(0.6);

    run(rig, gear.clip.duration);

    expect(gear.position).toBe(1);

    // The clip moved the leg, not the mixer
    expect(turned(rig, "CTRL_Gear_Main_L_Fold")).toBeGreaterThan(45);
  });

  it("opens the nozzles' clips with the throttle", () => {
    const flight = new Flight({ throttle: 1, gear: 1 });
    const rig = fighter({ source: flight });
    const nozzle = rig.clips.get("ANIM_Nozzle_L_Open")!;

    rig.update(1 / 60);

    expect(nozzle.position).toBeCloseTo(0);

    flight.set({ throttle: 1.1 });
    run(rig, 2);

    expect(nozzle.position).toBe(1);
    expect(turned(rig, "CTRL_Nozzle_L_Petal_01")).toBeGreaterThan(1);
  });

  it("lets the hands win over the flight, and gives it back", () => {
    const flight = new Flight({ gear: 1 });
    const rig = fighter({ source: flight });

    rig.update(1 / 60);
    rig.set("CTRL_Rudder_L", -10);
    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(-10);

    rig.set("CTRL_Rudder_L", null);
    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(0);
  });

  it("opens a group and scrubs a clip by hand", () => {
    const rig = fighter();

    rig.set_group("bay", 1);
    run(rig, 0.1);

    expect(rig.value("CTRL_Door_Bay_L")).toBe(105);

    rig.set_clip("ANIM_Canopy_Open", 1, Infinity);
    rig.update(1 / 60);

    expect(turned(rig, "CTRL_Canopy_C")).toBeGreaterThan(30);
  });

  it("reads nothing again until the flight changes", () => {
    const flight = new Flight({ gear: 1 });
    const rig = fighter({ source: flight });

    rig.update(1 / 60);

    const node = rig.root.getObjectByName("CTRL_Rudder_L")!;
    const before = node.quaternion.clone();

    run(rig, 0.5);

    expect(node.quaternion.equals(before)).toBe(true);
  });

  it("lets a more specific drive win, and gives the part back", () => {
    const flight = new Flight({ gear: 1, yaw: 1 });
    const rig = fighter({ source: flight });
    const left = rig.drive({
      parts: ["CTRL_Rudder_L"],
      from: () => -5,
      rate: Infinity,
    });

    rig.update(1 / 60);

    expect(rig.value("CTRL_Rudder_L")).toBe(-5);
    expect(rig.value("CTRL_Rudder_R")).toBe(30);

    left.dispose();
    rig.update(1 / 60);
    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(30);
  });

  it("rests a part no drive claims, and tells when a part moves", () => {
    const flight = new Flight({ gear: 1, yaw: 1 });
    const rig = new ControlRig(scene, { animations, source: flight });
    const moves: number[] = [];
    const drive = rudders(rig, {
      side: "left",
      on_move: (value) => moves.push(value),
    });

    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(30);
    expect(rig.value("CTRL_Rudder_R")).toBe(0);
    expect(moves.at(-1)).toBe(30);

    drive.dispose();
    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(0);
  });

  it("reads a part's from in place", () => {
    const flight = new Flight({ gear: 1, yaw: 1 });
    const rig = new ControlRig(scene, { animations, source: flight });
    const options = { from: () => 0.5 };
    const drive = rudders(rig, options);

    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(15);

    options.from = () => -1;
    drive.refresh();
    run(rig, 1);

    expect(rig.value("CTRL_Rudder_L")).toBe(-30);
  });
});

describe("Engine", () => {
  it("reads its gimbal's limits and shape off the model", () => {
    const rig = new ControlRig(scene, { animations });
    const engine = add_engine(rig, { side: "left" });

    expect(engine.vectoring.gimbal).toBe("model");
    expect(engine.vectoring.shape).toBe("ellipse");
    expect(engine.vectoring.pitch).toEqual({ min: -4, max: 4 });
    expect(engine.vectoring.yaw).toEqual({ min: -9.5, max: 9.5 });
    expect(engine.anchor?.name).toBe("FX_Exhaust_L");
    expect(engine.parts.petals.length).toBeGreaterThan(0);
    expect(engine.clip?.clip.name).toBe("ANIM_Nozzle_L_Open");
  });

  it("points the exhaust up for nose up, within one round limit", () => {
    const flight = new Flight({ gear: 1, pitch: 1, yaw: 1 });
    const rig = new ControlRig(scene, { animations, source: flight });
    const vectors: [number, number][] = [];
    const engine = add_engine(rig, {
      side: "left",
      on_vector: (pitch, yaw) => vectors.push([pitch, yaw]),
    });

    run(rig, 1);

    // Full stick and full pedal reach the circle, not its corner
    expect(engine.pitch_deg).toBeCloseTo(4 / Math.SQRT2);
    expect(engine.yaw_deg).toBeCloseTo(9.5 / Math.SQRT2);
    expect(vectors.at(-1)).toEqual([engine.pitch_deg, engine.yaw_deg]);
  });

  it("caps the vectoring within the model's limits", () => {
    const rig = new ControlRig(scene, { animations });
    const engine = add_engine(rig, {
      side: "right",
      vectoring: { pitch: 2, yaw: 50 },
    });

    expect(engine.vectoring.pitch).toEqual({ min: -2, max: 2 });
    expect(engine.vectoring.yaw).toEqual({ min: -9.5, max: 9.5 });
  });

  it("puts a gimbal in where the model has none, and takes it out", () => {
    const flight = new Flight({ gear: 1, pitch: 1 });
    const rig = new ControlRig(scene, {
      animations,
      source: flight,
      filter: (node) => !/^CTRL_Nozzle/.test(node.name),
    });
    const exhaust = rig.root.getObjectByName("FX_Exhaust_L")!;
    const engine = add_engine(rig, { side: "left", vectoring: { pitch: 6 } });

    expect(engine.vectoring.gimbal).toBe("virtual");
    expect(engine.anchor?.parent?.parent?.parent).toBe(exhaust);

    // A point a metre aft of the exhaust, held on the anchor
    const mount = engine.anchor!;
    const centre = exhaust.getWorldPosition(new Vector3());

    mount.updateWorldMatrix(true, false);

    const aft = mount.worldToLocal(centre.clone().add(new Vector3(0, 0, 1)));

    run(rig, 1);
    mount.updateWorldMatrix(true, false);

    expect(engine.pitch_deg).toBeCloseTo(6);

    // Swung up by the gimbal, the exhaust up for a nose up
    const swung = mount.localToWorld(aft.clone()).sub(centre);

    expect((Math.atan2(swung.y, swung.z) * 180) / Math.PI).toBeCloseTo(6, 3);

    engine.dispose();

    expect(exhaust.children).not.toContain(engine.anchor?.parent?.parent);
    expect(rig.surface("FX_Exhaust_L_Gimbal_Pitch")).toBeUndefined();
  });
});
