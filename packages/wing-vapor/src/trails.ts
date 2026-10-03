import { Quaternion, Vector3 } from "three";
import { VORTEX_SPACING } from "./aerodynamics";

// Where the tip vortices are, laid in the air the aircraft flew through
//
// A vortex is shed into the air and stays there, sinking slowly, while the
// aircraft flies on. So a trail is not a line out of the tip but the tip's
// own path through the air: straight in level flight, a curve in a turn and a
// corkscrew in a roll. The air, not the world, is what it is laid in: the
// path is the aircraft's attitude every frame and its airspeed along its
// flight path, integrated, so a model held still in a showcase trails the
// same as one flown through a game's world
//
// Each frame the trails are laid back along that history and handed to the
// shader as two polylines in the aircraft's current frame, `TRAIL_POINTS`
// apiece at even distances along the air

// Points along each trail
export const TRAIL_POINTS = 64;

// The most frames of history kept: seconds at any frame rate a trail lasts
const MAX_SAMPLES = 1024;

// A gap longer than this, a tab in the background, and the history starts
// again rather than drawing the gap as a straight line
const MAX_GAP_S = 2;

// The longest one sample of history may stand for. A slow frame is split
// into steps this long, the attitude turned evenly from the frame before:
// a roll at a few hundred degrees a second still corkscrews smoothly at ten
// frames a second
const MAX_STEP_S = 1 / 30;

/**
 * Both trails' centrelines, in the aircraft's canonical frame now: x aft,
 * y up, z out along a wing. Point k is `k * spacing_m` along the air from the
 * tip's trailing edge.
 */
export type TrailPaths = {
  // Three floats a point. `positive` trails the tip at +z, `negative` the other
  positive: Float32Array;
  negative: Float32Array;

  // How far along the air one point is from the next
  spacing_m: number;
};

/**
 * How the trails are laid, the same for every point.
 */
export type TrailLayout = {
  // Where the tip's trailing edge is, and its height, in the canonical frame
  tip_x: number;
  tip_y: number;
  semispan_m: number;

  // The free stream's direction in the canonical frame
  cos_alpha: number;
  sin_alpha: number;

  // And its sideways component, from a sideslip
  flow_z: number;

  // How far the vortex sinks, per metre of air, and how long it takes to
  // roll up inboard
  descent: number;
  rollup_m: number;

  // How long the trail is
  length_m: number;
};

/**
 * Where a vortex is, at a distance along the air from its tip, in the frame
 * the aircraft had when it shed it: sunk under its downwash and rolled
 * inboard towards π/4 of the span.
 * @param layout The layout
 * @param along Metres of air since it was shed
 * @param side +1 or -1, which tip
 * @param target Where to write it
 * @returns target
 */
const shed_offset = (
  layout: TrailLayout,
  along: number,
  side: number,
  target: Vector3,
): Vector3 => {
  const rolled = 1 - Math.exp(-along / Math.max(layout.rollup_m, 1e-3));

  return target.set(
    layout.tip_x,
    layout.tip_y - along * layout.descent,
    side * layout.semispan_m * (1 - (1 - VORTEX_SPACING) * rolled),
  );
};

/**
 * Trails for steady flight, with no history: straight back along the free
 * stream. What the field is drawn with before any frame has been flown, and
 * what a history comes to when the aircraft holds its attitude.
 * @param layout The layout
 * @returns The trails
 */
export const straight_trails = (layout: TrailLayout): TrailPaths => {
  const spacing_m = layout.length_m / (TRAIL_POINTS - 1);

  const lay = (side: number) => {
    const points = new Float32Array(TRAIL_POINTS * 3);
    const point = new Vector3();

    for (let index = 0; index < TRAIL_POINTS; index++) {
      const along = index * spacing_m;

      shed_offset(layout, along, side, point);

      // The air the vortex was shed into has gone aft, along the stream
      point.x += along * layout.cos_alpha;
      point.y += along * layout.sin_alpha;
      point.z += along * layout.flow_z;
      point.toArray(points, index * 3);
    }

    return points;
  };

  return { positive: lay(1), negative: lay(-1), spacing_m };
};

