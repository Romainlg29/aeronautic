import { canonical_frame, type CaptureFrame } from "@aeronautic/core";
import {
  Group,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";

// Finding what moves on a model
//
// Two ways, the first that answers wins. A rigged model says it outright: a
// `CTRL_` node under a `HINGE_` node, its glTF extras giving the kind of
// motion, the axis (always its local X), the limits, the pose it rests in and
// which way is positive, as `trailing_edge_down` or `open`. A model with no
// rig only has names, `Elevon_L` or `rudder.001`: the surface is found by its
// name, its hinge is fitted to its geometry in the aircraft's frame, and a
// pivot is put in above it so it turns about that hinge
//
// Either way, a positive value moves a surface the way its kind says:
// trailing edge down, leading edge down, trailing edge right, open, retract

/**
 * What a moving part is, for the mixer to know what drives it.
 */
export type SurfaceKind =
  | "aileron"
  | "elevator"
  | "elevon"
  | "stabilator"
  | "canard"
  | "rudder"
  | "flap"
  | "le_flap"
  | "airbrake"
  | "spoiler"
  | "drag_rudder"
  | "nozzle_pitch"
  | "nozzle_yaw"
  | "nozzle_petal"
  | "gear"
  | "gear_door"
  | "gear_lever"
  | "stick_pitch"
  | "stick_roll"
  | "pedal"
  | "throttle_lever"
  | "other";

/**
 * Which side of the aircraft a part is on.
 */
export type SurfaceSide = "left" | "right" | "centre";

/**
 * One moving part.
 *
 * Its value is in its own unit: degrees for a rotation, metres for a
 * translation, a share for a `normalized` lever. Positive is the way
 * `positive` says.
 */
export type ControlSurface = {
  /** The node's name, as the model has it */
  readonly name: string;

  readonly kind: SurfaceKind;

  /** The node that moves: the `CTRL_` node, or the pivot put in above a mesh */
  readonly node: Object3D;

  /** Turned about, or slid along, the node's local X */
  readonly motion: "rotation" | "translation";

  /** `deg`, `m` or `normalized` */
  readonly unit: string;

  /** Radians or metres per unit */
  readonly scale: number;

  readonly min: number;
  readonly max: number;

  /** The value it is posed at when found */
  readonly rest: number;

  readonly side: SurfaceSide;

  /** The rig's group, as `elevons` or `gear_doors`, or the kind's name */
  readonly group: string;

  /** What a positive value does, as `trailing_edge_down` */
  readonly positive: string;

  /** How it was found: from the rig, by its name, or added by code */
  readonly foundBy: "rig" | "name" | "virtual";

  /** Anything else the rig's extras gave it, as `ab_detent` */
  readonly extras: Readonly<Record<string, unknown>>;

  /** The pose at zero, which values are measured from */
  readonly basePosition: Vector3;
  readonly baseQuaternion: Quaternion;
};

/**
 * How `find_surfaces` looks.
 */
export type FindSurfacesOptions = CaptureFrame & {
  /** Read `CTRL_` nodes' extras. On by default */
  rig?: boolean;

  /**
   * Find surfaces by their names when there is no rig for them, fitting a
   * hinge and putting a pivot in. On by default. It changes the scene graph
   */
  names?: boolean;

  /** Only consider nodes this keeps */
  filter?: (node: Object3D) => boolean;
};

const DEG = Math.PI / 180;

// The kinds, by name. First match wins, so the specific before the general:
// a drag rudder is not a rudder, an elevon not an elevator, a leading-edge
// flap not a flap
const KIND_NAMES: [RegExp, SurfaceKind][] = [
  [/nozzle.*pitch/i, "nozzle_pitch"],
  [/nozzle.*yaw/i, "nozzle_yaw"],
  [/nozzle.*(petal|flap)|petal/i, "nozzle_petal"],
  [/drag.?rudder|split.?rudder|deceleron|clamshell/i, "drag_rudder"],
  [/elevon/i, "elevon"],
  [/stabilator|taileron|all.?moving/i, "stabilator"],
  [/canard|foreplane/i, "canard"],
  [/aileron|flaperon/i, "aileron"],
  [/elevator/i, "elevator"],
  [/rudder/i, "rudder"],
  [/le.?flap|leading.?edge.?flap|lef(_|\b)|slat/i, "le_flap"],
  [/flap/i, "flap"],
  [/air.?brake|speed.?brake/i, "airbrake"],
  [/spoiler/i, "spoiler"],
  [/wheel|steer|tyre|tire/i, "other"],
  [/gear.*door|door.*gear/i, "gear_door"],
  [/lever.*gear|gear.*lever/i, "gear_lever"],
  [/gear(?!.*(wheel|steer))/i, "gear"],
  [/stick.*pitch/i, "stick_pitch"],
  [/stick.*roll/i, "stick_roll"],
  [/pedal/i, "pedal"],
  [/throttle(?!.*(btn|button|hat|grip))/i, "throttle_lever"],
];

// Kinds a model with no rig is searched for by name: the ones whose hinge can
// be fitted to a flat panel
const NAMED_KINDS = new Set<SurfaceKind>([
  "aileron",
  "elevator",
  "elevon",
  "stabilator",
  "canard",
  "rudder",
  "flap",
  "le_flap",
  "airbrake",
  "spoiler",
  "drag_rudder",
]);

// Fixed structure named after what moves in it: an air brake's well, a
// flap's track, a rudder's actuator fairing
const FIXED_NAMES =
  /well|bay|recess|cavity|seal|fairing|housing|track|actuator|mount|hinge|pod|light|antenna/i;

// What a positive value does for a part found by name
const NAMED_POSITIVE: Partial<Record<SurfaceKind, string>> = {
  rudder: "trailing_edge_right",
  le_flap: "leading_edge_down",
  airbrake: "open",
  spoiler: "open",
  drag_rudder: "open",
};

// The limits of a part found by name, in degrees
const NAMED_LIMITS: Partial<Record<SurfaceKind, [number, number]>> = {
  aileron: [-25, 25],
  elevator: [-25, 25],
  elevon: [-30, 30],
  stabilator: [-25, 25],
  canard: [-25, 25],
  rudder: [-30, 30],
  flap: [0, 40],
  le_flap: [-3, 25],
  airbrake: [0, 60],
  spoiler: [0, 60],
  drag_rudder: [0, 50],
};

/**
 * What kind of part a name is.
 * @param name The node's name, and its rig group if it has one
 * @returns The kind, or `other`
 */
export const surface_kind = (name: string): SurfaceKind => {
  for (const [pattern, kind] of KIND_NAMES) {
    if (pattern.test(name)) {
      return kind;
    }
  }

  return "other";
};

/**
 * Which side a name says a part is on.
 * @param name The node's name
 * @returns The side, or null when the name doesn't say
 */
export const name_side = (name: string): SurfaceSide | null => {
  if (/(^|[^a-z])(l|left|port)([^a-z]|$)/i.test(name)) return "left";
  if (/(^|[^a-z])(r|right|starboard|stbd)([^a-z]|$)/i.test(name)) {
    return "right";
  }

  if (/(^|[^a-z])(c|centre|center)([^a-z]|$)/i.test(name)) return "centre";

  return null;
};

/**
 * Whether a node is under one already found, or is one.
 * @param node The node
 * @param taken The nodes found so far
 * @returns Whether it is
 */
const under = (node: Object3D, taken: Set<Object3D>): boolean => {
  for (let at: Object3D | null = node; at; at = at.parent) {
    if (taken.has(at)) return true;
  }

  return false;
};

/**
 * Whether a node holds one already found below it.
 * @param node The node
 * @param taken The nodes found so far
 * @returns Whether it does
 */
const holds = (node: Object3D, taken: Set<Object3D>): boolean => {
  let found = false;

  node.traverse((child) => {
    if (child !== node && taken.has(child)) found = true;
  });

  return found;
};

/**
 * The aircraft's frame, as a matrix from world space into it.
 * @param root The model
 * @param frame Which way it faces
 * @returns World to the canonical frame: x aft, y up, z left
 */
export const into_frame = (root: Object3D, frame: CaptureFrame): Matrix4 =>
  new Matrix4()
    .multiplyMatrices(root.matrixWorld, canonical_frame(frame))
    .invert();

/**
 * Every vertex under a node, in the aircraft's frame.
 * @param node The node
 * @param into World to the aircraft's frame
 * @returns The points
 */
const vertices = (node: Object3D, into: Matrix4): Vector3[] => {
  const points: Vector3[] = [];
  const to = new Matrix4();

  node.traverse((child) => {
    const mesh = child as Mesh;
    const position = mesh.isMesh
      ? mesh.geometry?.getAttribute("position")
      : undefined;

    if (!position) return;

    to.multiplyMatrices(into, mesh.matrixWorld);

    // Enough to fit a hinge to, however dense the mesh
    const step = Math.max(1, Math.floor(position.count / 4000));

    for (let index = 0; index < position.count; index += step) {
      points.push(
        new Vector3().fromBufferAttribute(position, index).applyMatrix4(to),
      );
    }
  });

  return points;
};

/**
 * The principal axis of a cloud of points.
 * @param points The points
 * @param centre Their centroid
 * @returns The unit direction they spread along the most
 */
const principal_axis = (points: Vector3[], centre: Vector3): Vector3 => {
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;

  for (const point of points) {
    const x = point.x - centre.x;
    const y = point.y - centre.y;
    const z = point.z - centre.z;

    xx += x * x;
    xy += x * y;
    xz += x * z;
    yy += y * y;
    yz += y * z;
    zz += z * z;
  }

  // Power iteration: the covariance's largest eigenvector
  const axis = new Vector3(1, 1, 1).normalize();
  const next = new Vector3();

  for (let step = 0; step < 64; step++) {
    next.set(
      xx * axis.x + xy * axis.y + xz * axis.z,
      xy * axis.x + yy * axis.y + yz * axis.z,
      xz * axis.x + yz * axis.y + zz * axis.z,
    );

    if (next.lengthSq() === 0) break;

    axis.copy(next.normalize());
  }

  return axis;
};

/**
 * A hinge line fitted to a flat panel: along its span, through its forward
 * edge for a trailing-edge surface, its aft edge for a leading-edge one.
 * @param points The panel's vertices, in the aircraft's frame
 * @param leading Whether it hangs off a leading edge
 * @returns A point on the hinge and its direction, in the aircraft's frame
 */
export const fit_hinge = (
  points: Vector3[],
  leading = false,
): { point: Vector3; axis: Vector3 } => {
  const centre = new Vector3();

  for (const point of points) centre.add(point);

  centre.divideScalar(Math.max(points.length, 1));

  const span = principal_axis(points, centre);

  // The chord: aft, square to the span
  const chord = new Vector3(1, 0, 0).addScaledVector(span, -span.x);

  if (chord.lengthSq() < 1e-6) {
    chord.set(0, 1, 0).addScaledVector(span, -span.y);
  }

  chord.normalize();

  // Along the span in bins, the edge point of each: its most forward, or its
  // most aft
  const BINS = 12;

  let low = Infinity;
  let high = -Infinity;

  for (const point of points) {
    const along = point.dot(span);

    low = Math.min(low, along);
    high = Math.max(high, along);
  }

  const width = (high - low) / BINS || 1;
  const edge: (Vector3 | undefined)[] = new Array(BINS);

  for (const point of points) {
    const bin = Math.min(BINS - 1, Math.floor((point.dot(span) - low) / width));
    const held = edge[bin];
    const at = point.dot(chord);

    if (!held || (leading ? at > held.dot(chord) : at < held.dot(chord))) {
      edge[bin] = point;
    }
  }

  const line = edge.filter((point): point is Vector3 => point !== undefined);

  if (line.length < 2) {
    return { point: centre, axis: span };
  }

  const middle = new Vector3();

  for (const point of line) middle.add(point);

  middle.divideScalar(line.length);

  // The edge's own direction, kept to the span's sense
  const axis = principal_axis(line, middle);

  if (axis.dot(span) < 0) axis.negate();

  return { point: middle, axis };
};

/**
 * The way a positive turn of a found-by-name part must move a point of it,
 * in the aircraft's frame.
 * @param kind What it is
 * @param name Its name, for a split surface's halves
 * @param vertical Whether its hinge stands up, as a rudder's
 * @returns The direction
 */
const positive_direction = (
  kind: SurfaceKind,
  name: string,
  vertical: boolean,
): Vector3 => {
  if (kind === "rudder" || (vertical && kind !== "le_flap")) {
    // Trailing edge right; +z is left
    return new Vector3(0, 0, -1);
  }

  if (kind === "airbrake" || kind === "spoiler" || kind === "drag_rudder") {
    return new Vector3(0, /lower|bottom|under/i.test(name) ? -1 : 1, 0);
  }

  // Trailing edge down, or for a leading-edge flap, its leading edge down
  return new Vector3(0, -1, 0);
};

/**
 * Put a pivot in above a node, at a hinge, so it turns about it.
 * @param node The node
 * @param point The hinge, in world space
 * @param axis Its direction, in world space
 * @returns The pivot, its local X along the hinge
 */
export const insert_pivot = (
  node: Object3D,
  point: Vector3,
  axis: Vector3,
): Group => {
  const parent = node.parent!;
  const pivot = new Group();

  pivot.name = `HINGE_auto_${node.name}`;

  parent.updateWorldMatrix(true, false);

  const parent_rotation = new Quaternion();

  parent.matrixWorld.decompose(new Vector3(), parent_rotation, new Vector3());

  pivot.position.copy(parent.worldToLocal(point.clone()));
  pivot.quaternion.setFromUnitVectors(
    new Vector3(1, 0, 0),
    axis.clone().applyQuaternion(parent_rotation.invert()).normalize(),
  );

  parent.add(pivot);
  pivot.updateMatrixWorld(true);
  pivot.attach(node);

  return pivot;
};

/**
 * Read a rig's number, or a default.
 * @param value What the extras hold
 * @param fallback What to use if it is not a number
 * @returns The number
 */
const number_or = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Which side a part is on, from its name, or else from where it sits.
 * @param name Its name
 * @param node The node
 * @param into World to the aircraft's frame
 * @returns The side
 */
const side_of = (name: string, node: Object3D, into: Matrix4): SurfaceSide => {
  const named = name_side(name);

  if (named) return named;

  const z = new Vector3()
    .setFromMatrixPosition(node.matrixWorld)
    .applyMatrix4(into).z;

  return Math.abs(z) < 0.05 ? "centre" : z > 0 ? "left" : "right";
};

/**
 * Find every moving part on a model.
 *
 * The rig's `CTRL_` nodes first, then, for what they don't cover, panels
 * found by their names, each given a pivot at a hinge fitted to it. Every
 * part is posed at its `rest`.
 * @param root The model
 * @param options Which way it faces, and how to look
 * @returns The parts
 */
export const find_surfaces = (
  root: Object3D,
  options: FindSurfacesOptions = {},
): ControlSurface[] => {
  const { rig = true, names = true, filter } = options;

  root.updateWorldMatrix(true, true);

  const into = into_frame(root, options);
  const found: ControlSurface[] = [];
  const taken = new Set<Object3D>();

  if (rig) {
    root.traverse((node) => {
      const extras = node.userData as Record<string, unknown>;
      const type = extras.ctrl_type;

      if (type !== "rotation" && type !== "translation") return;
      if (filter && !filter(node)) return;

      const unit = typeof extras.unit === "string" ? extras.unit : "deg";
      const group = typeof extras.group === "string" ? extras.group : "";
      const motion = type;

      const scale =
        motion === "translation"
          ? 1
          : unit === "normalized"
            ? number_or(extras.deg_per_unit, 1) * DEG
            : unit === "rad"
              ? 1
              : DEG;

      const {
        name: _name,
        ctrl_type: _type,
        axis: _axis,
        unit: _unit,
        min: _min,
        max: _max,
        rest: _rest,
        group: _group,
        positive: _positive,
        ...rest_of
      } = extras;

      found.push({
        name: node.name,
        kind: surface_kind(`${node.name} ${group}`),
        node,
        motion,
        unit,
        scale,
        min: number_or(extras.min, -Infinity),
        max: number_or(extras.max, Infinity),
        rest: number_or(extras.rest, 0),
        side: side_of(node.name, node, into),
        group,
        positive: typeof extras.positive === "string" ? extras.positive : "",
        foundBy: "rig",
        extras: rest_of,
        basePosition: node.position.clone(),
        baseQuaternion: node.quaternion.clone(),
      });

      taken.add(node);
    });
  }

  if (names) {
    const candidates: { node: Object3D; kind: SurfaceKind }[] = [];

    root.traverse((node) => {
      if (node === root || !node.parent) return;
      if (filter && !filter(node)) return;

      const kind = surface_kind(node.name);

      if (!NAMED_KINDS.has(kind)) return;

      // The outermost node of a name, none of a rig's own, and none inside
      // or around a rigged part
      if (/^(HINGE|CTRL)_/.test(node.name) || FIXED_NAMES.test(node.name)) {
        return;
      }

      if (under(node, taken) || holds(node, taken)) return;

      candidates.push({ node, kind });
      taken.add(node);
    });

    const world = new Matrix4().copy(into).invert();

    for (const { node, kind } of candidates) {
      const points = vertices(node, into);

      if (points.length < 3) continue;

      const leading = kind === "le_flap";
      const hinge = fit_hinge(points, leading);
      const vertical = Math.abs(hinge.axis.y) > 0.7;

      // Turn it so a positive turn moves the panel's far edge the way its
      // kind says
      const far = new Vector3();

      for (const point of points) far.add(point);

      far.divideScalar(points.length).sub(hinge.point);
      far.addScaledVector(hinge.axis, -far.dot(hinge.axis));

      const moves = new Vector3().crossVectors(hinge.axis, far);
      const wanted = positive_direction(kind, node.name, vertical);

      if (moves.dot(wanted) < 0) hinge.axis.negate();

      const point = hinge.point.clone().applyMatrix4(world);
      const axis = hinge.axis.clone().transformDirection(world);
      const pivot = insert_pivot(node, point, axis);
      const [min, max] = NAMED_LIMITS[kind] ?? [-30, 30];

      found.push({
        name: node.name,
        kind,
        node: pivot,
        motion: "rotation",
        unit: "deg",
        scale: DEG,
        min,
        max,
        rest: 0,
        side: side_of(node.name, pivot, into),
        group: kind,
        positive: NAMED_POSITIVE[kind] ?? "trailing_edge_down",
        foundBy: "name",
        extras: {},
        basePosition: pivot.position.clone(),
        baseQuaternion: pivot.quaternion.clone(),
      });
    }
  }

  for (const surface of found) {
    pose_surface(surface, surface.rest);
  }

  return found;
};

const X = new Vector3(1, 0, 0);
const scratch_axis = new Vector3();
const scratch_turn = new Quaternion();

/**
 * Pose a part at a value, from its pose at zero.
 * @param surface The part
 * @param value In its own unit, positive the way it says
 */
export const pose_surface = (surface: ControlSurface, value: number) => {
  const node = surface.node;

  if (surface.motion === "rotation") {
    scratch_turn.setFromAxisAngle(X, value * surface.scale);
    node.quaternion.multiplyQuaternions(surface.baseQuaternion, scratch_turn);
  } else {
    scratch_axis.copy(X).applyQuaternion(surface.baseQuaternion);
    node.position
      .copy(surface.basePosition)
      .addScaledVector(scratch_axis, value * surface.scale);
  }
};

/**
 * A point a model marks for an effect: an exhaust, a gun's muzzle, a wingtip.
 */
export type ControlAnchor = {
  /** The node's name, as `FX_Exhaust_L` */
  readonly name: string;

  /** Its `fx_kind`, as `exhaust`, or else its name after `FX_`, lower case */
  readonly kind: string;

  readonly side: SurfaceSide;

  readonly node: Object3D;

  /** Everything else its extras say, as a gun's `rate_rpm_hint` */
  readonly extras: Readonly<Record<string, unknown>>;
};

/**
 * Find the points a model marks for effects: nodes with an `fx_kind` extra,
 * or named `FX_`.
 * @param root The model
 * @param options Which way it faces, and which nodes to consider
 * @returns The anchors, in the order found
 */
export const find_anchors = (
  root: Object3D,
  options: FindSurfacesOptions = {},
): ControlAnchor[] => {
  root.updateWorldMatrix(true, true);

  const into = into_frame(root, options);
  const found: ControlAnchor[] = [];

  root.traverse((node) => {
    const extras = node.userData as Record<string, unknown>;
    const marked = typeof extras.fx_kind === "string";

    if (!marked && !/^FX_/.test(node.name)) return;
    if (options.filter && !options.filter(node)) return;

    const { fx_kind: _kind, name: _name, ...rest_of } = extras;
    const kind = marked
      ? (extras.fx_kind as string)
      : node.name
          .slice(3)
          .replace(/[._]?(L|R|C|Left|Right|Centre|Center)?(\.\d+)?$/, "")
          .replace(/(?<=[a-z])(?=[A-Z])/g, "_")
          .toLowerCase();

    found.push({
      name: node.name,
      kind,
      side: side_of(node.name, node, into),
      node,
      extras: rest_of,
    });
  });

  return found;
};
