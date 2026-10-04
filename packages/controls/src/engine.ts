import type { FlightValues } from "@aeronautic/core";
import { Group, type Object3D, Vector3 } from "three";
import { combine_drives } from "./parts";
import {
  default_control_mixing,
  nozzle_opening,
  type NozzleSchedule,
  sense_of,
  travel,
} from "./mix";
import type { ControlClip, ControlDrive, ControlRig } from "./rig";
import {
  type ControlSurface,
  insert_pivot,
  into_frame,
  name_side,
  type SurfaceSide,
} from "./surfaces";

// An engine: its nozzle, opened with the throttle and turned for thrust
// vectoring, and the exhaust its plume streams from
//
// What the nozzle can do is read off the model. A rigged gimbal's limits are
// its parts' `min` and `max`, and a `limit_shape` of `ellipse` says the two
// axes share one round limit, as a real axisymmetric nozzle's do: full pitch
// and full yaw together reach the same circle, not its corner. A model with
// no gimbal can be given one: pivots are put in at the exhaust, and whatever
// is put on the engine's anchor turns with them

/**
 * How far a nozzle turns one way and the other, in degrees of the part.
 */
export type VectoringLimit = { readonly min: number; readonly max: number };

/**
 * What a nozzle can do for thrust vectoring.
 */
export type Vectoring = {
  /** Its pitch limits, or null if it has none */
  readonly pitch: VectoringLimit | null;
  readonly yaw: VectoringLimit | null;

  /** `ellipse` when pitch and yaw share one round limit */
  readonly shape: "ellipse" | "box";

  /** The model's own gimbal, one put in by code, or none */
  readonly gimbal: "model" | "virtual" | null;
};

/**
 * How an engine is driven.
 */
export type EngineOptions = {
  /** The engine on this side. Left out, it takes every nozzle part there is */
  side?: SurfaceSide;

  /** Its throttle, 0 idle to 1.1 full reheat. The flight's by default */
  throttle?: (values: Readonly<FlightValues>) => number;

  /**
   * Turn the nozzle with the stick and the pedals. On when the model has a
   * gimbal. Numbers cap each axis, in degrees, within the model's limits; on
   * a model with no gimbal, they give it one with those limits (10 degrees
   * each by default)
   */
  vectoring?: boolean | { pitch?: number; yaw?: number };

  /** The pitch it vectors for, -1 to 1, nose up positive. The stick's by default */
  pitch?: (values: Readonly<FlightValues>) => number;

  /** The yaw it vectors for, -1 to 1, nose right positive. The pedals' by default */
  yaw?: (values: Readonly<FlightValues>) => number;

  /** How open the petals are at idle, military and reheat, 0 to 1 */
  nozzle?: Partial<NozzleSchedule>;

  /**
   * Where the exhaust leaves: a node, or an anchor's name. By default the
   * anchor of `fx_kind` `exhaust` on its side, or one named for the exhaust
   */
  anchor?: Object3D | string;

  /** How fast the gimbal turns, in degrees a second */
  rate?: number;

  /**
   * Called in the frame the nozzle turns, with where the exhaust points: up
   * and right of straight aft, in degrees
   */
  on_vector?: (pitch_deg: number, yaw_deg: number) => void;
};

const DEFAULT_VECTORING_DEG = 10;
const NOZZLE_CLIP = /nozzle.*open|open.*nozzle/i;
const EXHAUST = /exhaust|nozzle_exit|jet_exit/i;

/**
 * The sides with an engine of their own: those of the model's nozzle parts
 * and exhaust anchors.
 * @param rig The rig
 * @returns Each side, or one undefined for a single engine on the centre
 *   line; empty if the model has no engine
 */
export const engine_sides = (
  rig: ControlRig,
): readonly (SurfaceSide | undefined)[] => {
  const sides = new Set<SurfaceSide>();
  let any = false;

  for (const part of rig.surfaces) {
    if (!/^nozzle_/.test(part.kind)) continue;

    any = true;

    if (part.side !== "centre") sides.add(part.side);
  }

  for (const anchor of rig.anchors) {
    if (anchor.kind !== "exhaust" && !EXHAUST.test(anchor.name)) continue;

    any = true;

    if (anchor.side !== "centre") sides.add(anchor.side);
  }

  return sides.size > 0 ? [...sides] : any ? [undefined] : [];
};

/**
 * A limit, capped either way by a number of degrees.
 * @param part The part
 * @param cap The cap, if any
 * @returns Its limit
 */
const limit_of = (
  part: ControlSurface,
  cap: number | undefined,
): VectoringLimit =>
  cap === undefined
    ? { min: part.min, max: part.max }
    : {
        min: Math.max(part.min, -Math.abs(cap)),
        max: Math.min(part.max, Math.abs(cap)),
      };

/**
 * A value for a share of a limit either side of zero.
 * @param limit The limit
 * @param share -1 to 1
 * @returns The value
 */
const within = (limit: VectoringLimit, share: number): number =>
  share >= 0 ? share * Math.max(limit.max, 0) : -share * Math.min(limit.min, 0);

