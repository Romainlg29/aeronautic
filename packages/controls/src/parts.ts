import type { FlightValues } from "@aeronautic/core";
import { deflect, roll_sense, throttle_lever, travel } from "./mix";
import type { ControlDrive, ControlRig, DriveSelect } from "./rig";
import type { ControlSurface, SurfaceKind, SurfaceSide } from "./surfaces";

// The parts of an aircraft, each a drive of its own
//
// Each takes the parts of its kind and drives them from the flight the way a
// fighter's do. Each is a small thing to add or leave out, to give a
// different `from`, or to point at other parts with `parts` or `group`. A
// `from` answers in the part's own terms: a share of its throw either side of
// zero for the parts that deflect, a share of its travel for those that open
// or extend, degrees for the leading-edge flaps. The options are read as they
// are whenever the flight changes, so a function in them may be swapped in
// place

/**
 * Where a part should be for a flight, in the terms of the part it drives.
 * null leaves it where it was going.
 */
export type PartFrom = (
  values: Readonly<FlightValues>,
  part: ControlSurface,
) => number | null;

/**
 * How a part is driven. With neither `parts` nor `group`, it takes every part
 * of its kind.
 */
export type PartOptions = Omit<DriveSelect, "kinds"> & {
  /** Where each part should be, in the terms the part says */
  from?: PartFrom;

  /** In the part's unit a second, over the rig's rate for its kind */
  rate?: number;

  /** Called in the frame a part moves, with its value in its unit */
  onMove?: (value: number, part: ControlSurface) => void;
};

/**
 * Drive parts of some kinds, mapping a command in the part's terms to its
 * value.
 * @param rig The rig
 * @param kinds The kinds it takes when not told which parts
 * @param options How it is driven, read as it is
 * @param fallback The command when `from` is not given
 * @param map From the command to the part's value
 * @returns The drive
 */
const install = (
  rig: ControlRig,
  kinds: readonly SurfaceKind[],
  options: PartOptions,
  fallback: PartFrom,
  map: (part: ControlSurface, command: number) => number,
): ControlDrive =>
  rig.drive({
    parts: options.parts,
    group: options.group,
    kinds: options.parts || options.group !== undefined ? undefined : kinds,
    side: options.side,
    filter: options.filter,
    from: (values, part) => {
      const command = (options.from ?? fallback)(values, part);

      return command === null ? null : map(part, command);
    },
    get rate() {
      return options.rate;
    },
    get onMove() {
      return options.onMove;
    },
  });

/**
 * Several drives as one.
 * @param drives The drives
 * @returns One that refreshes and disposes of them all
 */
export const combine_drives = (
  drives: readonly ControlDrive[],
): ControlDrive => ({
  get parts() {
    return drives.flatMap((drive) => drive.parts);
  },
  refresh: () => {
    for (const drive of drives) drive.refresh();
  },
  dispose: () => {
    for (const drive of drives) drive.dispose();
  },
});

/**
 * Ailerons, with the stick's roll. `from` gives a share of throw, positive
 * trailing edge down.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const ailerons = (rig: ControlRig, options: PartOptions = {}) =>
  install(
    rig,
    ["aileron"],
    options,
    (values, part) => values.roll * roll_sense(part),
    deflect,
  );

/**
 * Elevators, with the stick's pitch: aft, trailing edges up. `from` gives a
 * share of throw, positive trailing edge down.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const elevators = (rig: ControlRig, options: PartOptions = {}) =>
  install(rig, ["elevator"], options, (values) => -values.pitch, deflect);

/**
 * How a pitch and roll surface shares its throw.
 */
export type TailOptions = PartOptions & {
  /** How much of its throw is pitch; the rest is roll. 0.6 by default */
  pitchShare?: number;
};

/**
 * A surface that pitches and rolls, as an elevon or a stabilator.
 * @param rig The rig
 * @param kind Its kind
 * @param options How it is driven
 * @returns The drive
 */
const pitch_and_roll = (
  rig: ControlRig,
  kind: SurfaceKind,
  options: TailOptions,
) =>
  install(
    rig,
    [kind],
    options,
    (values, part) => {
      const share = options.pitchShare ?? 0.6;

      return (
        -values.pitch * share + values.roll * roll_sense(part) * (1 - share)
      );
    },
    deflect,
  );

/**
 * Elevons, pitching and rolling together. `from` gives a share of throw,
 * positive trailing edge down.
 * @param rig The rig
 * @param options How they are driven, and how much of their throw is pitch
 * @returns The drive
 */
export const elevons = (rig: ControlRig, options: TailOptions = {}) =>
  pitch_and_roll(rig, "elevon", options);

/**
 * All-moving tailplanes, pitching and rolling together. `from` gives a share
 * of throw, positive trailing edge down.
 * @param rig The rig
 * @param options How they are driven, and how much of their throw is pitch
 * @returns The drive
 */
export const stabilators = (rig: ControlRig, options: TailOptions = {}) =>
  pitch_and_roll(rig, "stabilator", options);

/**
 * Canards, with the stick's pitch: aft, trailing edges down. `from` gives a
 * share of throw, positive trailing edge down.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const canards = (rig: ControlRig, options: PartOptions = {}) =>
  install(rig, ["canard"], options, (values) => values.pitch, deflect);

/**
 * Rudders, with the pedals. `from` gives a share of throw, positive trailing
 * edge right.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const rudders = (rig: ControlRig, options: PartOptions = {}) =>
  install(rig, ["rudder"], options, (values) => values.yaw, deflect);

/**
 * Trailing-edge flaps, with the flap lever. `from` gives a share of travel.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const flaps = (rig: ControlRig, options: PartOptions = {}) =>
  install(rig, ["flap"], options, (values) => values.flaps, travel);

/**
 * How the leading-edge flaps follow the angle of attack.
 */
