export {
  Afterburner,
  AfterburnerBatch,
  useAfterburnerBatch,
  type AfterburnerBatchProps,
  type AfterburnerHandle,
  type AfterburnerProps,
} from "./afterburner";
export {
  AfterburnerBatch as AfterburnerBatchCore,
  AfterburnerNozzle,
  type AfterburnerBatchOptions,
  type AfterburnerNozzleOptions,
  type AfterburnerOffset,
  type AfterburnerStats,
} from "./afterburner-batch";
export {
  AFTERBURNER_ATTRIBUTES,
  create_afterburner_material,
  type AfterburnerBackdrop,
  type AfterburnerHooks,
  type AfterburnerOutline,
  type AfterburnerPixel,
} from "./afterburner-material";
export {
  afterburner_pass,
  type AfterburnerPass,
  type AfterburnerPassOptions,
} from "./afterburner-pass";
export { anchor_adrift, MAX_ANCHOR_DISTANCE_M } from "./plume-anchor";
export {
  BLACKBODY_MAX_K,
  BLACKBODY_MIN_K,
  blackbody_luminance,
  blackbody_rgb,
  get_blackbody_lut,
  REFERENCE_TEMPERATURE_K,
} from "./blackbody";
export { atmosphere, standard_atmosphere, type AirState } from "./atmosphere";
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
  type Fuel,
  type Propellant,
} from "./propellant";
export {
  AFTERBURNER_MAX_THROTTLE,
  burner_lit,
  clamp_throttle,
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
} from "./plume-profile";
export {
  AFTERBURNER_PRESETS,
  AFTERBURNER_QUALITY,
  get_afterburner_preset,
  resolve_afterburner_params,
  resolve_afterburner_profile,
  resolve_afterburner_quality,
  type AfterburnerParamsInput,
  type AfterburnerPreset,
  type AfterburnerPresetName,
  type AfterburnerQualityInput,
} from "./presets";
export {
  default_afterburner_params,
  default_afterburner_profile,
  default_afterburner_quality,
  type AfterburnerParams,
  type AfterburnerProfile,
  type AfterburnerQuality,
} from "./types";
