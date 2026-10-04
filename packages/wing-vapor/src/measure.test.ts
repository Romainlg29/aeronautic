import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
} from "three";
import { capture_views } from "@aeronautic/core";
import { fighter_filter, load_fighter } from "./fighter.fixture";
import {
  capture_airframe,
  capture_airframe_async,
  deserialize_capture,
  measure_airframe,
  serialize_capture,
} from "./measure";
import { default_vapor_airframe } from "./types";
import { shape_station } from "./wing-shape";

const DEG = Math.PI / 180;

/**
 * A closed trapezoidal wing, biconvex, in the canonical frame: x aft, y up,
 * z out along the span.
 * @returns The geometry
 */
const trapezoid_wing = (planform: {
  semispan: number;
  apex: number;
  root: number;
  tip: number;
  tan_sweep: number;
  thickness: number;
  height: number;
}): BufferGeometry => {
  const spans = 24;
  const chords = 16;
  const positions: number[] = [];

  const point = (eta: number, xi: number, side: number) => {
    const z = eta * planform.semispan;
    const chord =
      planform.root + (planform.tip - planform.root) * Math.abs(eta);
    const x = planform.apex + Math.abs(z) * planform.tan_sweep + xi * chord;
    const y =
      planform.height + side * 2 * planform.thickness * chord * xi * (1 - xi);

    return [x, y, z];
  };

  for (const side of [1, -1]) {
    for (let i = 0; i < spans; i++) {
      for (let j = 0; j < chords; j++) {
        const e0 = -1 + (2 * i) / spans;
        const e1 = -1 + (2 * (i + 1)) / spans;
        const x0 = j / chords;
        const x1 = (j + 1) / chords;

        positions.push(
          ...point(e0, x0, side),
          ...point(e1, x0, side),
          ...point(e1, x1, side),
          ...point(e0, x0, side),
          ...point(e1, x1, side),
          ...point(e0, x1, side),
        );
      }
    }
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  return geometry;
};

/**
 * A closed biconvex wing of any planform, in the canonical frame.
 * @param semispan Centreline to tip
 * @param leading Where the leading edge is at one span
 * @param trailing And the trailing edge
 * @param thickness Thickness over chord
 * @returns The geometry
 */
const planform_wing = (
  semispan: number,
  leading: (span: number) => number,
  trailing: (span: number) => number,
  thickness = 0.05,
): BufferGeometry => {
  const spans = 48;
  const chords = 16;
  const positions: number[] = [];

  const point = (eta: number, xi: number, side: number) => {
    const z = eta * semispan;
    const front = leading(Math.abs(z));
    const chord = trailing(Math.abs(z)) - front;

    return [
      front + xi * chord,
      side * 2 * thickness * chord * xi * (1 - xi),
      z,
    ];
  };

  for (const side of [1, -1]) {
    for (let i = 0; i < spans; i++) {
      for (let j = 0; j < chords; j++) {
        const e0 = -1 + (2 * i) / spans;
        const e1 = -1 + (2 * (i + 1)) / spans;
        const x0 = j / chords;
        const x1 = (j + 1) / chords;

        positions.push(
          ...point(e0, x0, side),
          ...point(e1, x0, side),
          ...point(e1, x1, side),
          ...point(e0, x0, side),
          ...point(e1, x1, side),
          ...point(e0, x1, side),
        );
      }
    }
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  return geometry;
};

/**
 * A round body along x.
 * @param nose Where its nose is
 * @param length How long
 * @param radius How fat
 * @returns The mesh
 */
const round_body = (nose: number, length: number, radius: number): Mesh => {
  const body = new Mesh(new CylinderGeometry(radius, radius, length, 32));

  body.rotation.z = Math.PI / 2;
  body.position.set(nose + length / 2, 0, 0);

  return body;
};

describe("measure_airframe", () => {
  it("recovers a trapezoidal wing and its body", () => {
    const planform = {
      semispan: 6,
      apex: -4,
      root: 8,
      tip: 2,
      tan_sweep: Math.tan(50 * DEG),
      thickness: 0.06,
      height: 0.1,
    };

    // A body 16 m long and 1.2 m round, along x
    const body = new Mesh(new CylinderGeometry(1.2, 1.2, 16, 32));

    body.rotation.z = Math.PI / 2;
    body.position.set(-1, 0, 0);

    const model = new Group().add(new Mesh(trapezoid_wing(planform)), body);

    const { airframe, shape } = measure_airframe(
      capture_views(model, { forward: [-1, 0, 0] }),
    );

    expect(airframe.span_m).toBeCloseTo(12, 0);
    expect(airframe.leading_edge_sweep_rad / DEG).toBeCloseTo(50, -0.5);
    expect(Math.abs(airframe.leading_edge_sweep_rad / DEG - 50)).toBeLessThan(
      2,
    );
    expect(Math.abs(airframe.apex_m - planform.apex)).toBeLessThan(0.3);
    expect(Math.abs(airframe.root_chord_m - planform.root)).toBeLessThan(0.4);
    expect(Math.abs(airframe.tip_chord_m - planform.tip)).toBeLessThan(0.4);
    expect(Math.abs(airframe.thickness - planform.thickness)).toBeLessThan(
      0.015,
    );
    expect(Math.abs(airframe.wing_height_m - planform.height)).toBeLessThan(
      0.1,
    );

    // The body: where the wing leaves it, its nose, length and radius
    expect(airframe.root_span_m).toBeGreaterThan(1);
    expect(airframe.root_span_m).toBeLessThan(1.8);
    expect(Math.abs(airframe.nose_m - 9)).toBeLessThan(0.3);
    expect(Math.abs(airframe.fuselage_length_m - 16)).toBeLessThan(0.5);
    expect(Math.abs(airframe.fuselage_radius_m - 1.2)).toBeLessThan(0.25);

    // The table holds the wing as it is, the body's stations the theoretical
    // wing through it
    expect(Math.abs(shape.chord_m[0] - planform.root)).toBeLessThan(0.4);
  });

  it("keeps the wing and leaves out a tailplane at the same stations", () => {
    // A straight tapered wing, and a tailplane 6 m behind it out to 2.5 m
    const model = new Group().add(
      new Mesh(
        planform_wing(
          6,
          (span) => -1 + span * 0.1,
          (span) => 2 - span * 0.15,
        ),
      ),
      new Mesh(
        planform_wing(
          2.5,
          (span) => 5 + span * 0.3,
          () => 6.5,
        ),
      ),
      round_body(-6, 13, 0.7),
    );

    const { shape } = measure_airframe(
      capture_views(model, { forward: [-1, 0, 0] }),
    );

    // At 2 m out the tailplane is there too, and the chord is still the wing's
    const at = shape_station(shape, 2);

    expect(Math.abs(at.leading_m - -0.8)).toBeLessThan(0.25);
    expect(Math.abs(at.chord_m - 2.5)).toBeLessThan(0.3);

    // And the tailplane is measured as one: behind, 2.5 m out, its tip's
    // leading edge 5.75 m aft
    const tail = shape.secondary;

    expect(tail?.kind).toBe("tail");
    expect(Math.abs((tail?.semispan_m ?? 0) - 2.5)).toBeLessThan(0.25);
    expect(Math.abs((tail?.tip_leading_m ?? 0) - 5.75)).toBeLessThan(0.3);
  });

  it("tells a canard from a tailplane", () => {
    // A delta, and a canard 4 m ahead of its root out to 2 m
    const model = new Group().add(
      new Mesh(
        planform_wing(
          5,
          (span) => -3 + span * 1.2,
          () => 4,
        ),
      ),
      new Mesh(
        planform_wing(
          2,
          (span) => -7 + span * 0.8,
          (span) => -5.5 + span * 0.3,
        ),
      ),
      round_body(-10, 15, 0.7),
    );

    const { shape } = measure_airframe(
      capture_views(model, { forward: [-1, 0, 0] }),
    );

    expect(shape.secondary?.kind).toBe("canard");
    expect(Math.abs((shape.secondary?.semispan_m ?? 0) - 2)).toBeLessThan(0.25);
  });

  it("follows a cranked leading edge station by station", () => {
    // A double delta: 70 degrees to 2.5 m out, 45 beyond
    const inner = Math.tan(70 * DEG);
    const outer = Math.tan(45 * DEG);
    const crank = 2.5;

    const leading = (span: number) =>
      span < crank
        ? -8 + span * inner
        : -8 + crank * inner + (span - crank) * outer;

    const model = new Group().add(
      new Mesh(planform_wing(6, leading, () => 4)),
      round_body(-10, 15, 0.8),
    );

    const { shape } = measure_airframe(
      capture_views(model, { forward: [-1, 0, 0] }),
    );

    const slope = (from: number, to: number) =>
      (shape_station(shape, to).leading_m -
        shape_station(shape, from).leading_m) /
      (to - from);

    expect(Math.atan(slope(1.2, 2.2)) / DEG).toBeGreaterThan(64);
    expect(Math.atan(slope(3.5, 5.5)) / DEG).toBeLessThan(50);
  });

  it("cuts an engine's nacelle off the wing it hangs from", () => {
    // A straight wing, 2.4 m chord, a nacelle at 4 m out jutting 2.5 m
    // ahead of it and 1 m behind
    const wing = new Mesh(
      planform_wing(
        12,
        () => 0,
        () => 2.4,
        0.14,
      ),
    );
    const model = new Group().add(wing, round_body(-6, 18, 1));

    for (const side of [1, -1]) {
      const nacelle = round_body(-2.5, 5.9, 0.6);

      nacelle.position.z = side * 4;
      model.add(nacelle);
    }

    const { airframe, shape } = measure_airframe(
      capture_views(model, { forward: [-1, 0, 0] }),
    );

    for (const span of [3.5, 4, 4.5]) {
      const station = shape_station(shape, span);

      expect(Math.abs(station.leading_m)).toBeLessThan(0.3);
      expect(Math.abs(station.leading_m + station.chord_m - 2.4)).toBeLessThan(
        0.3,
      );
    }

    expect(Math.abs(airframe.root_chord_m - 2.4)).toBeLessThan(0.3);
    expect(airframe.root_span_m).toBeLessThan(1.8);
  });

  it("measures the docs' fighter as it was measured by hand", async () => {
    const fighter = await load_fighter();
    const { airframe, shape } = measure_airframe(
      capture_views(fighter, { filter: fighter_filter }),
    );
    const by_hand = default_vapor_airframe();

    expect(Math.abs(airframe.span_m - by_hand.span_m)).toBeLessThan(0.3);
    expect(
      Math.abs(
        airframe.leading_edge_sweep_rad - by_hand.leading_edge_sweep_rad,
      ) / DEG,
    ).toBeLessThan(2);
    expect(Math.abs(airframe.apex_m - by_hand.apex_m)).toBeLessThan(0.3);
    expect(Math.abs(airframe.root_chord_m - by_hand.root_chord_m)).toBeLessThan(
      0.6,
    );
    expect(Math.abs(airframe.tip_chord_m - by_hand.tip_chord_m)).toBeLessThan(
      0.3,
    );
    // By hand, where the wing's own meshes start; captured, where the chine
    // running forward along the body stops behaving as the wing's leading
    // edge, which the air sees as a strake
    expect(airframe.root_span_m).toBeGreaterThan(1);
    expect(airframe.root_span_m).toBeLessThan(2.6);
    expect(Math.abs(airframe.nose_m - by_hand.nose_m)).toBeLessThan(0.3);

    // A tailless delta: nothing ahead of or behind its wing lifts
    expect(shape.secondary ?? null).toBeNull();
  }, 30_000);

  it("measures the same off the main thread, in slices", async () => {
    const fighter = await load_fighter();
    const options = { filter: fighter_filter, resolution: 64 };
    const sync = capture_airframe(fighter, options);

    let slices = 0;
    const counting = setInterval(() => slices++, 0);
    const sliced = await capture_airframe_async(fighter, {
      ...options,
      budget_ms: 1,
    });

    clearInterval(counting);

    expect(sliced.airframe).toEqual(sync.airframe);
    expect(sliced.shape.chord_m).toEqual(sync.shape.chord_m);
    // It did hand the thread back between slices
    expect(slices).toBeGreaterThan(0);
  }, 30_000);

  it("gives up when aborted", async () => {
    const fighter = await load_fighter();
    const abort = new AbortController();

    abort.abort();

    await expect(
      capture_airframe_async(fighter, { signal: abort.signal }),
    ).rejects.toThrow(/abort/i);
  }, 30_000);
});

describe("serialize_capture", () => {
  it("bakes to JSON and reads back what was measured", async () => {
    const fighter = await load_fighter();
    const measured = capture_airframe(fighter, { filter: fighter_filter });
    const baked = JSON.parse(JSON.stringify(serialize_capture(measured)));
    const read = deserialize_capture(baked);

    expect(read.airframe).toEqual(measured.airframe);
    expect(read.shape.semispan_m).toBe(measured.shape.semispan_m);

    for (const key of [
      "leading_m",
      "chord_m",
      "mid_m",
      "thickness",
      "loading",
    ] as const) {
      read.shape[key].forEach((value, station) =>
        expect(value).toBeCloseTo(measured.shape[key][station], 2),
      );
    }

    expect(read.shape.secondary ?? null).toEqual(
      measured.shape.secondary ?? null,
    );
  }, 30_000);

  it("refuses a bake of another version", () => {
    const measured = measure_airframe(
      capture_views(new Mesh(new CylinderGeometry(1, 1, 4)), {}),
    );
    const baked = serialize_capture(measured);

    expect(() => deserialize_capture({ ...baked, version: 0 })).toThrow(
      /version/,
    );
  });
});