export type LeadingEdgeFlapOptions = PartOptions & {
  /** Where they start to droop, in degrees of angle of attack. 2 by default */
  startDeg?: number;

  /** Degrees down per degree of angle of attack past it. 1.4 by default */
  perDeg?: number;
};

/**
 * Leading-edge flaps, drooping with the angle of attack and with the flaps.
 * `from` gives degrees, positive leading edge down.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const leading_edge_flaps = (
  rig: ControlRig,
  options: LeadingEdgeFlapOptions = {},
) =>
  install(
    rig,
    ["le_flap"],
    options,
    (values, part) => {
      const alpha = (values.angleOfAttackRad * 180) / Math.PI;
      const scheduled =
        Math.max(alpha - (options.startDeg ?? 2), 0) * (options.perDeg ?? 1.4);

      return scheduled + values.flaps * Math.max(part.max, 0);
    },
    (_, degrees) => degrees,
  );

/**
 * Air brakes, with the speed brake switch. `from` gives a share of travel.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const airbrakes = (rig: ControlRig, options: PartOptions = {}) =>
  install(rig, ["airbrake"], options, (values) => values.airbrake, travel);

/**
 * Spoilers, raised with the air brake. `from` gives a share of travel.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const spoilers = (rig: ControlRig, options: PartOptions = {}) =>
  install(rig, ["spoiler"], options, (values) => values.airbrake, travel);

/**
 * Split drag rudders: open together as a brake, and the one on the side the
 * nose should go to opens alone to yaw it. `from` gives a share of travel.
 * @param rig The rig
 * @param options How they are driven
 * @returns The drive
 */
export const drag_rudders = (rig: ControlRig, options: PartOptions = {}) =>
  install(
    rig,
    ["drag_rudder"],
    options,
    (values, part) => {
      const toward =
        part.side === "right"
          ? values.yaw
          : part.side === "left"
            ? -values.yaw
            : 0;

      return Math.min(values.airbrake + Math.max(toward, 0), 1);
    },
    travel,
  );

/**
 * How the landing gear is driven.
 */
export type GearOptions = {
  /** Only the gear on this side */
  side?: SurfaceSide;

  /** How far down it should be, 0 up to 1 down. The flight's `gear` by default */
  from?: (values: Readonly<FlightValues>) => number;

  /** In the parts' unit a second, over the rig's rates */
  rate?: number;

  /** Called in the frame a part moves */
  onMove?: (value: number, part: ControlSurface) => void;

  /**
   * The model's retraction clip, scrubbed rather than the legs driven one by
   * one. By default a clip named for the gear and `retract`, `stow` or `up`.
   * false drives the parts
   */
  clip?: string | RegExp | false;
};

const RETRACTS = /retract|stow|up/;
const GEAR_CLIP = /gear.*(retract|stow|up)|(retract|stow|up).*gear/i;

/**
 * The landing gear: legs, doors and the lever, or the model's retraction
 * clip with the parts it moves.
 * @param rig The rig
 * @param options How it is driven
 * @returns The drive
 */
export const gear = (rig: ControlRig, options: GearOptions = {}) => {
  const down = (values: Readonly<FlightValues>) =>
    Math.min(Math.max(options.from ? options.from(values) : values.gear, 0), 1);

  const shared = {
    side: options.side,
    get rate() {
      return options.rate;
    },
    get onMove() {
      return options.onMove;
    },
  };

  const drives = [
    rig.drive({
      ...shared,
      kinds: ["gear"],
      from: (values, part) =>
        RETRACTS.test(part.positive) ? travel(part, 1 - down(values)) : null,
    }),
    // Open down to the pose they were authored in, shut once it is up
    rig.drive({
      ...shared,
      kinds: ["gear_door"],
      from: (values, part) => down(values) * part.rest,
    }),
    rig.drive({
      ...shared,
      kinds: ["gear_lever"],
      from: (values, part) =>
        travel(
          part,
          RETRACTS.test(part.positive) ? 1 - down(values) : down(values),
        ),
    }),
  ];

  if (options.clip !== false) {
    drives.push(
      rig.driveClip({
        clip: options.clip ?? GEAR_CLIP,
        side: options.side,
        from: (values) => 1 - down(values),
      }),
    );
  }

  return combine_drives(drives);
};

/**
 * How the cockpit is driven.
 */
export type CockpitOptions = PartOptions & {
  /** The throttle the lever shows. The flight's by default */
  throttle?: (values: Readonly<FlightValues>) => number;
};

/**
 * The cockpit: the stick, the pedals and the throttle lever past its reheat
 * detent, at its `ab_detent` extra or 0.85. `from` gives a share of throw for
 * the stick and the pedals, a share of travel for the lever.
 * @param rig The rig
 * @param options How it is driven
 * @returns The drive
 */
export const cockpit = (rig: ControlRig, options: CockpitOptions = {}) =>
  install(
    rig,
    ["stick_pitch", "stick_roll", "pedal", "throttle_lever"],
    options,
    (values, part) => {
      switch (part.kind) {
        case "stick_pitch":
          return values.pitch;
        case "stick_roll":
          return values.roll;
        case "pedal":
          // Right pedal forward for a yaw right
          return part.side === "left" ? -values.yaw : values.yaw;
        case "throttle_lever": {
          const detent =
            typeof part.extras.ab_detent === "number"
              ? part.extras.ab_detent
              : 0.85;

          return throttle_lever(
            options.throttle ? options.throttle(values) : values.throttle,
            detent,
          );
        }
        default:
          return null;
      }
    },
    (part, command) =>
      part.kind === "throttle_lever"
        ? travel(part, command)
        : deflect(part, command),
  );
