import {
  type BufferGeometry,
  Matrix4,
  type Mesh,
  type Object3D,
  Vector3,
} from "three";

// The aircraft as six depth views: from above and below, ahead and astern, and
// either side
//
// Each view is an orthographic depth map of the model in the airframe's
// canonical frame (x aft, y up, z out along a wing). Looking down an axis, the
// nearest and furthest surfaces are the two opposite views at once, so three
// passes give all six. They are rasterised on the CPU: a few hundred thousand
// triangles at 128² is tens of milliseconds, needs no renderer, and comes out
// the same everywhere
//
// Depth views only see the outside. That is what the air sees too: an intake
// duct or the gap between a fin and the fuselage changes nothing a cloud
// forms in

// How many triangles one step of the work takes: a millisecond or two
const SLICE_TRIANGLES = 4096;

/**
 * One axis's pair of views: the nearest and furthest surface at every pixel.
 */
export type DepthView = {
  // Which axis it looks down: 0 x, 1 y, 2 z
  axis: 0 | 1 | 2;

  // The two axes across it, in order, and the pixels along each
  across: [number, number];
  width: number;
  height: number;

  // Where pixel (0, 0)'s corner is on the two axes across, and how big a
  // pixel is, in metres
  origin: [number, number];
  cell_m: number;

  // The least and greatest coordinate along the axis, per pixel. NaN where
  // nothing was hit
  near: Float32Array;
  far: Float32Array;
};

/**
 * The six views, and the box they were taken in.
 */
export type AirframeViews = {
  // Looking along x (ahead and astern), y (from below and above) and z
  front: DepthView;
  top: DepthView;
  side: DepthView;

  min: [number, number, number];
  max: [number, number, number];
};

/**
 * Which way the airframe's frame faces on the object it is captured from.
 */
export type CaptureFrame = {
  // The frame's origin, in the object's frame
  position?: readonly [number, number, number];

  // Which way it flies, by default -Z, and which way is up, by default +Y
  forward?: readonly [number, number, number];
  up?: readonly [number, number, number];
};

/**
 * How to take the views.
 */
export type CaptureOptions = CaptureFrame & {
  // Pixels along the longest side of the box. 128 is about 14 cm on a fighter
  resolution?: number;

  // Which meshes to keep. By default every visible one: hide the landing gear
  // and the stores first, or leave them out here, as they are not the shape
  // the air flies round
  filter?: (mesh: Mesh) => boolean;
};

/**
 * The matrix from the canonical frame (x aft, y up, z along the span) to the
 * object's frame.
 * @param frame Where the frame sits and which way it faces
 * @returns The matrix
 */
export const canonical_frame = (frame: CaptureFrame = {}): Matrix4 => {
  const aft = new Vector3()
    .fromArray(frame.forward ?? [0, 0, -1])
    .normalize()
    .negate();

  if (!Number.isFinite(aft.x) || aft.lengthSq() === 0) {
    aft.set(0, 0, 1);
  }

  const up = new Vector3().fromArray(frame.up ?? [0, 1, 0]);

  up.addScaledVector(aft, -up.dot(aft));

  if (up.lengthSq() < 1e-8) {
    up.set(0, 1, 0).addScaledVector(aft, -aft.y);
  }

  up.normalize();

  const span = new Vector3().crossVectors(aft, up);

  return new Matrix4()
    .makeBasis(aft, up, span)
    .setPosition(new Vector3().fromArray(frame.position ?? [0, 0, 0]));
};

/**
 * Every triangle of an object's meshes, in the canonical frame, flat.
 * @param object The model
 * @param options The frame, and which meshes to keep
 * @returns Nine floats a triangle
 */
export const collect_triangles = (
  object: Object3D,
  options: CaptureOptions = {},
): Float32Array => run(collect_triangle_steps(object, options));

/**
 * `collect_triangles`, as steps, a mesh or a slice of one at a time.
 * @param object The model
 * @param options The frame, and which meshes to keep
 * @yields Between slices of the work
 * @returns Nine floats a triangle
 */