/**
 * One frame of the aircraft's flight through the air.
 */
type Sample = {
  // Where it was in the air, metres, in world axes
  position: Vector3;

  // How its canonical frame was turned in the world
  attitude: Quaternion;

  // How far it had flown through the air, metres
  flown: number;
};

/**
 * The aircraft's path through the air, frame by frame.
 */
export class TrailHistory {
  private _samples: Sample[] = [];
  private readonly _position = new Vector3();
  private _flown = 0;

  /** Forget everything: the next frame starts a new trail */
  reset() {
    this._samples = [];
    this._flown = 0;
    this._position.set(0, 0, 0);
  }

  /**
   * Fly one frame.
   * @param delta_s How long the frame was, in seconds
   * @param attitude How the canonical frame is turned in the world now
   * @param airspeed_m_s How fast it flies through the air
   * @param cos_alpha The free stream's direction in the canonical frame
   * @param sin_alpha And its upward component
   * @param keep_m How much air of trail to keep
   * @param flow_z The free stream's sideways component, from a sideslip
   */
  advance(
    delta_s: number,
    attitude: Quaternion,
    airspeed_m_s: number,
    cos_alpha: number,
    sin_alpha: number,
    keep_m: number,
    flow_z = 0,
  ) {
    if (delta_s > MAX_GAP_S) {
      this.reset();
    }

    const previous = this._samples[this._samples.length - 1];
    const step_s = Math.max(delta_s, 0);
    const steps = previous
      ? Math.min(Math.max(Math.ceil(step_s / MAX_STEP_S), 1), 120)
      : 1;

    for (let step = 1; step <= steps; step++) {
      // Turned evenly from the last frame's attitude to this one's
      const turned = previous
        ? scratch_turned.slerpQuaternions(
            previous.attitude,
            attitude,
            step / steps,
          )
        : scratch_turned.copy(attitude);

      // The aircraft flies against the free stream: forward and down from
      // its nose by the angle of attack
      const velocity = scratch_vector
        .set(-cos_alpha, -sin_alpha, -flow_z)
        .applyQuaternion(turned)
        .multiplyScalar(airspeed_m_s);

      this._position.addScaledVector(velocity, step_s / steps);
      this._flown += (airspeed_m_s * step_s) / steps;

      const last = this._samples[this._samples.length - 1];

      // Nothing has moved: the last sample stands for this frame too
      if (last && this._flown - last.flown < 1e-6) {
        last.attitude.copy(turned);
        continue;
      }

      this._samples.push({
        position: this._position.clone(),
        attitude: turned.clone(),
        flown: this._flown,
      });
    }

    // Older than the trail is long, but one, so the end always has a sample
    // behind it to lay from
    while (
      this._samples.length > 2 &&
      (this._flown - this._samples[1].flown > keep_m ||
        this._samples.length > MAX_SAMPLES)
    ) {
      this._samples.shift();
    }
  }