/**
 * A pivot put in by code, as a part.
 * @param name Its name
 * @param kind Its kind
 * @param node The pivot
 * @param side Its side
 * @param limit How far it turns
 * @param positive Which way positive goes
 * @returns The part
 */
const virtual_part = (
  name: string,
  kind: "nozzle_pitch" | "nozzle_yaw",
  node: Object3D,
  side: SurfaceSide,
  limit: VectoringLimit,
  positive: string,
): ControlSurface => ({
  name,
  kind,
  node,
  motion: "rotation",
  unit: "deg",
  scale: Math.PI / 180,
  min: limit.min,
  max: limit.max,
  rest: 0,
  side,
  group: "gimbal",
  positive,
  found_by: "virtual",
  extras: { limit_shape: "ellipse" },
  base_position: node.position.clone(),
  base_quaternion: node.quaternion.clone(),
});

/**
 * One engine on a rig: its nozzle opening with the throttle, its gimbal
 * turning with the stick and the pedals, and where its exhaust leaves.
 */
export class Engine {
  readonly rig: ControlRig;

  /** Its side, or null for one that took every nozzle */
  readonly side: SurfaceSide | null;

  /**
   * Where its plume goes: the exhaust, or the mount inside the gimbal put in
   * by code, which turns with it
   */
  readonly anchor: Object3D | null;

  /** Its nozzle's parts */
  readonly parts: {
    readonly pitch: readonly ControlSurface[];
    readonly yaw: readonly ControlSurface[];
    readonly petals: readonly ControlSurface[];
  };

  /** The model's clip that opens its nozzle, if it has one */
  readonly clip: ControlClip | null;

  /** What its nozzle can do */
  readonly vectoring: Vectoring;

  /** Everything the model says of its gimbal and its exhaust, as `limit_shape` */
  readonly extras: Readonly<Record<string, unknown>>;

  /** Its throttle, as its options say: for an afterburner to follow */
  readonly throttle: (values: Readonly<FlightValues>) => number;

  private readonly _options: EngineOptions;
  private readonly _drive: ControlDrive;
  private readonly _schedule: NozzleSchedule = default_control_mixing();
  private readonly _virtual: { pivot: Object3D; names: string[] } | null;
  private readonly _stop: () => void;
  private _pitch_deg = 0;
  private _yaw_deg = 0;
  private _turned = false;

