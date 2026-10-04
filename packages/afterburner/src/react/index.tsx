import {
  check_renderer,
  type Flight,
  type FlightValues,
} from "@aeronautic/core";
import {
  shared_context,
  useFlightStore,
  useShallowStable,
  useThrust,
} from "@aeronautic/core/react";
import { createPortal, useThree, type ThreeElements } from "@react-three/fiber";
import {
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type Ref,
} from "react";
import type { Group, Object3D } from "three";
import {
  AfterburnerBatch as Batch,
  type AfterburnerBatchOptions,
  type AfterburnerNozzle,
  type AfterburnerOffset,
  write_offset,
} from "../afterburner-batch";
import type {
  AfterburnerParamsInput,
  AfterburnerPreset,
  AfterburnerPresetName,
} from "../presets";
import type { AfterburnerParams } from "../types";
import type { AfterburnerPass } from "../afterburner-pass";
import { AFTERBURNER_MAX_THROTTLE } from "../plume-profile";

// The friendly API
//
// `<Afterburner>` is a group where a nozzle sits, and that is all most scenes
// need: it finds or makes a batch for its scene and preset, and the plume
// follows the group. `<AfterburnerBatch>` is for taking control of that batch,
// its profile, quality and hooks, or for reaching its stats

// undefined: no batch above, so make one. null: a batch above, not built yet
const BatchContext = shared_context<Batch | null | undefined>(
  "afterburner-batch",
  undefined,
);

/**
 * The batch the nearest `<AfterburnerBatch>` provides, if any.
 * @returns The batch, or null outside one or before it is built
 */
export const useAfterburnerBatch = (): Batch | null =>
  useContext(BatchContext) ?? null;

/**
 * What an `<AfterburnerBatch>`'s ref holds: the batch itself, for its stats
 * or to drive it directly.
 */
export type AfterburnerBatchHandle = Batch;

/**
 * Props for `<AfterburnerBatch>`.
 */
export type AfterburnerBatchProps = Omit<
  AfterburnerBatchOptions,
  "capacity" | "backdrop" | "source"
> & {
  /**
   * A shared flight: its altitude, airspeed and day win over `profile`, and
   * the nozzles that follow the throttle run at its. By default the nearest
   * `<FlightProvider>`'s; null flies only the props
   */
  source?: Flight | null;

  /**
   * Draw the plumes in passes of their own, from `afterburner_pass`: at a
   * lower resolution, composited over the scene. Changing it rebuilds the batch
   */
  pass?: AfterburnerPass;

  /** Seconds of flame per second, one being real time */
  timeScale?: number;

  /** How long, in seconds, a plume takes to follow its throttle. Zero is at once */
  responseS?: number;

  /** Plumes smaller than this share of the screen height are not drawn */
  minScreenFraction?: number;

  /** Past this, in metres, the eddies are dropped */
  detailDistanceM?: number;

  /** Past this, a plume is one sample */
  cheapDistanceM?: number;

  /** The batch, for its stats or to drive it directly */
  ref?: Ref<AfterburnerBatchHandle | null>;

  children?: ReactNode;
};

/**
 * One batch of plumes, shared by every `<Afterburner>` inside it.
 * @param props How the batch is set up
 * @returns Its children, inside the batch
 */
