import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Vector3,
} from "three";
import {
  canonical_frame,
  capture_views,
  collect_triangles,
  depth_views,
} from "./capture";

describe("canonical_frame", () => {
  it("turns forward into -x and keeps up up", () => {
    const frame = canonical_frame({ forward: [0, 0, -1], up: [0, 1, 0] });

    // The canonical x axis, aft, lands on the object's +Z
    expect(new Vector3(1, 0, 0).applyMatrix4(frame).z).toBeCloseTo(1);
    expect(new Vector3(0, 1, 0).applyMatrix4(frame).y).toBeCloseTo(1);
  });
});

describe("depth_views", () => {
  it("sees a box's faces from every side", () => {
    const box = new Mesh(new BoxGeometry(4, 2, 1));

    box.position.set(1, 0, 0);

    const holder = new Group().add(box);

    // Flying along -X, so the canonical frame is the object's own
    const views = capture_views(holder, {
      forward: [-1, 0, 0],
      resolution: 64,
    });

    const centre = (view: typeof views.top) => {
      const u = Math.floor(view.width / 2);
      const v = Math.floor(view.height / 2);

      return [view.near[v * view.width + u], view.far[v * view.width + u]];
    };

    expect(centre(views.top)[0]).toBeCloseTo(-1, 3);
    expect(centre(views.top)[1]).toBeCloseTo(1, 3);
    expect(centre(views.front)[0]).toBeCloseTo(-1, 3);
    expect(centre(views.front)[1]).toBeCloseTo(3, 3);
    expect(centre(views.side)[0]).toBeCloseTo(-0.5, 3);
    expect(views.min[0]).toBeCloseTo(-1);
    expect(views.max[0]).toBeCloseTo(3);
  });

  it("leaves empty pixels empty", () => {
    const holder = new Group().add(new Mesh(new BoxGeometry(1, 1, 1)));
    const { top } = capture_views(holder, { forward: [-1, 0, 0] });

    expect(Number.isNaN(top.near[0])).toBe(true);
  });

  it("does not lose a plate seen edge on", () => {
    // A flat plate in the plane y = 0: from ahead it is a line one pixel high
    const plate = new BufferGeometry();

    plate.setAttribute(
      "position",
      new Float32BufferAttribute(
        [0, 0, -3, 2, 0, -3, 2, 0, 3, 0, 0, -3, 2, 0, 3, 0, 0, 3],
        3,
      ),
    );

    const { front } = depth_views(
      collect_triangles(new Group().add(new Mesh(plate)), {
        forward: [-1, 0, 0],
      }),
      32,
    );

    const hit = Array.from(front.near).filter((d) => !Number.isNaN(d));

    expect(hit.length).toBeGreaterThan(10);
    expect(Math.min(...hit)).toBeCloseTo(0);
  });

  it("leaves out hidden meshes, or what the filter says", () => {
    const shown = new Mesh(new BoxGeometry(1, 1, 1));
    const hidden = new Mesh(new BoxGeometry(1, 1, 1));

    hidden.position.set(10, 0, 0);
    hidden.visible = false;

    const holder = new Group().add(shown, hidden);

    expect(collect_triangles(holder).length).toBe(12 * 9);
    expect(
      collect_triangles(holder, { filter: (mesh) => mesh !== shown }).length,
    ).toBe(12 * 9);
  });
});
