import { Box3, Group, type Object3D, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { load_fighter } from "./fighter.fixture";
import {
  type ControlSurface,
  find_surfaces,
  name_side,
  pose_surface,
  surface_kind,
} from "./surfaces";

const DEG = Math.PI / 180;

/**
 * Where a part's geometry sits, in world space.
 * @param surface The part
 * @param value Posed at this
 * @returns The centre of its bounds
 */
const centre_at = (surface: ControlSurface, value: number): Vector3 => {
  pose_surface(surface, value);
  surface.node.updateWorldMatrix(true, true);

  const centre = new Box3()
    .setFromObject(surface.node)
    .getCenter(new Vector3());

  pose_surface(surface, surface.rest);
  surface.node.updateWorldMatrix(true, true);

  return centre;
};

/**
 * A part's hinge, in world space.
 * @param surface The part
 * @returns Its local X, in the world
 */
const hinge_axis = (surface: ControlSurface): Vector3 => {
  surface.node.updateWorldMatrix(true, false);

  return new Vector3(1, 0, 0).transformDirection(surface.node.matrixWorld);
};

/**
 * One panel of the fighter, taken off its rig and put in a model of its own
 * under a plain name, where it sat in the world.
 * @param scene The fighter
 * @param rigged The `CTRL_` node it hangs from
 * @param name What to call it
 * @returns The new model
 */
const unrigged = (scene: Object3D, rigged: string, name: string): Group => {
  scene.updateWorldMatrix(true, true);

  const panel = scene.getObjectByName(rigged)!.children[0].clone();

  panel.applyMatrix4(scene.getObjectByName(rigged)!.matrixWorld);
  panel.name = name;

  const root = new Group();
  const wing = new Group();

  wing.name = "Wing";
  wing.add(panel);
  root.add(wing);

  return root;
};

describe("surface_kind", () => {
  it("tells the specific from the general", () => {
    expect(surface_kind("Elevon_Outer_L")).toBe("elevon");
    expect(surface_kind("CTRL_DragRudder_Upper_L drag_rudders")).toBe(
      "drag_rudder",
    );
    expect(surface_kind("rudder.001")).toBe("rudder");
    expect(surface_kind("LEFlap_Inner_R")).toBe("le_flap");
    expect(surface_kind("Flap_L")).toBe("flap");
    expect(surface_kind("SpeedBrake")).toBe("airbrake");
    expect(surface_kind("CTRL_Gear_Nose_C_Steer gear")).toBe("other");
    expect(surface_kind("CTRL_Btn_Throttle_01 throttle_grip")).toBe("other");
    expect(surface_kind("CTRL_Throttle_C throttle")).toBe("throttle_lever");
    expect(surface_kind("Fuselage")).toBe("other");
  });
});

describe("name_side", () => {
  it("reads the side from a name's separated letter or word", () => {
    expect(name_side("CTRL_Elevon_Outer_L")).toBe("left");
    expect(name_side("aileron.right")).toBe("right");
    expect(name_side("CTRL_Gear_Nose_C_Fold")).toBe("centre");
    expect(name_side("Rudder")).toBe(null);
    expect(name_side("CTRL_Canopy")).toBe(null);
  });
});

describe("find_surfaces on a rigged model", () => {
  let scene: Object3D;
  let surfaces: ControlSurface[];

  const named = (name: string) =>
    surfaces.find((surface) => surface.name === name)!;

  beforeAll(async () => {
    scene = (await load_fighter()).scene;
    surfaces = find_surfaces(scene);
  });

  it("finds the rig's parts, and nothing by name", () => {
    const count = (kind: string) =>
      surfaces.filter((surface) => surface.kind === kind).length;

    expect(count("elevon")).toBe(4);
    expect(count("rudder")).toBe(2);
    expect(count("le_flap")).toBe(4);
    expect(count("airbrake")).toBe(2);
    expect(count("drag_rudder")).toBe(4);
    expect(count("nozzle_pitch")).toBe(2);
    expect(count("nozzle_yaw")).toBe(2);
    expect(count("nozzle_petal")).toBe(56);
    expect(count("throttle_lever")).toBe(1);

    expect(surfaces.every((surface) => surface.foundBy === "rig")).toBe(true);
  });

  it("reads each part's side, limits and extras", () => {
    const elevon = named("CTRL_Elevon_Outer_L");

    expect(elevon.side).toBe("left");
    expect(elevon.min).toBe(-30);
    expect(elevon.max).toBe(30);
    expect(elevon.positive).toBe("trailing_edge_down");

    expect(named("CTRL_Elevon_Inner_R").side).toBe("right");
    expect(named("CTRL_Throttle_C").extras.ab_detent).toBe(0.85);
    expect(named("CTRL_Throttle_C").scale).toBeCloseTo(40 * DEG);
  });

  it("poses every part at its rest", () => {
    const door = named("CTRL_Door_MainGear_L");

    expect(door.rest).toBe(102);
    expect(door.node.quaternion.angleTo(door.baseQuaternion)).toBeCloseTo(
      102 * DEG,
      4,
    );
  });

  it("moves a positive elevon trailing edge down, and a rudder trailing edge right", () => {
    for (const name of ["CTRL_Elevon_Outer_L", "CTRL_Elevon_Inner_R"]) {
      const surface = named(name);

      expect(centre_at(surface, 10).y).toBeLessThan(centre_at(surface, 0).y);
    }

    for (const name of ["CTRL_Rudder_L", "CTRL_Rudder_R"]) {
      const surface = named(name);

      // Right is +X in the fighter's world: it flies along -Z
      expect(centre_at(surface, 10).x).toBeGreaterThan(centre_at(surface, 0).x);
    }
  });

  it("slides a translation along its local X", () => {
    const oleo = named("CTRL_Gear_Main_L_Oleo");
    const start = oleo.node.position.clone();

    pose_surface(oleo, -0.2);

    const moved = oleo.node.position.clone().sub(start);

    expect(moved.length()).toBeCloseTo(0.2, 5);

    pose_surface(oleo, 0);
  });
});

describe("find_surfaces on a model with only names", () => {
  let scene: Object3D;

  beforeAll(async () => {
    scene = (await load_fighter()).scene;
  });

  it("fits an elevon's hinge to its geometry", () => {
    const root = unrigged(scene, "CTRL_Elevon_Outer_L", "Elevon_Outer_L");
    const [elevon] = find_surfaces(root);

    expect(elevon.kind).toBe("elevon");
    expect(elevon.foundBy).toBe("name");
    expect(elevon.side).toBe("left");

    // The rig's own hinge, up to its sense
    const rigged = new Vector3(0.85, 0.05, -0.52).normalize();

    expect(Math.abs(hinge_axis(elevon).dot(rigged))).toBeGreaterThan(0.98);

    // And turned so positive is trailing edge down
    expect(centre_at(elevon, 10).y).toBeLessThan(centre_at(elevon, 0).y);
  });

  it("puts the pivot in without moving the panel", () => {
    const root = unrigged(scene, "CTRL_Elevon_Outer_R", "Elevon_Outer_R");
    const panel = root.getObjectByName("Elevon_Outer_R")!;

    root.updateWorldMatrix(true, true);

    const before = new Box3().setFromObject(panel).getCenter(new Vector3());

    const [elevon] = find_surfaces(root);

    root.updateWorldMatrix(true, true);

    const after = new Box3().setFromObject(panel).getCenter(new Vector3());

    expect(after.distanceTo(before)).toBeLessThan(1e-4);
    expect(panel.parent).toBe(elevon.node);
    expect(elevon.node.parent!.name).toBe("Wing");
  });

  it("fits a rudder's hinge, and turns it trailing edge right", () => {
    const root = unrigged(scene, "CTRL_Rudder_L", "Rudder_L");
    const [rudder] = find_surfaces(root);

    expect(rudder.kind).toBe("rudder");

    const rigged = new Vector3(-0.59, 0.69, 0.42).normalize();

    expect(Math.abs(hinge_axis(rudder).dot(rigged))).toBeGreaterThan(0.97);
    expect(centre_at(rudder, 10).x).toBeGreaterThan(centre_at(rudder, 0).x);
  });

  it("fits a leading-edge flap along its aft edge, and turns it leading edge down", () => {
    const root = unrigged(scene, "CTRL_LEFlap_Outer_L", "LEFlap_Outer_L");
    const [flap] = find_surfaces(root);

    expect(flap.kind).toBe("le_flap");

    const rigged = new Vector3(-0.61, -0.03, 0.79).normalize();

    expect(Math.abs(hinge_axis(flap).dot(rigged))).toBeGreaterThan(0.97);
    expect(centre_at(flap, 10).y).toBeLessThan(centre_at(flap, 0).y);
  });

  it("leaves names alone when told to", () => {
    const root = unrigged(scene, "CTRL_Elevon_Outer_L", "Elevon_Outer_L");

    expect(find_surfaces(root, { names: false })).toHaveLength(0);
  });
});
