import { check_renderer, type Flight, type VolumePass } from "@aeronautic/core";
import {
  useFlightStore,
  useShallowStable,
  useVolumePass,
} from "@aeronautic/core/react";
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
import { Contrails as Core } from "../contrails-core";
import type {
  ContrailAir,
  ContrailAirframe,
  ContrailFlight,
  ContrailFuel,
  ContrailFuelName,
  ContrailLook,
  ContrailQuality,
  ContrailQualityName,
} from "../types";

// The friendly API
//
// `<Contrails>` is a group where the aircraft's reference point sits, its
// engines placed from it: put it inside the aircraft's model, or on one of
// its nodes with `target`. The trails follow the group, laid in the air it
// flies through. The flight changes every frame in a real scene, so it is
// best given by a `<FlightProvider>` or written through the ref, which costs
// no React render

/**
 * What a `<Contrails>`'s ref holds: the trails themselves, to drive every
 * frame or read their state.
 */
export type ContrailsHandle = Core;

/**
 * Props for `<Contrails>`: every `<group>` prop, and these.
 */
export type ContrailsProps = Omit<ThreeElements["group"], "ref"> & {
  /** The aircraft's mass, span, engines and where they are */
  airframe?: Partial<ContrailAirframe>;

  /** How fast, at what angles and what load. Compared field by field */
  flight?: Partial<ContrailFlight>;

  /** The altitude, the day and its humidity */
  air?: Partial<ContrailAir>;

  /** The sun and the sky */
  look?: Partial<ContrailLook>;

  /** What it burns: `"kerosene"` (the default), `"hydrogen"`, or the numbers */
  fuel?: ContrailFuelName | ContrailFuel;

  /** How many seconds of trail to draw. A minute by default */
  lengthS?: number;

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
   * How finely: `"low"`, `"medium"`, `"high"` (the default) or `"ultra"`,
   * or `{ points, puffs }`
   */
  quality?: ContrailQualityName | Partial<ContrailQuality>;

  /**
   * A shared flight to fly: its airspeed, angles, load, altitude and day win
   * over `flight` and `air`, read every frame without rendering. By default
   * the nearest `<FlightProvider>`'s; null flies only the props
   */
  source?: Flight | null;

  /**
   * Draw the trails in passes of their own, from core's `volume_pass`. By
   * default the nearest `<VolumePassContext>`'s; null draws in the scene
   */
  pass?: VolumePass | null;

  /** The trails themselves, to drive every frame or read their state */
  ref?: Ref<ContrailsHandle | null>;
};

/**
 * One aircraft's contrails, following the group it is.
 * @param props The aircraft, its flight and its day
 * @returns The group
 */
export const Contrails: FC<ContrailsProps> = ({
  airframe,
  flight,
  air,
  look,
  fuel,
  lengthS: length_s,
  target,
  forward,
  up,
  quality,
  source,
  pass: pass_prop,
  ref,
  children,
  ...group_props
}) => {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const provided = useFlightStore();
  const provided_pass = useVolumePass();
  const pass = pass_prop === undefined ? provided_pass : pass_prop;
  const flight_source = source === undefined ? provided : source;

  useLayoutEffect(() => check_renderer(gl, "<Contrails>"), [gl]);

  const group = useRef<Group>(null);
  const [trails, set_trails] = useState<Core | null>(null);

  const stable_airframe = useShallowStable(airframe);
  const stable_flight = useShallowStable(flight);
  const stable_air = useShallowStable(air);
  const stable_look = useShallowStable(look);
  const stable_fuel = useShallowStable(fuel);
  const stable_quality = useShallowStable(quality);

  // Read at creation, then applied by the effects below
  const initial = useRef({
    airframe,
    flight,
    air,
    look,
    fuel,
    quality,
    lengthS: length_s,
  });

  initial.current = {
    airframe,
    flight,
    air,
    look,
    fuel,
    quality,
    lengthS: length_s,
  };

  useLayoutEffect(() => {
    const created = new Core({
      ...initial.current,
      object: group.current,
      backdrop: pass?.backdrop,
    });

    (pass?.scene ?? scene).add(created.mesh);
    set_trails(created);

    return () => {
      set_trails(null);
      created.dispose();
    };
  }, [scene, pass]);

  useLayoutEffect(() => {
    if (trails) {
      trails.object = group.current;
    }
  }, [trails, target]);

  useLayoutEffect(() => {
    if (stable_airframe) trails?.updateAirframe(stable_airframe);
  }, [trails, stable_airframe]);

  useLayoutEffect(() => {
    if (stable_flight) trails?.updateFlight(stable_flight);
  }, [trails, stable_flight]);

  useLayoutEffect(() => {
    if (stable_air) trails?.updateAir(stable_air);
  }, [trails, stable_air]);

  useLayoutEffect(() => {
    if (stable_look) trails?.updateLook(stable_look);
  }, [trails, stable_look]);

  useLayoutEffect(() => {
    trails?.setFuel(stable_fuel ?? "kerosene");
  }, [trails, stable_fuel]);

  useLayoutEffect(() => {
    trails?.setQuality(stable_quality);
  }, [trails, stable_quality]);

  useLayoutEffect(() => {
    if (length_s !== undefined) trails?.setLength(length_s);
  }, [trails, length_s]);

  const [fx, fy, fz] = forward ?? [0, 0, -1];
  const [ux, uy, uz] = up ?? [0, 1, 0];

  useLayoutEffect(() => {
    trails?.setFrame({ forward: [fx, fy, fz], up: [ux, uy, uz] });
  }, [trails, fx, fy, fz, ux, uy, uz]);

  useLayoutEffect(() => {
    if (trails) {
      trails.source = flight_source;
    }
  }, [trails, flight_source]);

  useImperativeHandle<Core | null, Core | null>(ref, () => trails, [trails]);

  const node = (
    <group ref={group} {...group_props}>
      {children}
    </group>
  );

  // Into the target's own children, so it follows it as any child would
  return target ? createPortal(node, target) : node;
};
