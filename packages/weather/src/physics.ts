// The physics behind the clouds, for tools, tests and anyone curious: the
// air lifted to its condensation level, the water it condenses, the droplets
// and the crystals that water makes and the light they stop, and the field
// that lays the clouds out from the seed

export {
  adiabatic_profile,
  condensation_level,
  draine,
  DROPLET_SPREAD,
  droplet_extinction,
  DROPLETS_PER_M3,
  effective_radius,
  FREEZING_K,
  henyey_greenstein,
  HOMOGENEOUS_FREEZING_K,
  ICE_ASYMMETRY,
  ICE_DENSITY,
  ice_extinction,
  ice_share,
  mie,
  mie_phase,
  moist_lapse_rate,
  RAIN_ASYMMETRY,
  rain_extinction,
  saturation_mixing_ratio,
  visibility,
  WATER_DENSITY,
  type AdiabaticProfile,
  type AirMass,
  type CondensationLevel,
  type MiePhase,
} from "./microphysics";
export {
  cell_cloud,
  curved_altitude,
  EARTH_RADIUS_M,
  layer_column,
  layer_density,
  layer_extinction,
  resolve_layer,
  size_octaves,
  TROPOPAUSE_M,
  type Cloud,
  type Column,
  type ResolvedLayer,
  type SizeOctave,
} from "./field";
export { bake_map, type MapFrame } from "./map";
export { pcg3d, perlin, worley, unit } from "./noise";
