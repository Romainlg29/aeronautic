import type { Object3D } from "three";
import {
  capture_views,
  capture_view_steps,
  run_async,
  type AirframeViews,
  type CaptureOptions,
  type DepthView,
} from "./capture";
import type { VaporAirframe } from "./types";
import {
  lattice_loading,
  SHAPE_STATIONS,
  station_span,
  type SecondarySurface,
  type WingShape,
} from "./wing-shape";

// From six depth views to a wing and a body
//
// Looking down on the aircraft, every column of pixels across the span is one
// station of the wing: where its leading and trailing edges are, and from the
// views above and below, its thickness and the height of its mid-plane. Where
// the wing meets the body is where those stop behaving like a wing: the
// leading edge jumps forward to the nose, or the section gets far thicker than
// the wing outboard of it. Inboard of that the wing is carried through as a
// straight fit to the outer wing, the theoretical root
//
// The body is the part inboard of the root. Its cross-section at every
// station along it is the depth between the views above and below, summed
// across it, and its size for the vapour cone is the round body of the same
// largest area

/**
 * What six views say about an aircraft.
 */
export type MeasuredAirframe = {
  // The planform and body fitted to it, as the analytic dials. The aircraft's
  // mass and what cannot be seen, such as how sharp its leading edge is, are
  // left out
  airframe: Pick<
    VaporAirframe,
    | "span_m"
    | "root_chord_m"
    | "tip_chord_m"
    | "leading_edge_sweep_rad"
    | "apex_m"
    | "wing_height_m"
    | "dihedral_rad"
    | "thickness"
    | "root_span_m"
    | "nose_m"
    | "fuselage_length_m"
    | "fuselage_radius_m"
    | "fuselage_height_m"
  >;

  // The wing as it is, station by station
  shape: WingShape;
};

// Sections more than this many times as thick for their chord as the outer
// wing's are body
const BODY_THICKNESS = 2.5;

// A leading edge that moves forward faster than this per metre inboard has
// left the wing for the body's nose: tan 84 degrees, more swept than any wing
const BODY_LEAP = 9.5;

// The outer wing the straight fits are made over, as shares of the semispan:
// clear of the body inboard, and of whatever the tip carries outboard
const OUTER_FROM = 0.5;
const OUTER_TO = 0.92;

// Pixels deeper than this many times their column's median are something
// standing on the section, a fin or a store, and not the section
const SECTION_DEPTH = 3;

// The fewest stations out from the body a canard or a tailplane needs, to be
// one rather than a stray: a few tenths of a metre on a fighter
const MIN_SECOND_STATIONS = 4;

// The fewest pixels along the chord a canard's or a tailplane's section
// needs, to be one rather than a stray edge
const MIN_SECOND_PIXELS = 3;

// A biconvex section's median thickness over its maximum: a quarter of the
// chord either side of the middle is thicker than three quarters of the most
const MEDIAN_THICKNESS = 0.75;

/**
 * One column of the view from above: a station's edges, thickness and height.
 */
type Column = {
  leading: number;
  trailing: number;
  thickness: number;
  mid: number;

  // The next longest run along the chord, if any: a canard's or a
  // tailplane's section at the same station
  second: { leading: number; trailing: number; mid: number } | null;
};

/**
 * Read one column of pixels across the chord, at one place along the span.
 * @param top The view from above and below
 * @param span Where along the span, signed
 * @returns The column, or null if nothing is there
 */
