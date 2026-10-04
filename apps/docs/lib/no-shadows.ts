import { PCFShadowMap } from "three";

/**
 * No shadow maps, said as an object for a canvas's `shadows`. A boolean,
 * false included, makes R3F set PCFSoftShadowMap, which WebGPURenderer no
 * longer has and warns about
 */
export const NO_SHADOWS = { enabled: false, type: PCFShadowMap };
