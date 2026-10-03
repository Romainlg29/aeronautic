import type { VaporAirframe } from "./types";

// The wing as a table, station by station out along the span
//
// Every station has its leading edge, its chord, the height of its mid-plane,
// its thickness and how much of the lift it carries. A trapezoid is one way to
// fill the table; six depth views of a model are another. Either way the
// pressure field reads the same table, so any planform the views can see, a
// cranked delta or a wing with a strake, flies the same physics
//
// The stations run from the centreline to the tip. Inboard of where the wing
// meets the body they hold the wing carried on through it, the theoretical
// root, as lift is conventionally referred

// Stations from the centreline to the tip
export const SHAPE_STATIONS = 64;

// Horseshoe vortices per side in the lattice
const LATTICE_PANELS = 24;

/**
 * One wing, station by station. Each array has `SHAPE_STATIONS` entries,
 * station k being `k / (SHAPE_STATIONS - 1)` of the semispan out.
 */
export type WingShape = {
  // Centreline to tip, metres
  semispan_m: number;

  // Where the wing leaves the body
  root_span_m: number;

  // Where the leading edge is, how far aft of the origin
  leading_m: Float32Array;

  chord_m: Float32Array;

  // How high the mid-plane is above the origin
  mid_m: Float32Array;

  // Thickness over chord
  thickness: Float32Array;

  // The spanwise loading c_l c over its mean across the semispan: an
  // elliptic wing's is 4/π √(1 - η²)
  loading: Float32Array;

  // A canard ahead of the wing or a tailplane behind it, if the capture
  // found one: its own tips shed their own vortices
  secondary?: SecondarySurface | null;
};

/**
 * A second lifting surface, as the vapour sees it: where its tips are and
 * how big it is.
 */
export type SecondarySurface = {
  // Ahead of the wing, and lifting hard; or behind it, trimming lightly
  kind: "canard" | "tail";

  // Centreline to its tip
  semispan_m: number;

  // Its tip's leading edge, chord and height
  tip_leading_m: number;
  tip_chord_m: number;
  tip_height_m: number;

  // Both sides, through the body
  area_m2: number;
};

/**
 * One station of a wing, interpolated.
 */
export type WingStation = {
  leading_m: number;
  chord_m: number;
  mid_m: number;
  thickness: number;
  loading: number;
};

/**
 * A wing at one distance out from the centreline, between its stations.
 * @param shape The wing
 * @param span How far out, metres; folded
 * @returns The station
 */
export const shape_station = (shape: WingShape, span: number): WingStation => {
  const along =
    (Math.min(Math.abs(span) / shape.semispan_m, 1) * (SHAPE_STATIONS - 1)) | 0;
  const next = Math.min(along + 1, SHAPE_STATIONS - 1);
  const t = Math.min(
    Math.max(
      (Math.abs(span) / shape.semispan_m) * (SHAPE_STATIONS - 1) - along,
      0,
    ),
    1,
  );

  const lerp = (values: Float32Array) =>
    values[along] + (values[next] - values[along]) * t;

  return {
    leading_m: lerp(shape.leading_m),
    chord_m: lerp(shape.chord_m),
    mid_m: lerp(shape.mid_m),
    thickness: lerp(shape.thickness),
    loading: lerp(shape.loading),
  };
};

/**
 * How far out a station is.
 * @param shape The wing
 * @param station Which, 0 to `SHAPE_STATIONS - 1`
 * @returns Metres from the centreline
 */
export const station_span = (shape: WingShape, station: number): number =>
  (shape.semispan_m * station) / (SHAPE_STATIONS - 1);

/**
 * A trapezoidal wing's table, from the airframe's planform.
 * @param airframe The airframe
 * @returns The wing
 */
export const trapezoid_shape = (airframe: VaporAirframe): WingShape => {
  const semispan_m = Math.max(airframe.span_m / 2, 1e-3);
  const tan_sweep = Math.tan(airframe.leading_edge_sweep_rad);
  const tan_dihedral = Math.tan(airframe.dihedral_rad);

  const shape: WingShape = {
    semispan_m,
    root_span_m: Math.min(Math.max(airframe.root_span_m, 0), semispan_m),
    leading_m: new Float32Array(SHAPE_STATIONS),
    chord_m: new Float32Array(SHAPE_STATIONS),
    mid_m: new Float32Array(SHAPE_STATIONS),
    thickness: new Float32Array(SHAPE_STATIONS).fill(airframe.thickness),
    loading: new Float32Array(SHAPE_STATIONS),
  };

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    const span = station_span(shape, station);

    shape.leading_m[station] = airframe.apex_m + span * tan_sweep;
    shape.chord_m[station] =
      airframe.root_chord_m +
      ((airframe.tip_chord_m - airframe.root_chord_m) * span) / semispan_m;
    shape.mid_m[station] = airframe.wing_height_m + span * tan_dihedral;
  }

  shape.loading.set(lattice_loading(shape));

  return shape;
};

/**
 * The wing's planform derived from its table: what the lift and the vortex
 * breakdown read.
 * @param shape The wing
 * @returns Its area, span, mean leading-edge sweep from root to tip, and the
 *   chords at the centreline and the tip
 */
export const shape_planform = (
  shape: WingShape,
): {
  area_m2: number;
  span_m: number;
  sweep_rad: number;
  root_chord_m: number;
  tip_chord_m: number;
} => {
  let area = 0;

  for (let station = 1; station < SHAPE_STATIONS; station++) {
    const step = shape.semispan_m / (SHAPE_STATIONS - 1);

    area += ((shape.chord_m[station - 1] + shape.chord_m[station]) / 2) * step;
  }

  const root = shape_station(shape, shape.root_span_m);
  const tip = SHAPE_STATIONS - 1;
  const out = shape.semispan_m - shape.root_span_m;

  return {
    area_m2: area * 2,
    span_m: shape.semispan_m * 2,
    sweep_rad:
      out > 1e-3 ? Math.atan((shape.leading_m[tip] - root.leading_m) / out) : 0,
    root_chord_m: shape.chord_m[0],
    tip_chord_m: shape.chord_m[tip],
  };
};