export function* collect_triangle_steps(
  object: Object3D,
  options: CaptureOptions = {},
): Generator<void, Float32Array> {
  object.updateWorldMatrix(true, true);

  // The object's world, then the frame on it, inverted: world to canonical
  const into = new Matrix4()
    .multiplyMatrices(object.matrixWorld, canonical_frame(options))
    .invert();

  const keep = options.filter ?? ((mesh: Mesh) => is_shown(mesh, object));

  // Gathered first: the scene may change between the slices, the list not
  const meshes: Mesh[] = [];

  object.traverse((node) => {
    const mesh = node as Mesh;

    if (mesh.isMesh && keep(mesh)) {
      meshes.push(mesh);
    }
  });

  const chunks: Float32Array[] = [];
  let total = 0;

  const matrix = new Matrix4();
  const point = new Vector3();

  for (const mesh of meshes) {
    const geometry = mesh.geometry as BufferGeometry;
    const position = geometry.getAttribute("position");

    if (!position) {
      continue;
    }

    matrix.multiplyMatrices(into, mesh.matrixWorld);

    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const out = new Float32Array(Math.floor(count / 3) * 9);

    for (let corner = 0; corner < out.length / 3; corner++) {
      const vertex = index ? index.getX(corner) : corner;

      point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
      out[corner * 3] = point.x;
      out[corner * 3 + 1] = point.y;
      out[corner * 3 + 2] = point.z;

      if (corner % (SLICE_TRIANGLES * 3) === SLICE_TRIANGLES * 3 - 1) {
        yield;
      }
    }

    chunks.push(out);
    total += out.length;

    yield;
  }

  const triangles = new Float32Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    triangles.set(chunk, offset);
    offset += chunk.length;
  }

  return triangles;
}

/**
 * Whether a mesh is drawn: it and every parent up to the root visible.
 * @param mesh The mesh
 * @param root Where to stop looking
 * @returns Whether it shows
 */
const is_shown = (mesh: Object3D, root: Object3D): boolean => {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible) {
      return false;
    }

    if (node === root) {
      break;
    }
  }

  return true;
};

/**
 * Rasterise triangles into the three pairs of views.
 * @param triangles Nine floats a triangle, in the canonical frame
 * @param resolution Pixels along the box's longest side
 * @returns The views
 */
export const depth_views = (
  triangles: Float32Array,
  resolution = 128,
): AirframeViews => run(depth_view_steps(triangles, resolution));

/**
 * `depth_views`, as steps: it yields every few thousand triangles, so the
 * work can be spread over frames.
 * @param triangles Nine floats a triangle, in the canonical frame
 * @param resolution Pixels along the box's longest side
 * @yields Between slices of the work
 * @returns The views
 */
export function* depth_view_steps(
  triangles: Float32Array,
  resolution = 128,
): Generator<void, AirframeViews> {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let index = 0; index < triangles.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], triangles[index + axis]);
      max[axis] = Math.max(max[axis], triangles[index + axis]);
    }
  }

  if (!(max[0] >= min[0])) {
    throw new Error("capture: there is nothing to capture");
  }

  const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const cell_m = Math.max(longest, 1e-6) / Math.max(resolution, 2);

  function* view(
    axis: 0 | 1 | 2,
    across: [number, number],
  ): Generator<void, DepthView> {
    const [u, v] = across;

    // A pixel's margin round the box, so an edge on it is not lost
    const origin: [number, number] = [min[u] - cell_m, min[v] - cell_m];
    const width = Math.ceil((max[u] - min[u]) / cell_m) + 2;
    const height = Math.ceil((max[v] - min[v]) / cell_m) + 2;

    const near = new Float32Array(width * height).fill(Infinity);
    const far = new Float32Array(width * height).fill(-Infinity);

    const count = triangles.length / 9;

    for (let from = 0; from < count; from += SLICE_TRIANGLES) {
      rasterise(
        triangles,
        axis,
        across,
        origin,
        cell_m,
        width,
        height,
        near,
        far,
        from,
        Math.min(from + SLICE_TRIANGLES, count),
      );

      yield;
    }

    for (let pixel = 0; pixel < near.length; pixel++) {
      if (near[pixel] === Infinity) {
        near[pixel] = Number.NaN;
        far[pixel] = Number.NaN;
      }
    }

    return { axis, across, width, height, origin, cell_m, near, far };
  }

  const front = yield* view(0, [1, 2]);
  const top = yield* view(1, [0, 2]);
  const side = yield* view(2, [0, 1]);

  return { front, top, side, min, max };
}

/**
 * Run steps to the end at once.
 * @param steps The steps
 * @returns What they return
 */
export const run = <T>(steps: Generator<void, T>): T => {
  for (;;) {
    const next = steps.next();

    if (next.done) {
      return next.value;
    }
  }
};

/**
 * Run steps a few milliseconds at a time, handing the thread back between,
 * so the frames keep coming while they work.
 * @param steps The steps
 * @param budget_ms How long each turn may take
 * @param signal Stops it, rejecting with the signal's reason
 * @returns What they return
 */
export const run_async = async <T>(
  steps: Generator<void, T>,
  budget_ms = 6,
  signal?: AbortSignal,
): Promise<T> => {
  for (;;) {
    const start = performance.now();

    while (performance.now() - start < budget_ms) {
      const next = steps.next();

      if (next.done) {
        return next.value;
      }
    }

    signal?.throwIfAborted();

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    signal?.throwIfAborted();
  }
};

