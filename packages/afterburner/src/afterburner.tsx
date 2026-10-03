import { createPortal, useThree, type ThreeElements } from "@react-three/fiber";
import {
  createContext,
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
} from "./afterburner-batch";
import type {
  AfterburnerParamsInput,
  AfterburnerPreset,
  AfterburnerPresetName,
} from "./presets";
import type { AfterburnerParams } from "./types";
import type { AfterburnerPass } from "./afterburner-pass";
import { AFTERBURNER_MAX_THROTTLE } from "./plume-profile";

// The friendly API
//
// `<Afterburner>` is a group where a nozzle sits, and that is all most scenes
// need: it finds or makes a batch for its scene and preset, and the plume
// follows the group. `<AfterburnerBatch>` is for taking control of that batch,
// its profile, quality and hooks, or for reaching its stats

// undefined: no batch above, so make one. null: a batch above, not built yet
const BatchContext = createContext<Batch | null | undefined>(undefined);

/**
 * The batch the nearest `<AfterburnerBatch>` provides, if any.
 * @returns The batch, or null outside one or before it is built
 */
export const useAfterburnerBatch = (): Batch | null =>
  useContext(BatchContext) ?? null;

/**
 * Whether two flat objects hold the same values.
 * @param a One
 * @param b The other
 * @returns Whether every key matches
 */
const shallow_equal = (
  a: object | undefined,
  b: object | undefined,
): boolean => {
  if (a === b) {
    return true;
  }

  if (a === undefined || b === undefined) {
    return false;
  }

  const a_keys = Object.keys(a);

  if (a_keys.length !== Object.keys(b).length) {
    return false;
  }

  return a_keys.every(
    (key) =>
      (a as Record<string, unknown>)[key] ===
      (b as Record<string, unknown>)[key],
  );
};

/**
 * Hold on to a value until one arrives that differs field by field, so an
 * object written inline does not count as a change every render.
 * @param value The value as given this render
 * @returns The same object for as long as its fields hold
 */
const useShallowStable = <T extends object | string | undefined>(
  value: T,
): T => {
  const held = useRef(value);

  const same =
    held.current === value ||
    (typeof value === "object" &&
      typeof held.current === "object" &&
      shallow_equal(held.current, value));

  if (!same) {
    held.current = value;
  }

  return held.current;
};

/**
 * Props for `<AfterburnerBatch>`.
 */
export type AfterburnerBatchProps = Omit<
  AfterburnerBatchOptions,
  "capacity" | "backdrop"
> & {
  /**
   * Draw the plumes in passes of their own, from `afterburner_pass`: at a
   * lower resolution, composited over the scene. Changing it rebuilds the batch
   */
  pass?: AfterburnerPass;

  /** Seconds of flame per second, one being real time */
  time_scale?: number;

  /** How long, in seconds, a plume takes to follow its throttle. Zero is at once */
  response_s?: number;

  /** Plumes smaller than this share of the screen height are not drawn */
  min_screen_fraction?: number;

  /** Past this, in metres, the eddies are dropped */
  detail_distance_m?: number;

  /** Past this, a plume is one sample */
  cheap_distance_m?: number;

  /** The batch, for its stats or to drive it directly */
  ref?: Ref<Batch | null>;

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
  time_scale = 1,
  response_s = 0.25,
  min_screen_fraction = 0.001,
  detail_distance_m = 900,
  cheap_distance_m = 3000,
  pass,
  ref,
  children,
}) => {
  const scene = useThree((state) => state.scene);

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
    batch?.set_profile(stable_profile);
  }, [batch, stable_profile]);

  useLayoutEffect(() => {
    batch?.set_quality(stable_quality);
  }, [batch, stable_quality]);

  useLayoutEffect(() => {
    batch?.set_haze(haze);
  }, [batch, haze]);

  useLayoutEffect(() => {
    batch?.set_hooks(hooks);
  }, [batch, hooks]);

  if (batch !== null) {
    batch.time_scale = time_scale;
    batch.response_s = response_s;
    batch.min_screen_fraction = min_screen_fraction;
    batch.detail_distance_m = detail_distance_m;
    batch.cheap_distance_m = cheap_distance_m;
  }

  useImperativeHandle(ref, () => batch as Batch, [batch]);

  return <BatchContext value={batch}>{children}</BatchContext>;
};

// The batches made for nozzles with none above them, one per scene and preset
type SharedBatch = { batch: Batch; users: number };

const shared_batches = new WeakMap<Object3D, Map<unknown, SharedBatch>>();

/**
 * Take a share of the batch for one scene and preset, making it if need be.
 * @param scene The scene
 * @param preset The preset, by name or as an object
 * @returns The batch, and how to give the share back
 */
