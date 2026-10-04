import type { CaptureFrame, Flight, FlightValues } from "@aeronautic/core";
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  LoopOnce,
  type Object3D,
} from "three";
import {
  type ControlAnchor,
  type ControlSurface,
  type FindSurfacesOptions,
  find_anchors,
  find_surfaces,
  name_side,
  pose_surface,
  type SurfaceKind,
  type SurfaceSide,
} from "./surfaces";

// The rig: every moving part on one model, and what drives each
//
// The rig moves nothing by itself. Drives say what moves a part: a function of
// the flight, registered for some parts, as `rig.drive({ kinds: ["rudder"],
// from: (f, part) => ... })`. When several drives claim a part, the most
// specific wins: one naming the part, then one naming its group, then one
// naming its kind, a side making any of them more specific, the later one
// winning a tie. A part no drive claims rests
//
// Each part is an actuator, chasing its target at a rate a real one would, so
// a stick slammed over moves the elevons over a third of a second rather than
// in a frame. What the model animates with clips, its gear retracting or its
// nozzles opening, is scrubbed through the clip rather than driven part by
// part, so the doors and the legs keep the sequence they were authored with
//
// Drives are resolved when they are added or removed, never in a frame.
// Nothing is read unless the flight changed, and no frame allocates

/**
 * How fast each kind of part moves, in its unit a second: degrees, metres or
 * shares. Infinity follows at once.
 */
export type ControlRates = Record<SurfaceKind, number>;

/**
 * The rates of a fighter's actuators, and the pilot's hands for the cockpit.
 * @returns The defaults
 */
export const default_control_rates = (): ControlRates => ({
  aileron: 80,
  elevator: 60,
  elevon: 60,
  stabilator: 60,
  canard: 60,
  rudder: 80,
  flap: 10,
  le_flap: 30,
  airbrake: 40,
  spoiler: 80,
  drag_rudder: 60,
  nozzle_pitch: 40,
  nozzle_yaw: 40,
  nozzle_petal: 20,
  gear: 30,
  gear_door: 60,
  gear_lever: Infinity,
  stick_pitch: Infinity,
  stick_roll: Infinity,
  pedal: Infinity,
  throttle_lever: Infinity,
  other: Infinity,
});

/**
 * How a rig is made.
 */
export type ControlRigOptions = FindSurfacesOptions & {
  /** The model's clips, scrubbed by `drive_clip` or `set_clip` */
  animations?: readonly AnimationClip[];

  /** The flight its drives read. null moves only what is set by hand */
  source?: Flight | null;

  /** How fast each kind moves, over the defaults */
  rates?: Partial<ControlRates>;

  /** Jump to the flight's pose on the first read, rather than move there. On by default */
  settle?: boolean;
};

/**
 * Which parts a drive is for. With none of `parts`, `group` and `kinds`, it
 * is for every part; `side` and `filter` narrow any of them.
 */
export type DriveSelect = {
  /** The parts by name, as `CTRL_Rudder_L` */
  parts?: readonly string[];

  /** A rig group, as `elevons` */
  group?: string;

  /** Kinds of part, as `["aileron"]` */
  kinds?: readonly SurfaceKind[];

  side?: SurfaceSide;

  /** Keep only the parts this passes */
  filter?: (part: ControlSurface) => boolean;
};

/**
 * What a drive does. The object is read as it is whenever the flight changes
 * or `refresh` is called, so its functions may be swapped in place.
 */
export type DriveOptions = DriveSelect & {
  /**
   * Where a part should be for a flight, in its own unit, clamped to its
   * limits. null leaves it where it was going
   */
  from: (values: Readonly<FlightValues>, part: ControlSurface) => number | null;

  /** In the part's unit a second, over the rig's rate for its kind */
  rate?: number;

  /** Called in the frame a part moves, with where it now is */
  on_move?: (value: number, part: ControlSurface) => void;
};

/**
 * What drives a clip.
 */
export type ClipDriveOptions = {
  /** The clip, by name or by a pattern its name matches */
  clip: string | RegExp;

  /** Only the clips whose name says this side */
  side?: SurfaceSide;

  /** How far through the clip, 0 to 1. null leaves it where it was going */
  from: (values: Readonly<FlightValues>, clip: ControlClip) => number | null;

  /** Shares of the clip a second. By default it plays in the clip's time */
  rate?: number;

  /** Called in the frame a clip moves, with where it now is */
  on_move?: (position: number, clip: ControlClip) => void;
};