  constructor(rig: ControlRig, options: EngineOptions = {}) {
    this.rig = rig;
    this._options = options;

    const side = options.side;
    const on_side = (of: { side: SurfaceSide }) => !side || of.side === side;

    this.side = side ?? null;
    this.throttle = (values) =>
      options.throttle ? options.throttle(values) : values.throttle;

    const pitch = rig.surfaces.filter(
      (part) => part.kind === "nozzle_pitch" && on_side(part),
    );
    const yaw = rig.surfaces.filter(
      (part) => part.kind === "nozzle_yaw" && on_side(part),
    );
    const petals = rig.surfaces.filter(
      (part) => part.kind === "nozzle_petal" && on_side(part),
    );

    // Where the exhaust leaves
    const found =
      typeof options.anchor === "string"
        ? rig.anchor(options.anchor)
        : rig.anchors.find(
            (anchor) =>
              (anchor.kind === "exhaust" || EXHAUST.test(anchor.name)) &&
              on_side(anchor),
          );
    const exhaust =
      typeof options.anchor === "object" ? options.anchor : found?.node;

    // What the nozzle can do, from the model's parts
    const caps =
      typeof options.vectoring === "object" ? options.vectoring : undefined;
    const wanted =
      options.vectoring === undefined
        ? pitch.length + yaw.length > 0
        : options.vectoring !== false;
    const model = pitch.length + yaw.length > 0;
    const ellipse = [...pitch, ...yaw].some(
      (part) => part.extras.limit_shape === "ellipse",
    );

    let pitch_limit = pitch[0] ? limit_of(pitch[0], caps?.pitch) : null;
    let yaw_limit = yaw[0] ? limit_of(yaw[0], caps?.yaw) : null;

    // A gimbal put in at the exhaust, for a model with none
    let anchor = exhaust ?? null;
    let virtual: { pivot: Object3D; names: string[] } | null = null;

    if (!model && wanted && exhaust) {
      const part_side = side ?? found?.side ?? "centre";
      const cap_p = Math.abs(caps?.pitch ?? DEFAULT_VECTORING_DEG);
      const cap_y = Math.abs(caps?.yaw ?? DEFAULT_VECTORING_DEG);

      pitch_limit = { min: -cap_p, max: cap_p };
      yaw_limit = { min: -cap_y, max: cap_y };

      const to_world = into_frame(rig.root, rig.frame).invert();
      const point = new Vector3().setFromMatrixPosition(exhaust.matrixWorld);
      const mount = new Group();

      mount.name = `${exhaust.name}_Mount`;
      exhaust.add(mount);

      // Up, so a positive turn swings the exhaust (aft) to the right, then
      // to the right, so one swings it down
      const yaw_pivot = insert_pivot(
        mount,
        point,
        new Vector3(0, 1, 0).transformDirection(to_world),
      );
      const pitch_pivot = insert_pivot(
        mount,
        point,
        new Vector3(0, 0, -1).transformDirection(to_world),
      );

      const yaw_part = virtual_part(
        `${exhaust.name}_Gimbal_Yaw`,
        "nozzle_yaw",
        yaw_pivot,
        part_side,
        yaw_limit,
        "exit_right",
      );
      const pitch_part = virtual_part(
        `${exhaust.name}_Gimbal_Pitch`,
        "nozzle_pitch",
        pitch_pivot,
        part_side,
        pitch_limit,
        "exit_down",
      );

      rig.add_surface(yaw_part);
      rig.add_surface(pitch_part);

      pitch.push(pitch_part);
      yaw.push(yaw_part);
      anchor = mount;
      virtual = {
        pivot: yaw_pivot,
        names: [yaw_part.name, pitch_part.name],
      };
    }

    this.anchor = anchor;
    this._virtual = virtual;
    this.parts = { pitch, yaw, petals };
    this.vectoring = {
      pitch: pitch_limit,
      yaw: yaw_limit,
      shape: ellipse || virtual ? "ellipse" : "box",
      gimbal: virtual ? "virtual" : model ? "model" : null,
    };
    this.extras = {
      ...found?.extras,
      ...yaw[0]?.extras,
      ...pitch[0]?.extras,
    };

    const clip =
      [...rig.clips.values()].find(
        (channel) =>
          NOZZLE_CLIP.test(channel.clip.name) &&
          (!side || name_side(channel.clip.name) === side),
      ) ?? null;

    this.clip = clip;

    const round = this.vectoring.shape === "ellipse";
    const vectors = wanted;

    // The stick's share, kept within one round limit when the nozzle has one
    const aim = (values: Readonly<FlightValues>, axis: 0 | 1) => {
      if (!vectors) return 0;

      const p = options.pitch ? options.pitch(values) : values.pitch;
      const y = options.yaw ? options.yaw(values) : values.yaw;
      const length = round ? Math.hypot(p, y) : 0;
      const scale = length > 1 ? 1 / length : 1;

      return Math.max(-1, Math.min(1, (axis === 0 ? p : y) * scale));
    };

    const parts = [...pitch, ...yaw];
    const sense = (part: ControlSurface) =>
      part.found_by === "virtual" ? 1 : sense_of(part);

    const drives = [
      rig.drive({
        parts: parts.map((part) => part.name),
        from: (values, part) =>
          part.kind === "nozzle_pitch"
            ? // Nose up wants the exhaust up, pushing the tail down
              within(pitch_limit!, -aim(values, 0) * sense(part))
            : // Nose right wants the exhaust right, pushing the tail left
              within(yaw_limit!, aim(values, 1) * sense(part)),
        get rate() {
          return options.rate;
        },
        on_move: (value, part) => {
          if (part !== pitch[0] && part !== yaw[0]) return;

          if (part.kind === "nozzle_pitch") {
            this._pitch_deg = -value * sense(part);
          } else {
            this._yaw_deg = value * sense(part);
          }

          this._turned = true;
        },
      }),
      rig.drive({
        parts: petals.map((part) => part.name),
        from: (values, part) => travel(part, this.opening(values)),
      }),
    ];

    if (clip) {
      drives.push(
        rig.drive_clip({
          clip: clip.clip.name,
          from: (values) => this.opening(values),
        }),
      );
    }

    this._drive = combine_drives(drives);

    // Once a frame however many of its parts moved
    this._stop = rig.on_moved(() => {
      if (!this._turned) return;

      this._turned = false;
      options.on_vector?.(this._pitch_deg, this._yaw_deg);
    });
  }

  /** Where the exhaust points now, up of straight aft, in degrees */
  get pitch_deg(): number {
    return this._pitch_deg;
  }

  /** Where the exhaust points now, right of straight aft, in degrees */
  get yaw_deg(): number {
    return this._yaw_deg;
  }

  /**
   * How open the nozzle should be.
   * @param values The flight's values
   * @returns 0 to 1
   */
  private opening(values: Readonly<FlightValues>): number {
    const schedule = this._schedule;
    const nozzle = this._options.nozzle;

    schedule.nozzle_idle = nozzle?.nozzle_idle ?? 0.45;
    schedule.nozzle_military = nozzle?.nozzle_military ?? 0;
    schedule.nozzle_reheat = nozzle?.nozzle_reheat ?? 1;

    return nozzle_opening(this.throttle(values), schedule);
  }

  /** Read its options again */
  refresh() {
    this._drive.refresh();
  }

  /** Stop driving it, and take out a gimbal put in by code */
  dispose() {
    this._stop();
    this._drive.dispose();

    if (this._virtual) {
      for (const name of this._virtual.names) this.rig.remove_surface(name);

      this._virtual.pivot.removeFromParent();
    }
  }
}

/**
 * Drive an engine on a rig.
 * @param rig The rig
 * @param options Which engine, and how
 * @returns The engine
 */
export const add_engine = (rig: ControlRig, options: EngineOptions = {}) =>
  new Engine(rig, options);
