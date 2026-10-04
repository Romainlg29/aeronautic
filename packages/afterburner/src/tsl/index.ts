// The plume's TSL, for building a material of your own or changing this one
//
// Everything here is plain TSL over explicit inputs: the noise, the blackbody,
// the jet and its temperature field, and the material that puts them together

export {
  hash_cell,
  signed,
  turbulence,
  value_noise,
  volume_noise,
  volume_turbulence,
  volume_wander,
  wander_noise,
} from "./noise";
export { blackbody } from "./blackbody";
export {
  PLUME_EPSILON,
  plume_bound,
  plume_bound_coarse,
  plume_centreline,
  plume_closest,
  plume_field,
  plume_frame,
  plume_half_width,
  plume_jet,
  plume_outline,
  plume_span,
  plume_station,
  plume_sun_depth,
  plume_sun_phase,
  type PlumeContext,
  type PlumeEngineNodes,
  type PlumeFieldHooks,
  type PlumeFieldOptions,
  type PlumeFieldSample,
  type PlumeFrame,
  type PlumeAirNodes,
  type PlumeJetNodes,
  type PlumeOutlineNodes,
  type PlumeOutlineRadius,
  type PlumeProfileNodes,
  type PlumeSampleContext,
  type PlumeSunNodes,
} from "./plume";
export {
  AFTERBURNER_ATTRIBUTES,
  create_afterburner_material,
  create_afterburner_uniforms,
  write_afterburner_profile,
  type AfterburnerHooks,
  type AfterburnerMaterial,
  type AfterburnerMaterialOptions,
  type AfterburnerOutline,
  type AfterburnerPixel,
  type AfterburnerUniforms,
} from "../afterburner-material";
