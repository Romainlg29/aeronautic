import { Flight, type FlightInput } from "@aeronautic/core";
import { Object3D, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  default_control_mixing,
  mix_surface,
  nozzle_opening,
  throttle_lever,
} from "./mix";
import type { ControlSurface, SurfaceKind, SurfaceSide } from "./surfaces";

const mixing = default_control_mixing();

/**
 * A part, as a rig would give it.
 * @param kind What it is
 * @param side Where
 * @param extra Anything else
 * @returns The part
 */
const part = (
  kind: SurfaceKind,
  side: SurfaceSide = "centre",
  extra: Partial<ControlSurface> = {},
): ControlSurface => ({
  name: kind,
  kind,
  node: new Object3D(),
  motion: "rotation",
  unit: "deg",
  scale: Math.PI / 180,
  min: -30,
  max: 30,
  rest: 0,
  side,
  group: kind,
  positive: "",
  found_by: "rig",
  extras: {},
  base_position: new Vector3(),
  base_quaternion: new Quaternion(),
  ...extra,
});

/**
 * Mix one part for a flight.
 * @param surface The part
 * @param input What the flight is
 * @returns Its value
 */
const mix = (surface: ControlSurface, input: Partial<FlightInput>) =>
  mix_surface(surface, new Flight(input).values, mixing);

describe("mix_surface", () => {
  it("takes both elevons trailing edge up for a pull", () => {
    expect(mix(part("elevon", "left"), { pitch: 1 })).toBeLessThan(0);
    expect(mix(part("elevon", "right"), { pitch: 1 })).toBeLessThan(0);
  });

  it("takes the left elevon down and the right up for a roll right", () => {
    expect(mix(part("elevon", "left"), { roll: 1 })).toBeGreaterThan(0);
    expect(mix(part("elevon", "right"), { roll: 1 })).toBeLessThan(0);
    expect(mix(part("aileron", "left"), { roll: 1 })).toBe(30);
    expect(mix(part("aileron", "right"), { roll: 1 })).toBe(-30);
  });

  it("never mixes an elevon past its limits", () => {
    const left = part("elevon", "left");

    expect(mix(left, { pitch: -1, roll: 1 })).toBe(30);
  });

  it("takes the rudder trailing edge right for a yaw right", () => {
    expect(mix(part("rudder"), { yaw: 0.5 })).toBe(15);
  });

  it("vectors the exhaust up for a pull and right for a yaw right", () => {
    const pitch = part("nozzle_pitch", "left", { min: -4, max: 4 });
    const yaw = part("nozzle_yaw", "left", { min: -9.5, max: 9.5 });

    expect(mix(pitch, { pitch: 1 })).toBe(-4);
    expect(mix(yaw, { yaw: 1 })).toBe(9.5);
  });

  it("turns a part round whose rig calls the other way positive", () => {
    const upward = part("elevon", "left", { positive: "trailing_edge_up" });

    expect(mix(upward, { pitch: 1 })).toBeGreaterThan(0);
  });

  it("schedules the leading-edge flaps on the angle of attack", () => {
    const flap = part("le_flap", "left", { min: -3, max: 25 });

    expect(mix(flap, { angle_of_attack_rad: 0 })).toBe(0);
    expect(
      mix(flap, { angle_of_attack_rad: (12 * Math.PI) / 180 }),
    ).toBeCloseTo(14);
    expect(mix(flap, { angle_of_attack_rad: 1 })).toBe(25);
  });

  it("opens the drag rudders together to brake, and one side to yaw", () => {
    const left = part("drag_rudder", "left", { min: 0, max: 50 });
    const right = part("drag_rudder", "right", { min: 0, max: 50 });

    expect(mix(left, { airbrake: 1 })).toBe(50);
    expect(mix(right, { airbrake: 1 })).toBe(50);
    expect(mix(left, { yaw: 1 })).toBe(0);
    expect(mix(right, { yaw: 1 })).toBe(50);
  });

  it("moves the cockpit with the controls", () => {
    expect(
      mix(part("stick_pitch", "centre", { min: -15, max: 15 }), { pitch: 1 }),
    ).toBe(15);
    expect(
      mix(part("pedal", "left", { min: -0.08, max: 0.08 }), { yaw: 1 }),
    ).toBe(-0.08);
    expect(
      mix(part("pedal", "right", { min: -0.08, max: 0.08 }), { yaw: 1 }),
    ).toBe(0.08);

    const lever = part("throttle_lever", "centre", {
      min: 0,
      max: 1,
      extras: { ab_detent: 0.85 },
    });

    expect(mix(lever, { throttle: 1 })).toBeCloseTo(0.85);
    expect(mix(lever, { throttle: 1.1 })).toBeCloseTo(1);
  });

  it("retracts the gear with the gear up, and leaves the oleos be", () => {
    const fold = part("gear", "left", { min: 0, max: 98, positive: "retract" });
    const oleo = part("gear", "left", {
      min: -0.35,
      max: 0,
      positive: "extend",
    });

    expect(mix(fold, { gear: 0 })).toBe(98);
    expect(mix(fold, { gear: 1 })).toBe(0);
    expect(mix(oleo, { gear: 0 })).toBe(null);
  });

  it("leaves the rest of the cockpit to the hands", () => {
    expect(mix(part("other"), { pitch: 1 })).toBe(null);
  });
});

describe("the schedules", () => {
  it("opens the nozzle at idle, closes it at military and opens it wide in reheat", () => {
    expect(nozzle_opening(0, mixing)).toBeCloseTo(0.45);
    expect(nozzle_opening(1, mixing)).toBeCloseTo(0);
    expect(nozzle_opening(1.1, mixing)).toBeCloseTo(1);
  });

  it("puts the throttle lever past its detent only in reheat", () => {
    expect(throttle_lever(0.5, 0.8)).toBeCloseTo(0.4);
    expect(throttle_lever(1.05, 0.8)).toBeCloseTo(0.9);
  });
});