/**
 * A drive, once added.
 */
export type ControlDrive = {
  /** The parts it claimed, whether or not a more specific one won them */
  readonly parts: readonly ControlSurface[];

  /** Read its options again: their rate, and where they put each part */
  refresh(): void;

  /** Stop driving: its parts go to the next drive that claims them, or rest */
  dispose(): void;
};

/**
 * One clip, scrubbed rather than played.
 */
export type ControlClip = {
  readonly clip: AnimationClip;
  readonly action: AnimationAction;

  /** Where it is, 0 to 1 of the clip */
  position: number;
  target: number;

  /** Shares of the clip a second */
  rate: number;

  /** @internal What drives it */
  _drive: ClipEntry | null;

  /** @internal Set by hand, which wins over its drive */
  _manual: number | null;

  /** @internal The rate set by hand, over its drive's */
  _manual_rate: number | undefined;

  /** @internal Not posed yet */
  _fresh: boolean;

  /** @internal The names of the nodes it moves */
  readonly _nodes: ReadonlySet<string>;
};

type DriveEntry = {
  readonly options: DriveOptions;
  readonly specificity: number;
  readonly order: number;
  parts: ControlSurface[];
};

type ClipEntry = {
  readonly options: ClipDriveOptions;
  readonly order: number;
};

/**
 * How specific a selection is: a part over a group over a kind, a side
 * breaking the tie.
 * @param select The selection
 * @returns Its rank
 */
const specificity = (select: DriveSelect): number =>
  (select.parts ? 3 : select.group !== undefined ? 2 : select.kinds ? 1 : 0) +
  (select.side ? 0.5 : 0);

/**
 * Whether a selection takes a part.
 * @param select The selection
 * @param part The part
 * @returns Whether it does
 */
export const selects = (select: DriveSelect, part: ControlSurface): boolean => {
  if (select.parts && !select.parts.includes(part.name)) return false;
  if (select.group !== undefined && part.group !== select.group) return false;
  if (select.kinds && !select.kinds.includes(part.kind)) return false;
  if (select.side && part.side !== select.side) return false;

  return !select.filter || select.filter(part);
};

/**
 * Whether a clip is the one asked for.
 * @param channel The clip
 * @param options What was asked
 * @returns Whether it is
 */
const clip_matches = (channel: ControlClip, options: ClipDriveOptions) => {
  const name = channel.clip.name;
  const named =
    typeof options.clip === "string"
      ? name === options.clip
      : options.clip.test(name);

  return named && (!options.side || name_side(name) === options.side);
};

/**
 * The names of the nodes a clip moves.
 * @param clip The clip
 * @returns Their names
 */
const clip_nodes = (clip: AnimationClip): Set<string> =>
  new Set(
    clip.tracks.map((track) =>
      track.name.slice(0, track.name.lastIndexOf(".")),
    ),
  );

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * Every moving part of one model, and what drives each.
 *
 * Add drives with `drive`, or with the parts in `./parts`, then call `update`
 * once a frame; React's `<Airframe>` does it for you.
 */
export class ControlRig {
  /** The model */
  readonly root: Object3D;

  /** Which way the model faces */
  readonly frame: CaptureFrame;

  /** Every point the model marks for an effect, with its extras */
  readonly anchors: readonly ControlAnchor[];

  /** Every clip, by name */
  readonly clips: ReadonlyMap<string, ControlClip>;

  /** The flight the drives read. null moves only what is set by hand */
  source: Flight | null;

  /** How fast each kind moves. Call `refresh` after changing it */
  readonly rates: ControlRates;

  private readonly _surfaces: ControlSurface[];
  private readonly _mixer: AnimationMixer | null;

  private _value: number[] = [];
  private _target: number[] = [];
  private _rate: number[] = [];

  // Set by hand: wins over every drive
  private _manual: (number | null)[] = [];

  // Moved by a driven clip, so no drive moves them
  private _clipped: boolean[] = [];

  // The drive that won each part
  private _driver: (DriveEntry | null)[] = [];

