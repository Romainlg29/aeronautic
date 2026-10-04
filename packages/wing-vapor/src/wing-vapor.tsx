import type { Flight } from "@aeronautic/core";
import { useFlightStore } from "@aeronautic/core/react";
import { createPortal, useThree, type ThreeElements } from "@react-three/fiber";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type Ref,
} from "react";
import type { Group, Mesh, Object3D } from "three";
import { capture_airframe_async, type MeasuredAirframe } from "./measure";
import type {
  VaporAir,
  VaporAirframe,
  VaporEffects,
  VaporFlight,
  VaporLook,
} from "./types";
import { WingVapor as Core } from "./wing-vapor-core";

// The friendly API
//
// `<WingVapor>` is a group where the aircraft's reference point sits, its
// stations measured from it: put it inside the aircraft's model, or on one of
// its nodes with `target`. The vapour follows the group. The flight changes
// every frame in a real scene, so it is best written through the ref, which
// costs no React render

/**
 * Whether two flat objects hold the same values.
 * @param a One
 * @param b The other
 * @returns Whether every key matches
 */
const shallow_equal = (a: object | undefined, b: object | undefined) => {
  if (a === b) {
    return true;
  }

  if (a === undefined || b === undefined) {
    return false;
  }

  const a_keys = Object.keys(a);

  return (
    a_keys.length === Object.keys(b).length &&
    a_keys.every(
      (key) =>
        (a as Record<string, unknown>)[key] ===
        (b as Record<string, unknown>)[key],
    )
  );
};

/**
 * Hold on to a value until one arrives that differs field by field, so an
 * object written inline does not count as a change every render.
 * @param value The value as given this render
 * @returns The same object for as long as its fields hold
 */
const useShallowStable = <T extends object | undefined>(value: T): T => {
  const held = useRef(value);

  if (!shallow_equal(held.current, value)) {
    held.current = value;
  }

  return held.current;
};

/**
 * Props for `<WingVapor>`: every `<group>` prop, and these.
 */
export type WingVaporProps = Omit<ThreeElements["group"], "ref"> & {
  /** The aircraft's wing and body, over a delta fighter's */
  airframe?: Partial<VaporAirframe>;

  /** How fast and at what angle of attack. Compared field by field */
  flight?: Partial<VaporFlight>;

  /** The altitude, the day and its humidity */
  air?: Partial<VaporAir>;

  /** The sun, the sky and the camera */
  look?: Partial<VaporLook>;

  /** Which phenomena to draw. Changing it rebuilds the material */
  effects?: Partial<VaporEffects>;

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
   * A model to measure the aircraft from, by six depth views: its wing
   * station by station and its planform and body, in place of `airframe`'s
   * shape. `airframe` still wins for whatever it gives. Captured when it
   * changes, a few milliseconds a frame: until then the vapour flies
   * `airframe` as given
   */
  capture?: Object3D | null;

  /**
   * Which of its meshes to measure. By default every visible one: leave out
   * the landing gear and the stores, which are not the shape the air flies
   * round
   */
  capture_filter?: (mesh: Mesh) => boolean;

  /**
   * A capture done ahead of time, in place of `capture`: from
   * `capture_airframe`, or baked to JSON with `serialize_capture` and read
   * back with `deserialize_capture`
   */
  measured?: MeasuredAirframe | null;

  /** The most iterations one pixel's march may take */
  max_steps?: number;

  /**
   * A shared flight to fly: its airspeed, angles, altitude and day win over
   * `flight` and `air`, read every frame without rendering. By default the
   * nearest `<FlightProvider>`'s; null flies only the props
   */
  source?: Flight | null;

  /** The vapour itself, to drive every frame or read its state */
  ref?: Ref<Core | null>;
};

/**
 * One aircraft's wing vapour, following the group it is.
 * @param props The aircraft, its flight and its day
 * @returns The group
 */