/**
 * The spanwise loading, from Weissinger's lifting line: a horseshoe vortex on
 * every strip's quarter chord, the flow made tangent at its three-quarter
 * chord. It catches what an elliptic guess cannot: the loading a swept wing
 * piles on its tips, a delta carries inboard, a crank kinks.
 *
 * Incompressible and planar, so its shape and not its size: the lift is the
 * aerodynamics' to work out, this only spreads it along the span.
 * @param shape The wing's leading edges and chords
 * @returns The loading at each station, over its mean
 */
export const lattice_loading = (shape: WingShape): Float32Array => {
  const panels = LATTICE_PANELS * 2;
  const semispan = shape.semispan_m;

  // Cosine spacing, so the tips, where the loading turns fastest, get more
  const edge = (index: number) =>
    -semispan * Math.cos((Math.PI * index) / panels);

  const quarter = (span: number) => {
    const station = shape_station(shape, span);

    return station.leading_m + 0.25 * station.chord_m;
  };

  const control = Array.from({ length: panels }, (_, index) => {
    const span = (edge(index) + edge(index + 1)) / 2;
    const station = shape_station(shape, span);

    return [station.leading_m + 0.75 * station.chord_m, span];
  });

  // Far enough downstream to be infinite
  const far = semispan * 1e3;

  const matrix = Array.from({ length: panels }, () => new Float64Array(panels));

  for (let i = 0; i < panels; i++) {
    const [px, pz] = control[i];

    for (let j = 0; j < panels; j++) {
      const za = edge(j);
      const zb = edge(j + 1);
      const xa = quarter(za);
      const xb = quarter(zb);

      matrix[i][j] =
        segment(px, pz, far, za, xa, za) +
        segment(px, pz, xa, za, xb, zb) +
        segment(px, pz, xb, zb, far, zb);
    }
  }

  const circulation = solve(matrix, new Float64Array(panels).fill(1));

  // Onto the stations, both sides folded together
  const centres = control.map(([, span]) => span);
  const loading = new Float32Array(SHAPE_STATIONS);

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    const span = station_span(shape, station);

    loading[station] =
      (interpolate(centres, circulation, span) +
        interpolate(centres, circulation, -span)) /
      2;
  }

  // Nothing at the tip itself
  loading[SHAPE_STATIONS - 1] = 0;

  let mean = 0;

  for (let station = 1; station < SHAPE_STATIONS; station++) {
    mean += (loading[station - 1] + loading[station]) / 2;
  }

  mean /= SHAPE_STATIONS - 1;

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    loading[station] = Math.max(loading[station] / (mean || 1), 0);
  }

  return loading;
};

/**
 * The normal velocity a straight vortex segment of unit strength induces at a
 * point in its plane: Biot and Savart.
 * @param px The point, along the chord
 * @param pz And along the span
 * @param ax The segment's start, along the chord
 * @param az And along the span
 * @param bx Its end, along the chord
 * @param bz And along the span
 * @returns The normal velocity
 */
const segment = (
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number => {
  const r1x = px - ax;
  const r1z = pz - az;
  const r2x = px - bx;
  const r2z = pz - bz;

  // r1 × r2, which in the plane is normal to it
  const cross = r1x * r2z - r1z * r2x;

  if (Math.abs(cross) < 1e-10) {
    return 0;
  }

  const r1 = Math.hypot(r1x, r1z);
  const r2 = Math.hypot(r2x, r2z);
  const r0x = bx - ax;
  const r0z = bz - az;

  const along = r0x * (r1x / r1 - r2x / r2) + r0z * (r1z / r1 - r2z / r2);

  return along / cross / (4 * Math.PI);
};

/**
 * Solve a small dense linear system, by Gaussian elimination with partial
 * pivoting.
 * @param matrix The rows, overwritten
 * @param right The right-hand side, overwritten
 * @returns The solution
 */
const solve = (matrix: Float64Array[], right: Float64Array): Float64Array => {
  const size = right.length;

  for (let column = 0; column < size; column++) {
    let pivot = column;

    for (let row = column + 1; row < size; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) {
        pivot = row;
      }
    }

    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [right[column], right[pivot]] = [right[pivot], right[column]];

    const lead = matrix[column][column] || 1e-12;

    for (let row = column + 1; row < size; row++) {
      const factor = matrix[row][column] / lead;

      if (factor === 0) {
        continue;
      }

      for (let k = column; k < size; k++) {
        matrix[row][k] -= factor * matrix[column][k];
      }

      right[row] -= factor * right[column];
    }
  }

  const solution = new Float64Array(size);

  for (let row = size - 1; row >= 0; row--) {
    let sum = right[row];

    for (let k = row + 1; k < size; k++) {
      sum -= matrix[row][k] * solution[k];
    }

    solution[row] = sum / (matrix[row][row] || 1e-12);
  }

  return solution;
};

/**
 * Linear interpolation through sorted points, held at the ends.
 * @param at Where the values are, ascending
 * @param values The values
 * @param x Where to read
 * @returns The value there
 */
const interpolate = (at: number[], values: Float64Array, x: number): number => {
  if (x <= at[0]) return values[0];
  if (x >= at[at.length - 1]) return values[values.length - 1];

  let index = 1;

  while (at[index] < x) index++;

  const t = (x - at[index - 1]) / (at[index] - at[index - 1]);

  return values[index - 1] + (values[index] - values[index - 1]) * t;
};