const acquire_shared = (
  scene: Object3D,
  preset: AfterburnerPresetName | AfterburnerPreset | undefined,
): [Batch, () => void] => {
  let batches = shared_batches.get(scene);

  if (batches === undefined) {
    batches = new Map();
    shared_batches.set(scene, batches);
  }

  let shared = batches.get(preset);

  if (shared === undefined) {
    const batch = new Batch({ preset });

    scene.add(batch.mesh);

    shared = { batch, users: 0 };
    batches.set(preset, shared);
  }

  shared.users++;

  const held = shared;
  const map = batches;

  return [
    held.batch,
    () => {
      held.users--;

      if (held.users === 0) {
        map.delete(preset);
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
  set_params: (params: AfterburnerParamsInput) => void;

  /**
   * Change some params and keep the rest, such as `exit_mach`. The `params`
   * prop wins again whenever it changes. Altitude, airspeed and the day are
   * the batch's: `update_profile` on its ref
   */
  update_params: (params: AfterburnerParamsInput) => void;

  /**
   * Move or turn the nozzle in the frame it sits in: its parent's, or the
   * `target`'s. The same as writing to `object`, the group, directly
   */
  set_offset: (offset: AfterburnerOffset) => void;

  /** Point the plume, in that same frame */
  set_direction: (direction: readonly [number, number, number]) => void;

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

  /** How hard the engine is running: 0 to 1 dry, on to 1.1 at full reheat */
  throttle?: number;

  /** Draw it with this batch rather than the nearest one */
  batch?: Batch;

  /**
   * Sit on this object rather than where the component is in the tree: a
   * mesh, group or bone from anywhere in the scene, such as a node of a loaded
   * model. `position` and `rotation` are then in its frame, so they place the
   * nozzle on it. For a mesh of your own in JSX, keep it in state from a
   * callback ref: `ref={set_hull}` then `target={hull}`
   */
  target?: Object3D | null;

  /**
   * Which way the exhaust streams, in the frame the group sits in. Wins over
   * `rotation`, and saves working out the turn that takes +X there
   */
  direction?: readonly [number, number, number];

  ref?: Ref<AfterburnerHandle>;
};

/**
 * A nozzle. The plume streams out along the group's local +X and follows it.
 * @param props Where the nozzle is, and how its plume looks
 * @returns The group
 */
export const Afterburner: FC<AfterburnerProps> = ({
  preset,
  params,
  throttle = AFTERBURNER_MAX_THROTTLE,
  batch: explicit_batch,
  target,
  direction,
  ref,
  children,
  ...group_props
}) => {
  const scene = useThree((state) => state.scene);
  const above = useContext(BatchContext);

  const group_ref = useRef<Group>(null);
  const nozzle_ref = useRef<AfterburnerNozzle | null>(null);

  const stable_params = useShallowStable(params);

  // What has been asked of the handle, kept so a new nozzle can pick it up
  const state = useRef({ throttle, params: stable_params, preset });

  const handle = useMemo<AfterburnerHandle>(
    () => ({
      get throttle() {
        return state.current.throttle;
      },
      set throttle(value: number) {
        state.current.throttle = value;

        if (nozzle_ref.current) {
          nozzle_ref.current.throttle = value;
        }
      },
      set_params(next: AfterburnerParamsInput) {
        state.current.params = next;
        nozzle_ref.current?.set_params(next, state.current.preset);
      },
      update_params(next: AfterburnerParamsInput) {
        handle.set_params({ ...state.current.params, ...next });
      },
      set_offset(offset: AfterburnerOffset) {
        if (group_ref.current) {
          write_offset(group_ref.current, offset);
        }
      },
      set_direction(direction: readonly [number, number, number]) {
        handle.set_offset({ direction });
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
      [batch, release] = acquire_shared(scene, preset);
    }

    const nozzle = batch.add({
      object,
      preset,
      params: state.current.params,
      throttle: state.current.throttle,
    });

    nozzle_ref.current = nozzle;

    return () => {
      nozzle.remove();
      nozzle_ref.current = null;
      release?.();
    };
  }, [scene, above, explicit_batch, preset, waiting, target]);

  useLayoutEffect(() => {
    state.current.throttle = throttle;

    if (nozzle_ref.current) {
      nozzle_ref.current.throttle = throttle;
    }
  }, [throttle]);

  useLayoutEffect(() => {
    if (state.current.params === stable_params) {
      return;
    }

    state.current.params = stable_params;
    nozzle_ref.current?.set_params(stable_params, state.current.preset);
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