  private readonly _by_name = new Map<string, number>();
  private readonly _drives: DriveEntry[] = [];
  private readonly _clip_drives: ClipEntry[] = [];
  private readonly _moved_listeners: (() => void)[] = [];
  private _order = 0;

  // The clips again, as an array, walked every frame without an iterator
  private readonly _channels: ControlClip[];

  private _read_from: Flight | null = null;
  private _read_version = -1;
  private _settle: boolean;
  private _dirty = true;

  constructor(root: Object3D, options: ControlRigOptions = {}) {
    this.root = root;
    this.frame = { forward: options.forward, up: options.up };
    this.source = options.source ?? null;
    this._settle = options.settle ?? true;
    this.rates = { ...default_control_rates(), ...options.rates };
    this._surfaces = find_surfaces(root, options);
    this.anchors = find_anchors(root, options);

    // The clips, scrubbed by hand: once, held at the end
    const clips = new Map<string, ControlClip>();
    const animations = options.animations ?? [];

    this._mixer = animations.length > 0 ? new AnimationMixer(root) : null;

    for (const clip of animations) {
      const action = this._mixer!.clipAction(clip);

      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      action.paused = true;

      // Not posed until something drives it: the model keeps its rest pose
      action.enabled = false;

      clips.set(clip.name, {
        clip,
        action,
        position: 0,
        target: 0,
        rate: 1 / Math.max(clip.duration, 1e-3),
        _drive: null,
        _manual: null,
        _manual_rate: undefined,
        _fresh: true,
        _nodes: clip_nodes(clip),
      });
    }

    this.clips = clips;
    this._channels = [...clips.values()];
    this.assign();
  }

  /** Every part, in the order found, then those added */
  get surfaces(): readonly ControlSurface[] {
    return this._surfaces;
  }

  /**
   * One part, by its name.
   * @param name The node's name
   * @returns The part, if there is one
   */
  surface(name: string): ControlSurface | undefined {
    const index = this._by_name.get(name);

    return index === undefined ? undefined : this._surfaces[index];
  }

  /**
   * One anchor, by its name.
   * @param name The node's name, as `FX_Exhaust_L`
   * @returns The anchor, if there is one
   */
  anchor(name: string): ControlAnchor | undefined {
    return this.anchors.find((anchor) => anchor.name === name);
  }

  /**
   * Where a part is now.
   * @param name The node's name
   * @returns Its value in its unit, or NaN if there is no such part
   */
  value(name: string): number {
    const index = this._by_name.get(name);

    return index === undefined ? Number.NaN : this._value[index];
  }

  /**
   * Add a part the model doesn't have, as a pivot put in by code. It rests
   * where it is, and drives that select it move it.
   * @param surface The part
   */
  add_surface(surface: ControlSurface) {
    if (this._by_name.has(surface.name)) {
      throw new Error(`A part named ${surface.name} is already on the rig`);
    }

    this._surfaces.push(surface);
    this.assign();
  }

  /**
   * Take a part off the rig. Its node is left where it is.
   * @param name The node's name
   */
  remove_surface(name: string) {
    const index = this._by_name.get(name);

    if (index === undefined) return;

    this._surfaces.splice(index, 1);
    this.assign();
  }

  /**
   * Drive parts from the flight.
   * @param options Which parts, and where each should be
   * @returns The drive, to refresh or dispose of
   */
  drive(options: DriveOptions): ControlDrive {
    const entry: DriveEntry = {
      options,
      specificity: specificity(options),
      order: this._order++,
      parts: [],
    };

    this._drives.push(entry);
    this.assign();

    return {
      get parts() {
        return entry.parts;
      },
      refresh: () => this.refresh(),
      dispose: () => {
        const at = this._drives.indexOf(entry);

        if (at < 0) return;

        this._drives.splice(at, 1);
        this.assign();
      },
    };
  }

  /**
   * Scrub clips from the flight. A part a driven clip moves is left to it.
   * @param options Which clips, and how far through each should be
   * @returns The drive, to refresh or dispose of
   */
  drive_clip(options: ClipDriveOptions): ControlDrive {
    const entry: ClipEntry = { options, order: this._order++ };

    this._clip_drives.push(entry);
    this.assign();

    return {
      parts: this._surfaces.filter((part) =>
        this._channels.some(
          (channel) =>
            clip_matches(channel, options) && channel._nodes.has(part.name),
        ),
      ),
      refresh: () => this.refresh(),
      dispose: () => {
        const at = this._clip_drives.indexOf(entry);

        if (at < 0) return;

        this._clip_drives.splice(at, 1);
        this.assign();
      },
    };
  }