export const AfterburnerBatch: FC<AfterburnerBatchProps> = ({
  preset,
  profile,
  quality,
  haze = true,
  hooks,
  timeScale: time_scale = 1,
  responseS: response_s = 0.25,
  minScreenFraction: min_screen_fraction = 0.001,
  detailDistanceM: detail_distance_m = 900,
  cheapDistanceM: cheap_distance_m = 3000,
  pass,
  source,
  ref,
  children,
}) => {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const provided = useFlightStore();
  const flight = source === undefined ? provided : source;

  useLayoutEffect(() => check_renderer(gl, "<AfterburnerBatch>"), [gl]);

  const [batch, set_batch] = useState<Batch | null>(null);

  const stable_profile = useShallowStable(profile);
  const stable_quality = useShallowStable(quality);

  // Read at creation, then applied by the effects below
  const initial = useRef({ profile, quality, haze, hooks });

  initial.current = { profile, quality, haze, hooks };

  useLayoutEffect(() => {
    const created = new Batch({
      preset,
      ...initial.current,
      backdrop: pass?.backdrop,
    });

    (pass?.scene ?? scene).add(created.mesh);
    set_batch(created);

    return () => {
      set_batch(null);
      created.dispose();
    };
  }, [scene, preset, pass]);

  useLayoutEffect(() => {
    batch?.setProfile(stable_profile);
  }, [batch, stable_profile]);

  useLayoutEffect(() => {
    if (batch) {
      batch.source = flight;
    }
  }, [batch, flight]);

  useLayoutEffect(() => {
    batch?.setQuality(stable_quality);
  }, [batch, stable_quality]);

  useLayoutEffect(() => {
    batch?.setHaze(haze);
  }, [batch, haze]);

  useLayoutEffect(() => {
    batch?.setHooks(hooks);
  }, [batch, hooks]);

  if (batch !== null) {
    batch.timeScale = time_scale;
    batch.responseS = response_s;
    batch.minScreenFraction = min_screen_fraction;
    batch.detailDistanceM = detail_distance_m;
    batch.cheapDistanceM = cheap_distance_m;
  }

  useImperativeHandle<Batch | null, Batch | null>(ref, () => batch, [batch]);

  return <BatchContext value={batch}>{children}</BatchContext>;
};

// The batches made for nozzles with none above them, one per scene, preset
// and flight: the profile is the batch's, so two aircraft in two providers
// fly through their own air
type SharedBatch = { batch: Batch; users: number };

const shared_batches = new WeakMap<
  Object3D,
  Map<unknown, Map<Flight | null, SharedBatch>>
>();

/**
 * Take a share of the batch for one scene and preset, making it if need be.
 * @param scene The scene
 * @param preset The preset, by name or as an object
 * @param source The flight it reads, if any
 * @returns The batch, and how to give the share back
 */
const acquire_shared = (
  scene: Object3D,
  preset: AfterburnerPresetName | AfterburnerPreset | undefined,
  source: Flight | null,
): [Batch, () => void] => {
  let presets = shared_batches.get(scene);

  if (presets === undefined) {
    presets = new Map();
    shared_batches.set(scene, presets);
  }

  let batches = presets.get(preset);

  if (batches === undefined) {
    batches = new Map();
    presets.set(preset, batches);
  }

  let shared = batches.get(source);

  if (shared === undefined) {
    const batch = new Batch({ preset, source });

    scene.add(batch.mesh);

    shared = { batch, users: 0 };
    batches.set(source, shared);
  }

  shared.users++;

  const held = shared;
  const by_preset = presets;
  const by_source = batches;

  return [
    held.batch,
    () => {
      held.users--;

      if (held.users === 0) {
        by_source.delete(source);

        if (by_source.size === 0) {
          by_preset.delete(preset);
        }

        held.batch.dispose();
      }
    },
  ];
};

/**
 * What an `<Afterburner>`'s ref holds.
 *
 * Stable for the component's life, and safe to write before the nozzle is in
 * its batch: whatever was written is applied when it gets there.
 */