export const WingVapor: FC<WingVaporProps> = ({
  airframe,
  flight,
  air,
  look,
  effects,
  target,
  forward,
  up,
  capture,
  capture_filter,
  measured,
  max_steps,
  source,
  ref,
  children,
  ...group_props
}) => {
  const scene = useThree((state) => state.scene);
  const provided = useFlightStore();
  const flight_source = source === undefined ? provided : source;
  const group = useRef<Group>(null);

  const [vapor, set_vapor] = useState<Core | null>(null);

  const stable_airframe = useShallowStable(airframe);
  const stable_flight = useShallowStable(flight);
  const stable_air = useShallowStable(air);
  const stable_look = useShallowStable(look);
  const stable_effects = useShallowStable(effects);

  // Read at creation, then applied by the effects below
  const initial = useRef({ airframe, flight, air, look, effects, max_steps });

  initial.current = { airframe, flight, air, look, effects, max_steps };

  useLayoutEffect(() => {
    const created = new Core({ ...initial.current, object: group.current });

    scene.add(created.mesh);
    set_vapor(created);

    return () => {
      set_vapor(null);
      created.dispose();
    };
  }, [scene]);

  useLayoutEffect(() => {
    if (vapor) {
      vapor.object = group.current;
    }
  }, [vapor, target]);

  // Kept in a ref: a filter written inline is a new function every render,
  // and the capture should not run again for it
  const filter = useRef(capture_filter);

  filter.current = capture_filter;

  // Measured a few milliseconds a frame, so a big model doesn't stall the
  // page; the vapour flies the airframe as given until it is done
  // Kept with the model it measured, so a capture that's been superseded
  // reads as none
  const [result, set_result] = useState<{
    object: Object3D;
    measured: MeasuredAirframe;
  } | null>(null);

  useEffect(() => {
    if (!vapor || !capture) return;

    const abort = new AbortController();

    capture_airframe_async(capture, {
      ...vapor.frame_options,
      filter: filter.current,
      signal: abort.signal,
    }).then(
      (measured) => set_result({ object: capture, measured }),
      (error: unknown) => {
        if (!abort.signal.aborted) console.error(error);
      },
    );

    return () => abort.abort();
  }, [vapor, capture]);

  const captured =
    capture && result?.object === capture ? result.measured : null;

  const shape_from = measured ?? captured;

  // The measurement first, then the airframe given over it
  useLayoutEffect(() => {
    if (!vapor) return;

    if (shape_from) {
      vapor.apply_capture(shape_from);
    } else {
      vapor.set_shape(null);
    }

    if (stable_airframe) vapor.update_airframe(stable_airframe);
  }, [vapor, shape_from, stable_airframe]);

  useLayoutEffect(() => {
    if (stable_flight) vapor?.update_flight(stable_flight);
  }, [vapor, stable_flight]);

  useLayoutEffect(() => {
    if (stable_air) vapor?.update_air(stable_air);
  }, [vapor, stable_air]);

  useLayoutEffect(() => {
    if (stable_look) vapor?.update_look(stable_look);
  }, [vapor, stable_look]);

  useLayoutEffect(() => {
    vapor?.set_effects(stable_effects ?? {});
  }, [vapor, stable_effects]);

  const [fx, fy, fz] = forward ?? [0, 0, -1];
  const [ux, uy, uz] = up ?? [0, 1, 0];

  useLayoutEffect(() => {
    vapor?.set_frame({ forward: [fx, fy, fz], up: [ux, uy, uz] });
  }, [vapor, fx, fy, fz, ux, uy, uz]);

  useLayoutEffect(() => {
    if (vapor) {
      vapor.source = flight_source;
    }
  }, [vapor, flight_source]);

  useLayoutEffect(() => {
    if (vapor && max_steps !== undefined) {
      vapor.uniforms.max_steps.value = max_steps;
    }
  }, [vapor, max_steps]);

  useImperativeHandle(ref, () => vapor as Core, [vapor]);

  const node = (
    <group ref={group} {...group_props}>
      {children}
    </group>
  );

  // Into the target's own children, so it follows it as any child would
  return target ? createPortal(node, target) : node;
};
