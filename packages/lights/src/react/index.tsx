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
import { Lights as Core, type LightsAirframe } from "../lights-core";
import type {
  AntiCollisionDials,
  LightsAir,
  LightsIlluminate,
  LightsLook,
  LightsQuality,
  LightsQualityName,
  LightsSwitches,
  NavigationDials,
} from "../types";

// The friendly API
//
// `<Lights>` is a group where the aircraft's reference point sits, its
// lights placed from it or on its model's nodes: put it inside the
// aircraft's model, or on one of its nodes with `target`. The glare and the
// lights lighting the scene sit in it; the beams' light in the air goes in
// the scene, or the volume pass's

/**
 * What a `<Lights>`'s ref holds: the lights themselves, to drive every frame.
 */
export type LightsHandle = Core;

/**
 * Props for `<Lights>`: every `<group>` prop, and these.
 */
export type LightsProps = Omit<ThreeElements["group"], "ref"> & {
  /**
   * Where the lights are: positions in the group's frame, or the model's
   * nodes. Compared array by array, so keep them in a memo or a constant
   */
  airframe?: Partial<LightsAirframe>;

  /** Which are on */
  switches?: Partial<LightsSwitches>;

  /** The position lights' intensity, spill and colours */
  navigation?: Partial<NavigationDials>;

  /** The beacons' and strobes' intensity, rate, flash and colours */
  anticollision?: Partial<AntiCollisionDials>;

  /** The altitude and the day's visibility */
  air?: Partial<LightsAir>;

  /** The exposure, and the eye the glare is for */
  look?: Partial<LightsLook>;

  /** Which lights light the scene as well as being seen */
  illuminate?: Partial<LightsIlluminate>;

  /** The landing gear, 0 up to 1 down, for the lamps on it. Down by default */
  gear?: number;

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
   * How finely the beams are drawn: `"low"`, `"medium"`, `"high"` (the
   * default) or `"ultra"`, or `{ steps }`
   */
  quality?: LightsQualityName | Partial<LightsQuality>;

  /**
   * A shared flight to read the altitude, the air's density and the gear
   * from, every frame without rendering. By default the nearest
   * `<FlightProvider>`'s; null reads only the props
   */
  source?: Flight | null;

  /**
   * Draw the beams in passes of their own, from core's `volume_pass`. By
   * default the nearest `<VolumePassContext>`'s; null draws in the scene
   */
  pass?: VolumePass | null;

  /** The lights themselves, to drive every frame */
  ref?: Ref<LightsHandle | null>;
};

/**
 * One aircraft's lights, on the group it is.
 * @param props Where they are, which are on, the air and the eye
 * @returns The group
 */
export const Lights: FC<LightsProps> = ({
  airframe,
  switches,
  navigation,
  anticollision,
  air,
  look,
  illuminate,
  gear,
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

  useLayoutEffect(() => check_renderer(gl, "<Lights>"), [gl]);

  const group = useRef<Group>(null);
  const [lights, set_lights] = useState<Core | null>(null);

  const stable_airframe = useShallowStable(airframe);
  const stable_switches = useShallowStable(switches);
  const stable_navigation = useShallowStable(navigation);
  const stable_anticollision = useShallowStable(anticollision);
  const stable_air = useShallowStable(air);
  const stable_look = useShallowStable(look);
  const stable_illuminate = useShallowStable(illuminate);
  const stable_quality = useShallowStable(quality);

  // Read at creation, then applied by the effects below
  const initial = useRef({
    airframe,
    switches,
    navigation,
    anticollision,
    air,
    look,
    illuminate,
    gear,
    quality,
  });

  initial.current = {
    airframe,
    switches,
    navigation,
    anticollision,
    air,
    look,
    illuminate,
    gear,
    quality,
  };

  useLayoutEffect(() => {
    const created = new Core({
      ...initial.current,
      backdrop: pass?.backdrop,
    });

    group.current?.add(created.group);
    (pass?.scene ?? scene).add(created.volumes);
    set_lights(created);

    return () => {
      set_lights(null);
      created.dispose();
    };
  }, [scene, pass]);

  // A portal moves the group: hang the lights on it again
  useLayoutEffect(() => {
    if (lights && group.current && lights.group.parent !== group.current) {
      group.current.add(lights.group);
    }
  }, [lights, target]);

  useLayoutEffect(() => {
    if (stable_airframe) lights?.updateAirframe(stable_airframe);
  }, [lights, stable_airframe]);

  useLayoutEffect(() => {
    if (stable_switches) lights?.updateSwitches(stable_switches);
  }, [lights, stable_switches]);

  useLayoutEffect(() => {
    if (stable_navigation) lights?.updateNavigation(stable_navigation);
  }, [lights, stable_navigation]);

  useLayoutEffect(() => {
    if (stable_anticollision) lights?.updateAntiCollision(stable_anticollision);
  }, [lights, stable_anticollision]);

  useLayoutEffect(() => {
    if (stable_air) lights?.updateAir(stable_air);
  }, [lights, stable_air]);

  useLayoutEffect(() => {
    if (stable_look) lights?.updateLook(stable_look);
  }, [lights, stable_look]);

  useLayoutEffect(() => {
    if (stable_illuminate) lights?.updateIlluminate(stable_illuminate);
  }, [lights, stable_illuminate]);

  useLayoutEffect(() => {
    lights?.setQuality(stable_quality);
  }, [lights, stable_quality]);

  useLayoutEffect(() => {
    if (gear !== undefined) lights?.setGear(gear);
  }, [lights, gear]);

  const [fx, fy, fz] = forward ?? [0, 0, -1];
  const [ux, uy, uz] = up ?? [0, 1, 0];

  useLayoutEffect(() => {
    lights?.setFrame({ forward: [fx, fy, fz], up: [ux, uy, uz] });
  }, [lights, fx, fy, fz, ux, uy, uz]);

  useLayoutEffect(() => {
    if (lights) {
      lights.source = flight_source;
    }
  }, [lights, flight_source]);

  useImperativeHandle<Core | null, Core | null>(ref, () => lights, [lights]);

  const node = (
    <group ref={group} {...group_props}>
      {children}
    </group>
  );

  // Into the target's own children, so it follows it as any child would
  return target ? createPortal(node, target) : node;
};
