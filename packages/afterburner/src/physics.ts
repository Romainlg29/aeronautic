// The physics behind the look, for tools, tests and anyone curious: the air,
// the jet's shape, blackbody colour and the plume's level of detail

export { anchor_adrift, MAX_ANCHOR_DISTANCE_M } from "./plume-anchor";
export {
  BLACKBODY_MAX_K,
  BLACKBODY_MIN_K,
  blackbody_luminance,
  blackbody_rgb,
  get_blackbody_lut,
  REFERENCE_TEMPERATURE_K,
} from "./blackbody";
export {
  build_noise_volume,
  get_noise_volume,
  NOISE_VOLUME_PERIOD,
  NOISE_VOLUME_TEXELS,
} from "./noise-volume";
export { atmosphere, type AirState } from "./atmosphere";
export { build_plume_hull } from "./plume-hull";
export {
  clamp_nozzle_squareness,
  nozzle_outline_fit,
  NOZZLE_SQUARENESS_MAX,
  NOZZLE_SQUARENESS_MIN,
  type NozzleOutlineFit,
} from "./nozzle-outline";
export {
  equivalence_ratio,
  propellant_effects,
  propellant_params,
} from "./propellant";
export {
  burner_lit,
  dry_temperature,
  jet_centreline,
  jet_half_width,
  jet_state,
  plume_adaptation,
  plume_extent,
  plume_lod,
  plume_screen_span,
  type JetState,
  PLUME_IDLE_GLOW,
  PLUME_LIGHT_OFF,
  PLUME_LOD_CULLED,
  PLUME_LOD_FAR,
  PLUME_LOD_MID,
  PLUME_LOD_NEAR,
  PLUME_MIN_REHEAT,
  PLUME_SOOT_FLAME_K,
} from "./plume-profile";