  /**
   * Be told when anything moved, once a frame at most.
   * @param listener Called after the parts and clips are posed
   * @returns A function that stops it
   */
  on_moved(listener: () => void): () => void {
    this._moved_listeners.push(listener);

    return () => {
      const at = this._moved_listeners.indexOf(listener);

      if (at >= 0) this._moved_listeners.splice(at, 1);
    };
  }

  /** Read every drive's options and the rates again */
  refresh() {
    const surfaces = this._surfaces;

    for (let index = 0; index < surfaces.length; index++) {
      this._rate[index] =
        this._driver[index]?.options.rate ?? this.rates[surfaces[index].kind];
    }

    for (const channel of this._channels) {
      channel.rate =
        channel._manual_rate ??
        channel._drive?.options.rate ??
        1 / Math.max(channel.clip.duration, 1e-3);
    }

    this._dirty = true;
  }

  /**
   * Move one part by hand, over its drive. It still moves at its rate.
   * @param name The node's name
   * @param value In its unit, clamped to its limits. null gives it back
   */
  set(name: string, value: number | null) {
    const index = this._by_name.get(name);

    if (index === undefined) return;

    const surface = this._surfaces[index];

    this._manual[index] =
      value === null ? null : clamp(value, surface.min, surface.max);
    this._dirty = true;
  }

  /**
   * Move every part of a group by hand, as a share of its travel: the
   * canopy, the bay doors, the ladder.
   * @param group A rig group, as `canopy`, or a kind, as `airbrake`
   * @param share 0 to 1, from its least to its most. null gives it back
   */
  set_group(group: string, share: number | null) {
    const surfaces = this._surfaces;

    for (let index = 0; index < surfaces.length; index++) {
      const surface = surfaces[index];

      if (surface.group !== group && surface.kind !== group) continue;

      this._manual[index] =
        share === null
          ? null
          : surface.min + (surface.max - surface.min) * clamp(share, 0, 1);
    }

    this._dirty = true;
  }

  /**
   * Scrub a clip by hand, over whatever drives it.
   * @param name The clip's name, as `ANIM_Canopy_Open`
   * @param share 0 to 1 of the clip. null gives it back
   * @param rate Shares a second it moves at. Infinity jumps
   */
  set_clip(name: string, share: number | null, rate?: number) {
    const channel = this.clips.get(name);

    if (!channel) return;

    channel._manual = share === null ? null : clamp(share, 0, 1);
    channel._manual_rate = share === null ? undefined : rate;
    this.refresh();
  }

  /**
   * Move everything one frame on.
   * @param delta_s How long the frame was, in seconds
   */
  update(delta_s: number) {
    const source = this.source;
    const changed =
      source !== null &&
      (source !== this._read_from || source.version !== this._read_version);

    if (changed || this._dirty) {
      this.retarget();
    }

    const settle = changed && this._settle;

    if (changed) {
      this._read_from = source;
      this._read_version = source!.version;
      this._settle = false;
    }

    this.step(settle ? Infinity : delta_s);
  }

