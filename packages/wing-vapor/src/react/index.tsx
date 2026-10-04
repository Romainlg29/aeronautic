import { check_renderer, dev_warn, type Flight } from "@aeronautic/core";
import { useFlightStore, useShallowStable } from "@aeronautic/core/react";
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
import { capture_airframe_async, type MeasuredAirframe } from "../measure";
import type {
  VaporAir,
  VaporAirframe,
  VaporEffects,
  VaporFlight,
  VaporLook,
  VaporQuality,
  VaporQualityName,
} from "../types";
import { WingVapor as Core } from "../wing-vapor-core";

// The friendly API
//
// `<WingVapor>` is a group where the aircraft's reference point sits, its
// stations measured from it: put it inside the aircraft's model, or on one of
// its nodes with `target`. The vapour follows the group. The flight changes
// every frame in a real scene, so it is best written through the ref, which
// costs no React render

/**
 * What a `<WingVapor>`'s ref holds: the vapour itself, to drive every frame
 * or read its state.
 */
export type WingVaporHandle = Core;

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
  captureFilter?: (mesh: Mesh) => boolean;

  /**
   * A capture done ahead of time, in place of `capture`: from
   * `capture_airframe`, or baked to JSON with `serialize_capture` and read
   * back with `deserialize_capture`
   */
  measured?: MeasuredAirframe | null;

  /**
   * What a frame may spend: `"low"`, `"medium"`, `"high"` (the default) or
   * `"ultra"`, or `{ maxSteps }`, the most iterations one pixel's march may take
   */
  quality?: VaporQualityName | Partial<VaporQuality>;

  /** Called with the measurement once `capture` is measured */
  onCaptured?: (measured: MeasuredAirframe) => void;

  /**
   * Called if measuring `capture` fails; the vapour keeps flying `airframe`.
   * Left out, the error is logged
   */
  onCaptureError?: (error: unknown) => void;

  /**
   * A shared flight to fly: its airspeed, angles, altitude and day win over
   * `flight` and `air`, read every frame without rendering. By default the
   * nearest `<FlightProvider>`'s; null flies only the props
   */
  source?: Flight | null;

  /** The vapour itself, to drive every frame or read its state */
  ref?: Ref<WingVaporHandle | null>;
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
  captureFilter: capture_filter,
  measured,
  quality,
  onCaptured: on_captured,
  onCaptureError: on_capture_error,
  source,
  ref,
  children,
  ...group_props
}) => {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const provided = useFlightStore();

  useLayoutEffect(() => check_renderer(gl, "<WingVapor>"), [gl]);

  if (airframe === undefined && !capture && !measured) {
    dev_warn(
      "vapor:airframe",
      "<WingVapor> has no airframe, capture or measured, so it flies the default delta fighter's wing. " +
        "Give it capture={model} to measure yours.",
    );
  }
  const flight_source = source === undefined ? provided : source;
  const group = useRef<Group>(null);

  const [vapor, set_vapor] = useState<Core | null>(null);

  const stable_airframe = useShallowStable(airframe);
  const stable_flight = useShallowStable(flight);
  const stable_air = useShallowStable(air);
  const stable_look = useShallowStable(look);
  const stable_effects = useShallowStable(effects);
  const stable_quality = useShallowStable(quality);

  // Read at creation, then applied by the effects below
  const initial = useRef({ airframe, flight, air, look, effects, quality });

  initial.current = { airframe, flight, air, look, effects, quality };

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
  const callbacks = useRef({ on_captured, on_capture_error });

  filter.current = capture_filter;
  callbacks.current = { on_captured, on_capture_error };

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
      ...vapor.frameOptions,
      filter: filter.current,
      signal: abort.signal,
    }).then(
      (measured) => {
        set_result({ object: capture, measured });
        callbacks.current.on_captured?.(measured);
      },
      (error: unknown) => {
        if (abort.signal.aborted) return;

        const report = callbacks.current.on_capture_error;

        if (report) {
          report(error);
        } else {
          console.error(
            "[aeronautic] <WingVapor> could not measure its capture:",
            error,
          );
        }
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
      vapor.applyCapture(shape_from);
    } else {
      vapor.setShape(null);
    }

    if (stable_airframe) vapor.updateAirframe(stable_airframe);
  }, [vapor, shape_from, stable_airframe]);

  useLayoutEffect(() => {
    if (stable_flight) vapor?.updateFlight(stable_flight);
  }, [vapor, stable_flight]);

  useLayoutEffect(() => {
    if (stable_air) vapor?.updateAir(stable_air);
  }, [vapor, stable_air]);

  useLayoutEffect(() => {
    if (stable_look) vapor?.updateLook(stable_look);
  }, [vapor, stable_look]);

  useLayoutEffect(() => {
    vapor?.setEffects(stable_effects ?? {});
  }, [vapor, stable_effects]);

  const [fx, fy, fz] = forward ?? [0, 0, -1];
  const [ux, uy, uz] = up ?? [0, 1, 0];

  useLayoutEffect(() => {
    vapor?.setFrame({ forward: [fx, fy, fz], up: [ux, uy, uz] });
  }, [vapor, fx, fy, fz, ux, uy, uz]);

  useLayoutEffect(() => {
    if (vapor) {
      vapor.source = flight_source;
    }
  }, [vapor, flight_source]);

  useLayoutEffect(() => {
    vapor?.setQuality(stable_quality);
  }, [vapor, stable_quality]);

  useImperativeHandle<Core | null, Core | null>(ref, () => vapor, [vapor]);

  const node = (
    <group ref={group} {...group_props}>
      {children}
    </group>
  );

  // Into the target's own children, so it follows it as any child would
  return target ? createPortal(node, target) : node;
};