  /**
   * Lay both trails back along the history, in the canonical frame now.
   * Past what the history covers they carry on straight, along the free
   * stream of the oldest frame.
   * @param layout The layout
   * @returns The trails
   */
  paths(layout: TrailLayout): TrailPaths {
    const samples = this._samples;

    if (samples.length < 2) {
      return straight_trails(layout);
    }

    const now = samples[samples.length - 1];
    const into_now = scratch_inverse.copy(now.attitude).invert();
    const spacing_m = layout.length_m / (TRAIL_POINTS - 1);

    const lay = (side: number) => {
      const points = new Float32Array(TRAIL_POINTS * 3);
      let older = samples.length - 1;

      for (let index = 0; index < TRAIL_POINTS; index++) {
        const along = index * spacing_m;
        const flown = now.flown - along;

        // The two frames either side of when this air was passed through
        while (older > 0 && samples[older].flown > flown) {
          older--;
        }

        const before = samples[older];
        const after = samples[Math.min(older + 1, samples.length - 1)];

        const span = after.flown - before.flown;
        const t =
          span > 1e-6
            ? Math.min(Math.max((flown - before.flown) / span, 0), 1)
            : 0;

        const attitude = scratch_attitude.slerpQuaternions(
          before.attitude,
          after.attitude,
          t,
        );

        const where = scratch_where.lerpVectors(
          before.position,
          after.position,
          t,
        );

        // Past the oldest frame: straight on, back along its flight path
        const beyond = Math.max(before.flown - flown, 0);

        if (beyond > 0) {
          where.addScaledVector(
            scratch_vector
              .set(layout.cos_alpha, layout.sin_alpha, layout.flow_z)
              .applyQuaternion(before.attitude),
            beyond,
          );
        }

        // The vortex where the tip left it, in the air, then into the frame
        // the aircraft has now
        const point = shed_offset(layout, along, side, scratch_point)
          .applyQuaternion(attitude)
          .add(where)
          .sub(now.position)
          .applyQuaternion(into_now);

        point.toArray(points, index * 3);
      }

      return points;
    };

    return { positive: lay(1), negative: lay(-1), spacing_m };
  }
}

/**
 * A point of a trail, between its points.
 * @param points The trail's points
 * @param spacing_m How far apart they are
 * @param along How far along it, metres
 * @param target Where to write it
 * @returns target
 */
export const trail_point = (
  points: Float32Array,
  spacing_m: number,
  along: number,
  target: Vector3,
): Vector3 => {
  const position = Math.min(
    Math.max(along / Math.max(spacing_m, 1e-6), 0),
    TRAIL_POINTS - 1,
  );
  const index = Math.min(Math.floor(position), TRAIL_POINTS - 2);
  const t = position - index;

  return target.set(
    points[index * 3] + (points[index * 3 + 3] - points[index * 3]) * t,
    points[index * 3 + 1] + (points[index * 3 + 4] - points[index * 3 + 1]) * t,
    points[index * 3 + 2] + (points[index * 3 + 5] - points[index * 3 + 2]) * t,
  );
};

/**
 * The nearest point of a trail to a point, as how far along the trail.
 *
 * Projected onto the straight trail first, then twice onto the trail's own
 * tangent: a trail bends slowly against the width it fogs, so two steps find
 * the nearest point wherever it can matter. The shader does the same.
 * @param points The trail's points
 * @param spacing_m How far apart they are
 * @param layout Which way the stream runs
 * @param x The point
 * @param y And its second coordinate
 * @param z And its third
 * @returns How far along the trail, metres; negative is ahead of its start
 */
export const nearest_along = (
  points: Float32Array,
  spacing_m: number,
  layout: Pick<TrailLayout, "cos_alpha" | "sin_alpha" | "flow_z">,
  x: number,
  y: number,
  z: number,
): number => {
  const length_m = spacing_m * (TRAIL_POINTS - 1);

  // Onto the free stream from the trail's start, the tip's trailing edge
  let along =
    (x - points[0]) * layout.cos_alpha +
    (y - points[1]) * layout.sin_alpha +
    (z - points[2]) * layout.flow_z;

  if (along < 0) {
    return along;
  }

  for (let step = 0; step < 2; step++) {
    const here = Math.min(along, length_m);
    const at = trail_point(points, spacing_m, here, scratch_a);
    const next = trail_point(
      points,
      spacing_m,
      Math.min(here + spacing_m, length_m),
      scratch_b,
    );
    const tangent = next.sub(at);
    const length = tangent.length();

    if (length < 1e-6) {
      break;
    }

    tangent.divideScalar(length);
    along = Math.max(
      here +
        (x - at.x) * tangent.x +
        (y - at.y) * tangent.y +
        (z - at.z) * tangent.z,
      0,
    );
  }

  return along;
};

const scratch_vector = new Vector3();
const scratch_where = new Vector3();
const scratch_point = new Vector3();
const scratch_a = new Vector3();
const scratch_b = new Vector3();
const scratch_attitude = new Quaternion();
const scratch_turned = new Quaternion();
const scratch_inverse = new Quaternion();
