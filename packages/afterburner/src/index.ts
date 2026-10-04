// Without React: the batch that draws the plumes, its material and pass, and
// the presets and defaults. The components are in `@aeronautic/afterburner/react`,
// the physics behind the look in `@aeronautic/afterburner/physics`

export {
  AfterburnerBatch,
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
export { type Fuel, type Propellant } from "./propellant";
export { AFTERBURNER_MAX_THROTTLE, clamp_throttle } from "./plume-profile";
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