export type AfterburnerHandle = {
  /**
   * How hard the engine is running: 0 to 1 dry, on to 1.1 at full reheat.
   * Cheap to write every frame
   */
  throttle: number;

  /** Retune the nozzle, over its preset and the defaults: replaces them all */
  setParams: (params: AfterburnerParamsInput) => void;

  /**
   * Change some params and keep the rest, such as `exitMach`. The `params`
   * prop wins again whenever it changes. Altitude, airspeed and the day are
   * the batch's: `updateProfile` on its ref
   */
  updateParams: (params: AfterburnerParamsInput) => void;

  /**
   * Move or turn the nozzle in the frame it sits in: its parent's, or the
   * `target`'s. The same as writing to `object`, the group, directly
   */
  setOffset: (offset: AfterburnerOffset) => void;

  /** Point the plume, in that same frame */
  setDirection: (direction: readonly [number, number, number]) => void;

  /** The params it is drawn with, once it is in a batch */
  readonly params: Readonly<AfterburnerParams> | null;

  /** The group the plume leaves from */
  readonly object: Group | null;

  /** The nozzle in its batch, once it is in one */
  readonly nozzle: AfterburnerNozzle | null;

  /** The batch drawing it, once it is in one */
  readonly batch: Batch | null;
};

/**
 * Props for `<Afterburner>`: every `<group>` prop, and these.
 */
export type AfterburnerProps = Omit<ThreeElements["group"], "ref"> & {
  /**
   * Which look to start from. Outside an `<AfterburnerBatch>` this also picks
   * the batch, and with it the plume's profile.
   */
  preset?: AfterburnerPresetName | AfterburnerPreset;

  /** How this plume looks, over the preset. Compared field by field */
  params?: AfterburnerParamsInput;

  /**
   * How hard the engine is running: 0 to 1 dry, on to 1.1 at full reheat.
   * Or a function of the flight's values, read only when the flight changes,
   * as `(f) => f.throttle * 0.9`. Left out, it runs at its `<Engine>`'s
   * throttle inside one, else at the flight's inside a `<FlightProvider>`,
   * else at full reheat
   */
  throttle?: number | ((values: Readonly<FlightValues>) => number);

  /**
   * The flight it flies with, outside an `<AfterburnerBatch>`: its batch
   * reads the air from it, and the throttle when none is given. By default
   * the nearest `<FlightProvider>`'s; null flies only the props
   */
  source?: Flight | null;

  /** Draw it with this batch rather than the nearest one */
  batch?: Batch;

  /**
   * Sit on this object rather than where the component is in the tree: a
   * mesh, group or bone from anywhere in the scene, such as a node of a loaded
   * model. `position` and `rotation` are then in its frame, so they place the
   * nozzle on it. For a mesh of your own in JSX, keep it in state from a
   * callback ref: `ref={set_hull}` then `target={hull}`. Inside an `<Engine>`
   * it defaults to the engine's exhaust; null sits where it is in the tree
   */
  target?: Object3D | null;

  /**
   * Which way the exhaust streams, in the frame the group sits in. Wins over
   * `rotation`, and saves working out the turn that takes +Z there
   */
  direction?: readonly [number, number, number];

  ref?: Ref<AfterburnerHandle>;
};

/**
 * The flight's own throttle, for a nozzle given none.
 * @param values The flight's values
 * @returns Its throttle
 */
const flight_throttle = (values: Readonly<FlightValues>) => values.throttle;

/**
 * A nozzle. The plume streams out along the group's local +Z, aft of an aircraft flying along -Z, and follows it.
 * @param props Where the nozzle is, and how its plume looks
 * @returns The group
 */
