import type { FlightValues } from "@aeronautic/core";
import type { ControlSurface } from "./surfaces";

// From the pilot's controls to where every part should be
//
// A plain function of the flight, so it is the same in a test as in a frame.
// The stick and the pedals are shares of full throw; each part takes its
// share of them in its own positive sense, so a left elevon goes trailing
// edge down for a roll right and its right twin up

/**
 * How the controls are shared out.
 */
export type ControlMixing = {
  /** How much of an elevon's or a stabilator's throw is pitch; the rest is roll */
  elevonPitch: number;

  /** Leading-edge flaps: degrees down per degree of angle of attack past `leFlapStartDeg` */
  leFlapPerAlpha: number;
  leFlapStartDeg: number;

  /** Thrust vectoring, from the stick and the pedals. On by default */
  thrustVectoring: boolean;

  /**
   * How open the nozzle petals are, 0 to 1, at idle, at military power and
   * at full reheat: open at idle, closed down at military, wide in reheat
   */
  nozzleIdle: number;
  nozzleMilitary: number;
  nozzleReheat: number;
};

/**
 * How open a nozzle's petals are, 0 to 1, at idle, at military power and at
 * full reheat.
 */
export type NozzleSchedule = Pick<
  ControlMixing,
  "nozzleIdle" | "nozzleMilitary" | "nozzleReheat"
>;

/**
 * The mixing a fighter flies with.
 * @returns The defaults
 */
export const default_control_mixing = (): ControlMixing => ({
  elevonPitch: 0.6,
  leFlapPerAlpha: 1.4,
  leFlapStartDeg: 2,
  thrustVectoring: true,
  nozzleIdle: 0.45,
  nozzleMilitary: 0,
  nozzleReheat: 1,
});

const RAD = 180 / Math.PI;

// Where the throttle's dry range ends and its reheat range does
const MILITARY = 1;
const FULL_REHEAT = 1.1;

// For the parts driven about zero, a rig that calls the other way positive:
// its values are turned round so it still moves the right way
const OPPOSITE: Partial<Record<ControlSurface["kind"], RegExp>> = {
  aileron: /trailing_edge_up/,
  elevator: /trailing_edge_up/,
  elevon: /trailing_edge_up/,
  stabilator: /trailing_edge_up/,
  canard: /trailing_edge_up/,
  rudder: /trailing_edge_left/,
  nozzle_pitch: /exit_up/,
  nozzle_yaw: /exit_left/,
  stick_pitch: /forward|nose_down/,
  stick_roll: /left/,
};

/**
 * Which way a part's values run against its kind's: -1 for a rig that calls
 * the other way positive, as `trailing_edge_up` on an elevon.
 * @param surface The part
 * @returns 1 or -1
 */
export const sense_of = (surface: ControlSurface): number =>
  OPPOSITE[surface.kind]?.test(surface.positive) ? -1 : 1;

/**
 * A part's value for a share of its throw either side of zero, in its kind's
 * positive sense: trailing edge down, trailing edge right, exhaust down or
 * right.
 * @param surface The part
 * @param share -1 to 1
 * @returns The value: the share of `max` one way, of `-min` the other
 */
export const deflect = (surface: ControlSurface, share: number): number => {
  const wanted = Math.max(-1, Math.min(1, share)) * sense_of(surface);

  return wanted >= 0
    ? wanted * Math.max(surface.max, 0)
    : -wanted * Math.min(surface.min, 0);
};

/**
 * A part's value for a share of its travel from its least to its most.
 * @param surface The part
 * @param share 0 to 1
 * @returns The value
 */
export const travel = (surface: ControlSurface, share: number): number =>
  surface.min + (surface.max - surface.min) * Math.min(Math.max(share, 0), 1);

/**
 * Which way a roll right moves a part: 1 on the left wing, whose trailing
 * edges go down to lift it, -1 on the right, 0 on the centre line.
 * @param surface The part
 * @returns 1, -1 or 0
 */
export const roll_sense = (surface: ControlSurface): number =>
  surface.side === "left" ? 1 : surface.side === "right" ? -1 : 0;

const throw_of = deflect;
const travel_of = travel;

/**
 * How open a nozzle is at a throttle.
 * @param throttle 0 to 1.1
 * @param mixing The schedule
 * @returns 0 to 1
 */
