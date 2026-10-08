// The camera sees to the horizon from the highest the examples fly, 13 km:
// √(2 R h) on the earth's mean radius, some 410 km, so a trail kilometres
// long is never cut off by the far plane. The depth's precision is the near
// plane's to set, not this one's
const EARTH_RADIUS_M = 6_371_000;
const CEILING_M = 13_000;

export const CAMERA_FAR_M = Math.sqrt(2 * EARTH_RADIUS_M * CEILING_M);