const read_column = (top: DepthView, span: number): Column | null => {
  const row = Math.floor((span - top.origin[1]) / top.cell_m);

  if (row < 0 || row >= top.height) {
    return null;
  }

  const pixels: { x: number; depth: number; mid: number }[] = [];

  for (let column = 0; column < top.width; column++) {
    const pixel = row * top.width + column;
    const near = top.near[pixel];

    if (Number.isNaN(near)) {
      continue;
    }

    const far = top.far[pixel];

    pixels.push({
      x: top.origin[0] + column * top.cell_m,
      depth: far - near,
      mid: (far + near) / 2,
    });
  }

  if (pixels.length === 0) {
    return null;
  }

  // A fin standing on the wing is tall where the wing is thin, and may run
  // past its trailing edge: only what is about as thin as the section is the
  // section
  const typical = median(pixels.map(({ depth }) => depth));
  const section = pixels.filter(
    ({ depth }) => depth <= SECTION_DEPTH * Math.max(typical, 1e-3),
  );

  // A tailplane or a canard shares the wing's stations, with clear air
  // between them along the chord: the wing is the longest unbroken run
  const runs: (typeof section)[] = [section.slice(0, 1)];

  for (let index = 1; index < section.length; index++) {
    if (section[index].x - section[index - 1].x > top.cell_m * 1.5) {
      runs.push([]);
    }

    runs[runs.length - 1].push(section[index]);
  }

  runs.sort((a, b) => b.length - a.length);

  const longest = runs[0];
  const next = runs[1];

  const leading = longest[0].x;
  const trailing = longest[longest.length - 1].x + top.cell_m;
  const depths = longest.map(({ depth }) => depth);
  const mids = longest.map(({ mid }) => mid);

  return {
    leading,
    trailing,
    thickness: median(depths) / MEDIAN_THICKNESS,
    mid: median(mids),
    second:
      next && next.length >= MIN_SECOND_PIXELS
        ? {
            leading: next[0].x,
            trailing: next[next.length - 1].x + top.cell_m,
            mid: median(next.map(({ mid }) => mid)),
          }
        : null,
  };
};

/**
 * The median of some numbers.
 * @param values The numbers, reordered
 * @returns The median
 */
const median = (values: number[]): number => {
  values.sort((a, b) => a - b);

  const middle = values.length >> 1;

  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
};

/**
 * A straight line through points, by least squares.
 * @param xs Where
 * @param ys What
 * @returns Its intercept and slope
 */
const fit_line = (xs: number[], ys: number[]): [number, number] => {
  const n = xs.length;

  if (n < 2) {
    return [ys[0] ?? 0, 0];
  }

  const mean_x = xs.reduce((a, b) => a + b, 0) / n;
  const mean_y = ys.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let variance = 0;

  for (let index = 0; index < n; index++) {
    covariance += (xs[index] - mean_x) * (ys[index] - mean_y);
    variance += (xs[index] - mean_x) ** 2;
  }

  const slope = variance > 0 ? covariance / variance : 0;

  return [mean_y - slope * mean_x, slope];
};

/**
 * Measure the wing and the body from six depth views.
 * @param views The views, in the airframe's canonical frame
 * @returns The fitted dials and the wing's table
 */
