import {
  add_engine,
  type Engine,
  type EngineOptions,
  engine_sides,
} from "./engine";
import {
  ailerons,
  airbrakes,
  canards,
  cockpit,
  combine_drives,
  drag_rudders,
  elevators,
  elevons,
  flaps,
  gear,
  leading_edge_flaps,
  rudders,
  spoilers,
  stabilators,
} from "./parts";
import type { ControlDrive, ControlRig } from "./rig";

// Every part of a fighter, driven the way a fighter's are: each of the parts,
// and an engine for each side with a nozzle

/**
 * How a fighter's parts are driven.
 */
export type FighterControlsOptions = {
  /** How much of an elevon's or a stabilator's throw is pitch. 0.6 by default */
  pitch_share?: number;

  /** How each engine is driven, as its throttle or its vectoring */
  engine?: Omit<EngineOptions, "side" | "anchor">;
};

/**
 * A fighter's parts, all driven.
 */
export type FighterControls = ControlDrive & {
  /** An engine for each side with a nozzle */
  readonly engines: readonly Engine[];
};

/**
 * Drive every part of a fighter from the flight.
 * @param rig The rig
 * @param options How
 * @returns The drives, and the engines
 */
export const fighter_controls = (
  rig: ControlRig,
  options: FighterControlsOptions = {},
): FighterControls => {
  const tail = {
    get pitch_share() {
      return options.pitch_share;
    },
  };

  const engines = engine_sides(rig).map((side) =>
    add_engine(rig, { ...options.engine, side }),
  );

  const drives = combine_drives([
    ailerons(rig),
    elevators(rig),
    elevons(rig, tail),
    stabilators(rig, tail),
    canards(rig),
    rudders(rig),
    flaps(rig),
    leading_edge_flaps(rig),
    airbrakes(rig),
    spoilers(rig),
    drag_rudders(rig),
    gear(rig),
    cockpit(rig),
    {
      parts: engines.flatMap((engine) => [
        ...engine.parts.pitch,
        ...engine.parts.yaw,
        ...engine.parts.petals,
      ]),
      refresh: () => {
        for (const engine of engines) engine.refresh();
      },
      dispose: () => {
        for (const engine of engines) engine.dispose();
      },
    },
  ]);

  return {
    engines,
    get parts() {
      return drives.parts;
    },
    refresh: drives.refresh,
    dispose: drives.dispose,
  };
};