export const nozzle_opening = (
  throttle: number,
  mixing: NozzleSchedule,
): number => {
  if (throttle <= MILITARY) {
    const t = Math.max(throttle, 0) / MILITARY;

    return mixing.nozzleIdle + (mixing.nozzleMilitary - mixing.nozzleIdle) * t;
  }

  const t = Math.min((throttle - MILITARY) / (FULL_REHEAT - MILITARY), 1);

  return (
    mixing.nozzleMilitary + (mixing.nozzleReheat - mixing.nozzleMilitary) * t
  );
};

/**
 * Where the throttle lever sits for a throttle, past its reheat detent above
 * military power.
 * @param throttle 0 to 1.1
 * @param detent The lever's share of travel at military power
 * @returns 0 to 1
 */
export const throttle_lever = (throttle: number, detent: number): number =>
  throttle <= MILITARY
    ? Math.max(throttle, 0) * detent
    : detent +
      Math.min((throttle - MILITARY) / (FULL_REHEAT - MILITARY), 1) *
        (1 - detent);

/**
 * Where a part should be, for a flight.
 * @param surface The part
 * @param flight The flight's values
 * @param mixing How the controls are shared out
 * @returns The value, in the part's unit, or null when the flight doesn't
 *   drive it
 */
export const mix_surface = (
  surface: ControlSurface,
  flight: Readonly<FlightValues>,
  mixing: ControlMixing,
): number | null => {
  const { pitch, roll, yaw } = flight;

  // +1 for a part whose positive goes with a roll right: the left wing's
  // trailing edges go down to lift it
  const rolls = roll_sense(surface);

  switch (surface.kind) {
    case "aileron":
      return throw_of(surface, roll * rolls);

    case "elevator":
      return throw_of(surface, -pitch);

    case "elevon":
    case "stabilator": {
      const share = mixing.elevonPitch;
      const mixed = -pitch * share + roll * rolls * (1 - share);

      return throw_of(surface, Math.max(-1, Math.min(1, mixed)));
    }

    case "canard":
      return throw_of(surface, pitch);

    case "rudder":
      return throw_of(surface, yaw);

    case "flap":
      return travel_of(surface, flight.flaps);

    case "le_flap": {
      const alpha = flight.angleOfAttackRad * RAD;
      const scheduled =
        Math.max(alpha - mixing.leFlapStartDeg, 0) * mixing.leFlapPerAlpha;
      const value = scheduled + flight.flaps * Math.max(surface.max, 0);

      return Math.min(Math.max(value, surface.min), surface.max);
    }

    case "airbrake":
    case "spoiler":
      return travel_of(surface, flight.airbrake);

    case "drag_rudder": {
      // Split open together as a brake, and the side the nose should go to
      // opens alone to yaw it
      const toward =
        surface.side === "right" ? yaw : surface.side === "left" ? -yaw : 0;

      return travel_of(
        surface,
        Math.min(flight.airbrake + Math.max(toward, 0), 1),
      );
    }

    case "nozzle_pitch":
      // Nose up wants the exhaust up, pushing the tail down
      return mixing.thrustVectoring ? -throw_of(surface, pitch) : 0;

    case "nozzle_yaw":
      // Nose right wants the exhaust right, pushing the tail left
      return mixing.thrustVectoring ? throw_of(surface, yaw) : 0;

    case "nozzle_petal":
      return travel_of(surface, nozzle_opening(flight.throttle, mixing));

    case "gear":
    case "gear_door":
    case "gear_lever": {
      if (surface.kind === "gear_door") {
        // Open down to the rest pose it was authored in, shut once up
        return flight.gear * surface.rest;
      }

      if (/retract|stow|up/.test(surface.positive)) {
        return travel_of(surface, 1 - flight.gear);
      }

      return null;
    }

    case "stick_pitch":
      return throw_of(surface, pitch);

    case "stick_roll":
      return throw_of(surface, roll);

    case "pedal":
      // Right pedal forward for a yaw right
      return throw_of(surface, surface.side === "left" ? -yaw : yaw);

    case "throttle_lever": {
      const detent =
        typeof surface.extras.ab_detent === "number"
          ? surface.extras.ab_detent
          : 0.85;

      return travel_of(surface, throttle_lever(flight.throttle, detent));
    }

    default:
      return null;
  }
};