/**
 * Write every triangle's depth into one view, keeping the nearest and the
 * furthest.
 *
 * Pixel centres inside the triangle take its interpolated depth. A triangle
 * seen edge on covers no centre at all, so its sides are drawn too, as lines:
 * a thin wing seen from ahead is nothing but such triangles.
 * @param triangles Nine floats a triangle
 * @param axis The axis looked down
 * @param across The two axes across
 * @param origin Pixel (0, 0)'s corner
 * @param cell_m A pixel's size
 * @param width Pixels across
 * @param height Pixels down
 * @param near The nearest depths so far
 * @param far The furthest
 * @param from The first triangle to write
 * @param to One past the last
 */
const rasterise = (
  triangles: Float32Array,
  axis: number,
  across: [number, number],
  origin: [number, number],
  cell_m: number,
  width: number,
  height: number,
  near: Float32Array,
  far: Float32Array,
  from = 0,
  to = triangles.length / 9,
) => {
  const [u, v] = across;

  const write = (pu: number, pv: number, depth: number) => {
    if (pu < 0 || pv < 0 || pu >= width || pv >= height) {
      return;
    }

    const pixel = pv * width + pu;

    if (depth < near[pixel]) near[pixel] = depth;
    if (depth > far[pixel]) far[pixel] = depth;
  };

  // Every pixel a side passes through, its depth interpolated along it
  const edge = (
    au: number,
    av: number,
    ad: number,
    bu: number,
    bv: number,
    bd: number,
  ) => {
    const steps = Math.ceil(Math.max(Math.abs(bu - au), Math.abs(bv - av))) * 2;

    for (let step = 0; step <= steps; step++) {
      const t = steps > 0 ? step / steps : 0;

      write(
        Math.floor(au + (bu - au) * t),
        Math.floor(av + (bv - av) * t),
        ad + (bd - ad) * t,
      );
    }
  };

  for (let index = from * 9; index < to * 9; index += 9) {
    // In pixels, continuous: pixel centres sit at half integers
    const au = (triangles[index + u] - origin[0]) / cell_m;
    const av = (triangles[index + v] - origin[1]) / cell_m;
    const ad = triangles[index + axis];
    const bu = (triangles[index + 3 + u] - origin[0]) / cell_m;
    const bv = (triangles[index + 3 + v] - origin[1]) / cell_m;
    const bd = triangles[index + 3 + axis];
    const cu = (triangles[index + 6 + u] - origin[0]) / cell_m;
    const cv = (triangles[index + 6 + v] - origin[1]) / cell_m;
    const cd = triangles[index + 6 + axis];

    edge(au, av, ad, bu, bv, bd);
    edge(bu, bv, bd, cu, cv, cd);
    edge(cu, cv, cd, au, av, ad);

    const area = (bu - au) * (cv - av) - (bv - av) * (cu - au);

    if (Math.abs(area) < 1e-12) {
      continue;
    }

    const lo_u = Math.max(Math.floor(Math.min(au, bu, cu)), 0);
    const hi_u = Math.min(Math.ceil(Math.max(au, bu, cu)), width - 1);
    const lo_v = Math.max(Math.floor(Math.min(av, bv, cv)), 0);
    const hi_v = Math.min(Math.ceil(Math.max(av, bv, cv)), height - 1);

    for (let pv = lo_v; pv <= hi_v; pv++) {
      const sv = pv + 0.5;

      for (let pu = lo_u; pu <= hi_u; pu++) {
        const su = pu + 0.5;

        // Barycentric weights of the pixel's centre
        const wa = ((bu - su) * (cv - sv) - (bv - sv) * (cu - su)) / area;
        const wb = ((cu - su) * (av - sv) - (cv - sv) * (au - su)) / area;
        const wc = 1 - wa - wb;

        if (wa < 0 || wb < 0 || wc < 0) {
          continue;
        }

        write(pu, pv, wa * ad + wb * bd + wc * cd);
      }
    }
  }
};

/**
 * Take the six views of a model.
 * @param object The model, or any node of it
 * @param options The airframe's frame on it, the resolution and which meshes
 *   to keep
 * @returns The views
 */
export const capture_views = (
  object: Object3D,
  options: CaptureOptions = {},
): AirframeViews => run(capture_view_steps(object, options));

/**
 * `capture_views`, as steps.
 * @param object The model, or any node of it
 * @param options The airframe's frame on it, the resolution and which meshes
 *   to keep
 * @yields Between slices of the work
 * @returns The views
 */
export function* capture_view_steps(
  object: Object3D,
  options: CaptureOptions = {},
): Generator<void, AirframeViews> {
  const triangles = yield* collect_triangle_steps(object, options);

  return yield* depth_view_steps(triangles, options.resolution ?? 128);
}