  /**
   * Work out again which drive moves each part, which clip each clip drive
   * scrubs and which parts those clips move. Run when a drive or a part comes
   * or goes, never in a frame.
   */
  private assign() {
    const surfaces = this._surfaces;
    const count = surfaces.length;
    const previous = new Map<string, [number, number, number | null]>();

    this._by_name.forEach((index, name) =>
      previous.set(name, [
        this._value[index],
        this._target[index],
        this._manual[index],
      ]),
    );

    this._by_name.clear();
    this._value = new Array<number>(count);
    this._target = new Array<number>(count);
    this._rate = new Array<number>(count);
    this._manual = new Array<number | null>(count);
    this._clipped = new Array<boolean>(count).fill(false);
    this._driver = new Array<DriveEntry | null>(count).fill(null);

    for (const entry of this._drives) {
      entry.parts = surfaces.filter((part) => selects(entry.options, part));
    }

    // Each clip to the latest drive that asks for it
    for (const channel of this._channels) {
      channel._drive = null;

      for (const entry of this._clip_drives) {
        if (clip_matches(channel, entry.options)) channel._drive = entry;
      }
    }

    for (let index = 0; index < count; index++) {
      const surface = surfaces[index];
      const kept = previous.get(surface.name);

      this._by_name.set(surface.name, index);
      this._value[index] = kept?.[0] ?? surface.rest;
      this._target[index] = kept?.[1] ?? surface.rest;
      this._manual[index] = kept?.[2] ?? null;

      for (const channel of this._channels) {
        if (channel._drive && channel._nodes.has(surface.name)) {
          this._clipped[index] = true;
        }
      }

      // The most specific drive, the later of two as specific
      let best: DriveEntry | null = null;

      for (const entry of this._drives) {
        if (!entry.parts.includes(surface)) continue;

        if (
          !best ||
          entry.specificity > best.specificity ||
          (entry.specificity === best.specificity && entry.order > best.order)
        ) {
          best = entry;
        }
      }

      this._driver[index] = best;
    }

    this.refresh();
  }

  /** Work out every target again, from the flight and the hands */
  private retarget() {
    this._dirty = false;

    const values = this.source?.values;
    const surfaces = this._surfaces;

    for (let index = 0; index < surfaces.length; index++) {
      const surface = surfaces[index];
      const manual = this._manual[index];

      if (manual !== null) {
        this._target[index] = manual;
        continue;
      }

      if (this._clipped[index]) continue;

      const driver = this._driver[index];

      if (!driver) {
        this._target[index] = surface.rest;
        continue;
      }

      if (!values) continue;

      const wanted = driver.options.from(values, surface);

      if (wanted !== null && !Number.isNaN(wanted)) {
        this._target[index] = clamp(wanted, surface.min, surface.max);
      }
    }

    for (const channel of this._channels) {
      if (channel._manual !== null) {
        channel.target = channel._manual;
        continue;
      }

      if (!values || !channel._drive) continue;

      const wanted = channel._drive.options.from(values, channel);

      if (wanted !== null && !Number.isNaN(wanted)) {
        channel.target = clamp(wanted, 0, 1);
      }
    }
  }

  /**
   * Move every part and clip toward its target.
   * @param delta_s How long the frame was; Infinity jumps
   */
  private step(delta_s: number) {
    const value = this._value;
    const target = this._target;
    const surfaces = this._surfaces;
    let moved = false;

    for (let index = 0; index < value.length; index++) {
      const gap = target[index] - value[index];

      if (gap === 0) continue;

      const reach = this._rate[index] * delta_s;

      value[index] =
        Math.abs(gap) <= reach
          ? target[index]
          : value[index] + Math.sign(gap) * reach;

      pose_surface(surfaces[index], value[index]);
      moved = true;

      this._driver[index]?.options.on_move?.(value[index], surfaces[index]);
    }

    if (this._mixer) {
      let scrubbed = false;

      for (const channel of this._channels) {
        const driven = channel._manual !== null || channel._drive !== null;

        if (!driven || (!channel._fresh && channel.position === channel.target))
          continue;

        // First driven, it starts from the clip's start, the rest pose
        if (channel._fresh) {
          channel._fresh = false;
          channel.action.enabled = true;
        }

        const gap = channel.target - channel.position;
        const reach = channel.rate * delta_s;

        channel.position =
          Math.abs(gap) <= reach
            ? channel.target
            : channel.position + Math.sign(gap) * reach;

        // Short of the very end, so a clip played once is not finished
        const duration = channel.clip.duration;

        channel.action.time = Math.min(
          channel.position * duration,
          duration - 1e-4,
        );
        scrubbed = true;

        channel._drive?.options.on_move?.(channel.position, channel);
      }

      if (scrubbed) {
        this._mixer.update(0);
        moved = true;
      }
    }

    if (moved) {
      const listeners = this._moved_listeners;

      for (let index = 0; index < listeners.length; index++) {
        listeners[index]();
      }
    }
  }

  /** Stop the clips. The parts stay where they are */
  dispose() {
    if (this._mixer) {
      this._mixer.stopAllAction();
      this._mixer.uncacheRoot(this.root);
    }
  }
}
