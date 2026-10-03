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

  /** The most iterations one pixel's march may take */
  max_steps?: number;

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
  max_steps,
  ref,
  children,
  ...group_props
}) => {
  const scene = useThree((state) => state.scene);
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

  useLayoutEffect(() => {
    if (stable_airframe) vapor?.update_airframe(stable_airframe);
  }, [vapor, stable_airframe]);

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
