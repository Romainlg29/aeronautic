import { check_renderer, type Flight } from "@aeronautic/core";
import { useFlightStore, useShallowStable } from "@aeronautic/core/react";
import { createPortal, useThree, type ThreeElements } from "@react-three/fiber";
import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type Ref,
} from "react";
import type { Group, Object3D } from "three";
import { Countermeasures as Core } from "../countermeasures-core";
import type { Chaff, ChaffName } from "../chaff";
import type { Flare, FlareName } from "../flare";
import type { Program } from "../program";
import type {
  CountermeasuresAir,
  CountermeasuresAirframe,
  CountermeasuresFlight,
  CountermeasuresLook,
  CountermeasuresQuality,
  CountermeasuresQualityName,
} from "../types";

// The friendly API
//
// `<Countermeasures>` is a group where the aircraft's reference point sits,
// its dispensers placed from it or on its model's nodes: put it inside the
// aircraft's model, or on one of its nodes with `target`. Fire it from its
// ref, or by changing `fire`

/**
 * What a `<Countermeasures>`'s ref holds: the countermeasures themselves,
 * to fire and drive every frame.
 */
export type CountermeasuresHandle = Core;

/**
 * Props for `<Countermeasures>`: every `<group>` prop, and these.
 */
export type CountermeasuresProps = Omit<ThreeElements["group"], "ref"> & {
  /**
   * Where the dispensers are: positions in the group's frame, or the model's
   * nodes. Compared array by array, so keep them in a memo or a constant
   */
  airframe?: Partial<CountermeasuresAirframe>;

  /** The flare: a make's name, or the fields over the MJU-7's */
  flare?: FlareName | Partial<Flare>;

  /** The chaff: a payload's name, or the fields over the RR-178's */
  chaff?: ChaffName | Partial<Chaff>;

  /**
   * What firing lets go: the burst, the salvo, their intervals, and flares
   * or chaff
   */
  program?: Partial<Program>;

  /** How the aircraft moves through the air */
  flight?: Partial<CountermeasuresFlight>;

  /** The altitude and the day's visibility */
  air?: Partial<CountermeasuresAir>;

  /** The exposure, and the eye the glare is for */
  look?: Partial<CountermeasuresLook>;

  /**
   * Fires the program each time it changes: a counter to bump, say. Its
   * first value fires nothing
   */
  fire?: number;

  /**
   * Sit on this object rather than where the component is in the tree: a
   * node of a loaded model, say. `position` is then in its frame
   */
  target?: Object3D | null;

  /** Which way the aircraft flies, in the group's frame. By default -Z */
  forward?: readonly [number, number, number];

  /** Which way is up for it. By default +Y */
  up?: readonly [number, number, number];

  /**
   * How many flares and chaff clouds are drawn and light the scene:
   * `"low"`, `"medium"`, `"high"` (the default) or `"ultra"`, or
   * `{ flares, chaff, lights }`
   */
  quality?: CountermeasuresQualityName | Partial<CountermeasuresQuality>;

  /**
   * A shared flight to read the airspeed, the angles, the altitude and the
   * air's density from, every frame without rendering. By default the
   * nearest `<FlightProvider>`'s; null reads only the props
   */
  source?: Flight | null;

  /** The countermeasures themselves, to fire and drive every frame */
  ref?: Ref<CountermeasuresHandle | null>;
};

/**
 * One aircraft's flare and chaff dispensers, on the group it is.
 * @param props Where they are, the flare, the chaff, the program, the air
 *   and the eye
 * @returns The group
 */
export const Countermeasures: FC<CountermeasuresProps> = ({
  airframe,
  flare,
  chaff,
  program,
  flight,
  air,
  look,
  fire,
  target,
  forward,
  up,
  quality,
  source,
  ref,
  children,
  ...group_props
}) => {
  const gl = useThree((state) => state.gl);
  const provided = useFlightStore();
  const flight_source = source === undefined ? provided : source;

  useLayoutEffect(() => check_renderer(gl, "<Countermeasures>"), [gl]);

  const group = useRef<Group>(null);
  const [core, set_core] = useState<Core | null>(null);

  const stable_airframe = useShallowStable(airframe);
  const stable_flare = useShallowStable(flare);
  const stable_chaff = useShallowStable(chaff);
  const stable_program = useShallowStable(program);
  const stable_flight = useShallowStable(flight);
  const stable_air = useShallowStable(air);
  const stable_look = useShallowStable(look);
  const stable_quality = useShallowStable(quality);

  // Read at creation, then applied by the effects below
  const initial = useRef({
    airframe,
    flare,
    chaff,
    program,
    flight,
    air,
    look,
    quality,
  });

  initial.current = {
    airframe,
    flare,
    chaff,
    program,
    flight,
    air,
    look,
    quality,
  };

  useLayoutEffect(() => {
    const created = new Core(initial.current);

    group.current?.add(created.group);
    set_core(created);

    return () => {
      set_core(null);
      created.dispose();
    };
  }, []);

  // A portal moves the group: hang the countermeasures on it again
  useLayoutEffect(() => {
    if (core && group.current && core.group.parent !== group.current) {
      group.current.add(core.group);
    }
  }, [core, target]);

  useLayoutEffect(() => {
    if (stable_airframe) core?.updateAirframe(stable_airframe);
  }, [core, stable_airframe]);

  useLayoutEffect(() => {
    if (stable_flare) core?.updateFlare(stable_flare);
  }, [core, stable_flare]);

  useLayoutEffect(() => {
    if (stable_chaff) core?.updateChaff(stable_chaff);
  }, [core, stable_chaff]);

  useLayoutEffect(() => {
    if (stable_program) core?.updateProgram(stable_program);
  }, [core, stable_program]);

  useLayoutEffect(() => {
    if (stable_flight) core?.updateFlight(stable_flight);
  }, [core, stable_flight]);

  useLayoutEffect(() => {
    if (stable_air) core?.updateAir(stable_air);
  }, [core, stable_air]);

  useLayoutEffect(() => {
    if (stable_look) core?.updateLook(stable_look);
  }, [core, stable_look]);

  useLayoutEffect(() => {
    core?.setQuality(stable_quality);
  }, [core, stable_quality]);

  const [fx, fy, fz] = forward ?? [0, 0, -1];
  const [ux, uy, uz] = up ?? [0, 1, 0];

  useLayoutEffect(() => {
    core?.setFrame({ forward: [fx, fy, fz], up: [ux, uy, uz] });
  }, [core, fx, fy, fz, ux, uy, uz]);

  useLayoutEffect(() => {
    if (core) {
      core.source = flight_source;
    }
  }, [core, flight_source]);

  // Each change of `fire` fires once; its first value, nothing
  const fired = useRef(fire);

  useLayoutEffect(() => {
    if (!core || fire === fired.current) return;

    fired.current = fire;
    core.fire();
  }, [core, fire]);

  useImperativeHandle<Core | null, Core | null>(ref, () => core, [core]);

  const node = (
    <group ref={group} {...group_props}>
      {children}
    </group>
  );

  // Into the target's own children, so it follows it as any child would
  return target ? createPortal(node, target) : node;
};