export const Afterburner: FC<AfterburnerProps> = ({
  preset,
  params,
  throttle: throttle_prop,
  source,
  batch: explicit_batch,
  target: target_prop,
  direction,
  ref,
  children,
  ...group_props
}) => {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const above = useContext(BatchContext);

  useLayoutEffect(() => check_renderer(gl, "<Afterburner>"), [gl]);
  const provided = useFlightStore();
  const flight = source === undefined ? provided : source;

  const thrust = useThrust();
  const target =
    target_prop === undefined ? (thrust?.anchor ?? undefined) : target_prop;

  // Where the throttle comes from: a number is its own; a function, the
  // engine's or the flight's are read from the flight where it is drawn
  const from =
    typeof throttle_prop === "function"
      ? throttle_prop
      : throttle_prop === undefined
        ? (thrust?.throttle ?? flight_throttle)
        : null;
  const follow = from !== null && flight !== null;
  const throttle =
    typeof throttle_prop === "number"
      ? throttle_prop
      : follow
        ? from(flight.values)
        : AFTERBURNER_MAX_THROTTLE;

  const group_ref = useRef<Group>(null);
  const nozzle_ref = useRef<AfterburnerNozzle | null>(null);

  const stable_params = useShallowStable(params);

  // What has been asked of the handle, kept so a new nozzle can pick it up
  const state = useRef({
    throttle,
    from: follow ? from : null,
    params: stable_params,
    preset,
  });

  const handle = useMemo<AfterburnerHandle>(
    () => ({
      get throttle() {
        return state.current.throttle;
      },
      set throttle(value: number) {
        // Written by hand, it stops following the flight's
        state.current.throttle = value;
        state.current.from = null;

        if (nozzle_ref.current) {
          nozzle_ref.current.throttleFrom = null;
          nozzle_ref.current.throttle = value;
        }
      },
      setParams(next: AfterburnerParamsInput) {
        state.current.params = next;
        nozzle_ref.current?.setParams(next, state.current.preset);
      },
      updateParams(next: AfterburnerParamsInput) {
        handle.setParams({ ...state.current.params, ...next });
      },
      setOffset(offset: AfterburnerOffset) {
        if (group_ref.current) {
          write_offset(group_ref.current, offset);
        }
      },
      setDirection(direction: readonly [number, number, number]) {
        handle.setOffset({ direction });
      },
      get params() {
        return nozzle_ref.current?.params ?? null;
      },
      get object() {
        return group_ref.current;
      },
      get nozzle() {
        return nozzle_ref.current;
      },
      get batch() {
        return nozzle_ref.current?._batch ?? null;
      },
    }),
    [],
  );

  useImperativeHandle(ref, () => handle, [handle]);

  // Inside a batch still being built, wait for it rather than making one
  const waiting = explicit_batch === undefined && above === null;

  const aimed = direction !== undefined;
  const [dx, dy, dz] = direction ?? [0, 0, 0];

  useLayoutEffect(() => {
    const group = group_ref.current;

    if (group === null || !aimed) {
      return;
    }

    write_offset(group, { direction: [dx, dy, dz] });
  }, [aimed, dx, dy, dz, target]);

  useLayoutEffect(() => {
    const object = group_ref.current;

    if (object === null || waiting) {
      return;
    }

    let release: (() => void) | undefined;
    let batch = explicit_batch ?? above ?? undefined;

    if (batch === undefined) {
      [batch, release] = acquire_shared(scene, preset, flight);
    }

    const nozzle = batch.add({
      object,
      preset,
      params: state.current.params,
      throttle: state.current.throttle,
      throttleFrom: state.current.from,
    });

    nozzle_ref.current = nozzle;

    return () => {
      nozzle.remove();
      nozzle_ref.current = null;
      release?.();
    };
  }, [scene, above, explicit_batch, preset, waiting, target, flight]);

  // A new way of reading it, or a new number, is taken up at once rather
  // than at the flight's next change
  const reading = follow ? from : null;

  useLayoutEffect(() => {
    state.current.from = reading;
    state.current.throttle = throttle;

    if (nozzle_ref.current) {
      nozzle_ref.current.throttleFrom = reading;
      nozzle_ref.current.throttle = throttle;
    }
  }, [reading, throttle]);

  useLayoutEffect(() => {
    if (state.current.params === stable_params) {
      return;
    }

    state.current.params = stable_params;
    nozzle_ref.current?.setParams(stable_params, state.current.preset);
  }, [stable_params]);

  state.current.preset = preset;

  const group = (
    <group ref={group_ref} {...group_props}>
      {children}
    </group>
  );

  if (!target) {
    return group;
  }

  // Into the target's own children, so it follows it as any child would
  return createPortal(group, target);
};