export const measure_airframe = (views: AirframeViews): MeasuredAirframe => {
  const { top } = views;

  const semispan = Math.max(Math.abs(views.min[2]), Math.abs(views.max[2]));

  // Both wings, averaged: the field is symmetric, and a model rarely quite is
  const columns: (Column | null)[] = [];

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    const span = (semispan * station) / (SHAPE_STATIONS - 1);

    // Half a pixel in from the tip, or the tip's own column reads empty
    const inside = Math.min(span, semispan - top.cell_m * 0.5);

    const right = read_column(top, inside);
    const left = read_column(top, -inside);

    columns.push(average_columns(right, left));
  }

  // The outer wing, which is certainly wing, sets the lines and the
  // thickness the rest is judged against
  const outer = columns
    .map((column, station) => ({ column, station }))
    .filter(
      ({ column, station }) =>
        column !== null &&
        station >= OUTER_FROM * (SHAPE_STATIONS - 1) &&
        station <= OUTER_TO * (SHAPE_STATIONS - 1),
    ) as { column: Column; station: number }[];

  if (outer.length < 2) {
    throw new Error("capture: no wing found in the views");
  }

  const span_of = (station: number) =>
    (semispan * station) / (SHAPE_STATIONS - 1);

  const outer_spans = outer.map(({ station }) => span_of(station));

  const ratio = (column: Column) =>
    column.thickness / Math.max(column.trailing - column.leading, top.cell_m);

  const wing_ratio = median(outer.map(({ column }) => ratio(column)));

  // In from the tip, until a station stops looking like wing: far thicker
  // than the outer wing, or its leading edge leaping forward to the nose. A
  // crank bends the edge; only a body breaks it
  let root_station = 0;
  let outboard: Column | null = null;

  const step_m = semispan / (SHAPE_STATIONS - 1);

  // From the outer wing, not the tip: a tip's own sections are odd, small
  // and thick for their chord, and the body is always inboard
  const outer_station = Math.floor(OUTER_FROM * (SHAPE_STATIONS - 1));

  for (let station = outer_station; station >= 0; station--) {
    const column = columns[station];

    if (!column) {
      continue;
    }

    const leap = outboard ? (outboard.leading - column.leading) / step_m : 0;

    const body =
      ratio(column) > BODY_THICKNESS * wing_ratio || leap > BODY_LEAP;

    if (body) {
      root_station = station + 1;
      break;
    }

    outboard = column;
  }

  root_station = Math.min(root_station, SHAPE_STATIONS - 2);

  const root_span = span_of(root_station);

  // The straight fits over all the wing outboard of the root
  const wing = columns
    .map((column, station) => ({ column, station }))
    .filter(
      ({ column, station }) =>
        column !== null &&
        station >= root_station &&
        station <= OUTER_TO * (SHAPE_STATIONS - 1),
    ) as { column: Column; station: number }[];

  const wing_spans = wing.map(({ station }) => span_of(station));

  // The straight edges over the outer wing: a crank or a strake inboard is
  // the table's to keep, and the trapezoid stands for the wing outboard of it
  const [apex, tan_sweep] = fit_line(
    outer_spans,
    outer.map(({ column }) => column.leading),
  );
  // Inboard, a blended body's aft end often runs on to the tail, which the
  // table keeps but a trapezoid cannot
  const [trailing_0, trailing_slope] = fit_line(
    outer_spans,
    outer.map(({ column }) => column.trailing),
  );
  const [mid_0, tan_dihedral] = fit_line(
    wing_spans,
    wing.map(({ column }) => column.mid),
  );

  const thickness = median(
    wing.map(
      ({ column }) =>
        column.thickness /
        Math.max(column.trailing - column.leading, top.cell_m),
    ),
  );

  const shape: WingShape = {
    semispan_m: semispan,
    root_span_m: root_span,
    leading_m: new Float32Array(SHAPE_STATIONS),
    chord_m: new Float32Array(SHAPE_STATIONS),
    mid_m: new Float32Array(SHAPE_STATIONS),
    thickness: new Float32Array(SHAPE_STATIONS),
    loading: new Float32Array(SHAPE_STATIONS),
  };

  for (let station = 0; station < SHAPE_STATIONS; station++) {
    const span = station_span(shape, station);
    const column = columns[station];

    if (station < root_station || !column) {
      // Through the body, or past what the views caught: the fitted wing
      shape.leading_m[station] = apex + tan_sweep * span;
      shape.chord_m[station] = Math.max(
        trailing_0 + trailing_slope * span - shape.leading_m[station],
        top.cell_m,
      );
      shape.mid_m[station] = mid_0 + tan_dihedral * span;
      shape.thickness[station] = thickness;
    } else {
      const chord = Math.max(column.trailing - column.leading, top.cell_m);

      shape.leading_m[station] = column.leading;
      shape.chord_m[station] = chord;
      shape.mid_m[station] = column.mid;
      shape.thickness[station] = Math.min(column.thickness / chord, 0.3);
    }
  }

  shape.loading.set(lattice_loading(shape));
  shape.secondary = measure_secondary(columns, root_station, semispan);

  const body = measure_body(top, root_span);
  const tip = SHAPE_STATIONS - 1;

  return {
    airframe: {
      span_m: semispan * 2,
      root_chord_m: Math.max(trailing_0 - apex, top.cell_m),
      tip_chord_m: shape.chord_m[tip],
      leading_edge_sweep_rad: Math.atan(tan_sweep),
      apex_m: apex,
      wing_height_m: mid_0,
      dihedral_rad: Math.atan(tan_dihedral),
      thickness,
      root_span_m: root_span,
      ...body,
    },
    shape,
  };
};

