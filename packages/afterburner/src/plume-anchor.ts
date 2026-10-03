// Where the instances are measured from, and when that place stops working
//
// Every plume is described as an offset from one anchor, in float32. A metre
// from it resolves to a nanometre; six thousand kilometres from it resolves to
// about half a metre, and a plume whose origin is quantised to half a metre
// does not sit on its nozzle
//
// The anchor is planted on the first frame. On the first frame the aircraft may
// not have been placed in the world yet — a nozzle still carrying its local
// model matrix reads as a few metres from the scene's origin, which is a
// perfectly plausible position and an entire planet away from where the
// aircraft actually is. Nothing about it looks wrong from the inside, so the
// only way to catch it is to keep checking

// How far the anchor may sit from the nozzles it measures, in metres
//
// A kilometre: comfortably more than any formation spreads over, and far less
// than the distance at which float32 stops resolving a nozzle
export const MAX_ANCHOR_DISTANCE_M = 1000;

/**
 * Whether an anchor is still close enough to measure a nozzle from.
 * @param anchor_x Where the anchor was planted
 * @param anchor_y Its second coordinate
 * @param anchor_z And its third
 * @param nozzle_x Where the nozzle actually is
 * @param nozzle_y Its second coordinate
 * @param nozzle_z And its third
 * @returns Whether the instances need measuring from somewhere else
 */
export const anchor_adrift = (
  anchor_x: number,
  anchor_y: number,
  anchor_z: number,
  nozzle_x: number,
  nozzle_y: number,
  nozzle_z: number,
): boolean => {
  const east = nozzle_x - anchor_x;
  const north = nozzle_y - anchor_y;
  const up = nozzle_z - anchor_z;

  return (
    east * east + north * north + up * up >
    MAX_ANCHOR_DISTANCE_M * MAX_ANCHOR_DISTANCE_M
  );
};
