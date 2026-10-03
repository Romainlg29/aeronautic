import { BufferAttribute, BufferGeometry } from "three";

// The proxy hull is a mask and nothing else
// Every pixel it covers runs a sphere trace, and every pixel it covers and the
// plume does not runs one that finds nothing
// So its whole job is to be the smallest shape the flame is provably inside

//
// The geometry is a unit prism, shared by every instance. The vertex stage opens
// each ring to the field's extent at that end of its own plume, which makes it
// a frustum fitted to each jet: the jet's half-width grows piecewise linearly
// and only ever faster, so the straight line between its two ends bounds it

/**
 * Build the proxy hull one plume is rasterized through.
 * @param sides How many flat sides the hull has
 * @returns The hull, its nozzle end at the origin, running along +X
 */
export const build_plume_hull = (sides: number): BufferGeometry => {
  // Circumscribing rather than inscribing
  // At this radius the flat sides are tangent to the unit circle
  // So the round plume is entirely inside them
  const margin = 1 / Math.cos(Math.PI / sides);

  // Two rings, and a centre at each end to fan the caps from
  const positions = new Float32Array((2 + sides * 2) * 3);

  // The centre of the nozzle cap
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;

  // And of the tail cap
  positions[3] = 1;
  positions[4] = 0;
  positions[5] = 0;

  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2;

    const lateral = Math.cos(angle);
    const vertical = Math.sin(angle);

    // The nozzle ring
    const near = (2 + side) * 3;

    positions[near] = 0;
    positions[near + 1] = lateral * margin;
    positions[near + 2] = vertical * margin;

    // And the tail ring
    const far = (2 + sides + side) * 3;

    positions[far] = 1;
    positions[far + 1] = lateral * margin;
    positions[far + 2] = vertical * margin;
  }

  // Two triangles per side for the wall, and one per side for each cap
  const indices = new Uint16Array(sides * 12);

  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;

    const near = 2 + side;
    const near_next = 2 + next;
    const far = 2 + sides + side;
    const far_next = 2 + sides + next;

    const offset = side * 12;

    // The wall, wound outward like the caps, so back face only keeps the far
    // surface: one layer per ray, and never two or none
    indices[offset] = near;
    indices[offset + 1] = far_next;
    indices[offset + 2] = far;

    indices[offset + 3] = near;
    indices[offset + 4] = near_next;
    indices[offset + 5] = far_next;

    // Both caps have to be there, the hull being rendered back face only
    // An open end leaves pixels looking down the axis with no face to shade
    indices[offset + 6] = 0;
    indices[offset + 7] = near_next;
    indices[offset + 8] = near;

    indices[offset + 9] = 1;
    indices[offset + 10] = far;
    indices[offset + 11] = far_next;
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));

  return geometry;
};