/**
 * A canard or a tailplane: the second run along the chord, station after
 * station out from the body, until it stops.
 * @param columns Every station's column
 * @param root_station Where the wing leaves the body
 * @param semispan The wing's semispan
 * @returns The surface, or null if there is none
 */
const measure_secondary = (
  columns: (Column | null)[],
  root_station: number,
  semispan: number,
): SecondarySurface | null => {
  const step = semispan / (SHAPE_STATIONS - 1);

  let tip = -1;
  let area = 0;
  let ahead = 0;

  for (let station = root_station; station < SHAPE_STATIONS; station++) {
    const second = columns[station]?.second;
    const wing = columns[station];

    if (!second || !wing) {
      break;
    }

    tip = station;
    area += (second.trailing - second.leading) * step;
    ahead += second.leading < wing.leading ? 1 : -1;
  }

  if (tip < root_station + MIN_SECOND_STATIONS - 1) {
    return null;
  }

  // Its outermost section, and the one inboard of it, for a steadier tip
  const outer = columns[tip]!.second!;
  const inner = columns[Math.max(tip - 1, root_station)]!.second!;
  const semispan_m = (tip + 0.5) * step;

  // Carried on through the body, as the wing's area is
  const root_chord = columns[root_station]!.second!;

  area += (root_chord.trailing - root_chord.leading) * root_station * step;

  return {
    kind: ahead > 0 ? "canard" : "tail",
    semispan_m,
    tip_leading_m: (outer.leading + inner.leading) / 2,
    tip_chord_m: Math.max(
      (outer.trailing - outer.leading + inner.trailing - inner.leading) / 2,
      step,
    ),
    tip_height_m: (outer.mid + inner.mid) / 2,
    area_m2: area * 2,
  };
};

/**
 * The two wings' columns at one station, averaged.
 * @param right One wing's
 * @param left The other's
 * @returns The average, or whichever there is
 */
const average_columns = (
  right: Column | null,
  left: Column | null,
): Column | null => {
  if (!right || !left) {
    return right ?? left;
  }

  const second =
    right.second && left.second
      ? {
          leading: (right.second.leading + left.second.leading) / 2,
          trailing: (right.second.trailing + left.second.trailing) / 2,
          mid: (right.second.mid + left.second.mid) / 2,
        }
      : (right.second ?? left.second);

  return {
    leading: (right.leading + left.leading) / 2,
    trailing: (right.trailing + left.trailing) / 2,
    thickness: (right.thickness + left.thickness) / 2,
    mid: (right.mid + left.mid) / 2,
    second,
  };
};

/**
 * The body inboard of the wing's root: where its nose is, how long it is, and
 * the round body of the same largest cross-section.
 * @param top The view from above and below
 * @param root_span Where the wing leaves the body
 * @returns The fuselage's dials
 */
const measure_body = (
  top: DepthView,
  root_span: number,
): Pick<
  VaporAirframe,
  "nose_m" | "fuselage_length_m" | "fuselage_radius_m" | "fuselage_height_m"
> => {
  const band = Math.max(root_span, top.cell_m);

  let nose = Infinity;
  let tail = -Infinity;
  let largest = 0;
  let height = 0;

  for (let column = 0; column < top.width; column++) {
    const x = top.origin[0] + (column + 0.5) * top.cell_m;

    let area = 0;
    let moment = 0;

    for (let row = 0; row < top.height; row++) {
      const span = top.origin[1] + (row + 0.5) * top.cell_m;

      if (Math.abs(span) > band) {
        continue;
      }

      const pixel = row * top.width + column;
      const near = top.near[pixel];

      if (Number.isNaN(near)) {
        continue;
      }

      const depth = top.far[pixel] - near;

      area += depth * top.cell_m;
      moment += depth * top.cell_m * ((top.far[pixel] + near) / 2);
    }

    if (area <= 0) {
      continue;
    }

    nose = Math.min(nose, x - top.cell_m / 2);
    tail = Math.max(tail, x + top.cell_m / 2);

    if (area > largest) {
      largest = area;
      height = moment / area;
    }
  }

  if (!Number.isFinite(nose)) {
    return {
      nose_m: 0,
      fuselage_length_m: 1e-3,
      fuselage_radius_m: 0,
      fuselage_height_m: 0,
    };
  }

  return {
    nose_m: -nose,
    fuselage_length_m: tail - nose,
    fuselage_radius_m: Math.sqrt(largest / Math.PI),
    fuselage_height_m: height,
  };
};

/**
 * Take six depth views of a model and measure it: the one call most scenes
 * need. Pass the result's `shape` to the vapour, and spread its `airframe`
 * into yours.
 * @param object The model
 * @param options Its frame, the resolution and which meshes to keep
 * @returns The fitted dials and the wing's table
 */
export const capture_airframe = (
  object: Object3D,
  options: CaptureOptions = {},
): MeasuredAirframe => measure_airframe(capture_views(object, options));

/**
 * `capture_airframe`, a few milliseconds at a time, so a big model measures
 * without dropping a frame. The rasterising yields back to the page whenever
 * it has used its budget; the measuring after it is a millisecond or two.
 * @param object The model
 * @param options As for `capture_airframe`, plus how long each slice may run
 *   and a signal to give up on
 * @returns The fitted dials and the wing's table
 */
export const capture_airframe_async = async (
  object: Object3D,
  options: CaptureOptions & { budget_ms?: number; signal?: AbortSignal } = {},
): Promise<MeasuredAirframe> =>
  measure_airframe(
    await run_async(
      capture_view_steps(object, options),
      options.budget_ms,
      options.signal,
    ),
  );

// Bumped whenever the table's layout changes, so an old bake is refused
// rather than misread
const BAKE_VERSION = 1;

/**
 * A measured airframe as plain JSON, to bake at build time and ship in place
 * of the capture.
 */
export type BakedAirframe = {
  version: number;
  airframe: MeasuredAirframe["airframe"];
  shape: {
    semispan_m: number;
    root_span_m: number;
    leading_m: number[];
    chord_m: number[];
    mid_m: number[];
    thickness: number[];
    loading: number[];
    secondary: SecondarySurface | null;
  };
};

// Millimetres, and four figures for the ratios, are far finer than the views
// resolve, and keep the JSON short
const round = (values: Float32Array, digits: number): number[] =>
  Array.from(values, (value) => Number(value.toFixed(digits)));

/**
 * Bake a measured airframe into JSON.
 * @param measured What `capture_airframe` returned
 * @returns Plain data, for `JSON.stringify`
 */
export const serialize_capture = (
  measured: MeasuredAirframe,
): BakedAirframe => {
  const { shape } = measured;

  return {
    version: BAKE_VERSION,
    airframe: { ...measured.airframe },
    shape: {
      semispan_m: shape.semispan_m,
      root_span_m: shape.root_span_m,
      leading_m: round(shape.leading_m, 3),
      chord_m: round(shape.chord_m, 3),
      mid_m: round(shape.mid_m, 3),
      thickness: round(shape.thickness, 4),
      loading: round(shape.loading, 4),
      secondary: shape.secondary ? { ...shape.secondary } : null,
    },
  };
};

/**
 * Read a baked airframe back.
 * @param baked What `serialize_capture` made, parsed
 * @returns The measured airframe, as the capture would have returned it
 */
export const deserialize_capture = (baked: BakedAirframe): MeasuredAirframe => {
  if (baked.version !== BAKE_VERSION) {
    throw new Error(
      `r3f-wing-vapor: a bake of version ${baked.version}, this reads ${BAKE_VERSION}; capture again`,
    );
  }

  const table = (values: number[]) => {
    if (values.length !== SHAPE_STATIONS) {
      throw new Error(
        `r3f-wing-vapor: a baked table of ${values.length} stations, not ${SHAPE_STATIONS}`,
      );
    }

    return Float32Array.from(values);
  };

  const { shape } = baked;

  return {
    airframe: { ...baked.airframe },
    shape: {
      semispan_m: shape.semispan_m,
      root_span_m: shape.root_span_m,
      leading_m: table(shape.leading_m),
      chord_m: table(shape.chord_m),
      mid_m: table(shape.mid_m),
      thickness: table(shape.thickness),
      loading: table(shape.loading),
      secondary: shape.secondary ? { ...shape.secondary } : null,
    },
  };
};
