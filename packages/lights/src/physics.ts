// The physics behind the lights, for tools, tests and anyone curious: the
// rule's photometry, the colours, the flash as the eye sees it, the haze,
// the eye's glare and the lamps' beams

export {
  NAV_AFT_CD,
  NAV_ARC_DEG,
  NAV_AREA_A_DEG,
  NAV_FORWARD_CD,
  NAV_OVERLAP_CD,
  NAV_VERTICAL,
  navigation_area,
  navigation_intensity,
  navigation_vertical,
  piecewise,
  wrap_deg,
  type NavigationSide,
} from "./navigation";
export {
  chromaticity_rgb,
  ILLUMINANT_A_K,
  is_aviation_green,
  is_aviation_red,
  is_aviation_white,
  LED_GREEN,
  LED_RED,
  planckian,
  type Chromaticity,
} from "./color";
export {
  ANTICOLLISION_CD,
  ANTICOLLISION_RATE,
  ANTICOLLISION_VERTICAL,
  BLONDEL_REY_S,
  blondel_rey_window,
  effective_ratio,
  flash_at,
  peak_intensity,
  perceived_duration,
  pulse_at,
  pulse_energy,
  type Pulse,
  type PulseShape,
} from "./flash";
export {
  AEROSOL_ALBEDO,
  AEROSOL_ASYMMETRY,
  ANGSTROM_EXPONENT,
  density_ratio,
  extinction,
  KOSCHMIEDER,
  RAYLEIGH_SEA_LEVEL,
  transmission,
  WAVELENGTHS_NM,
  type Extinction,
} from "./haze";
export {
  GLARE_MAX_DEG,
  GLARE_MIN_DEG,
  glare_core,
  glare_psf,
  glare_radius,
  glare_scattered,
  type Observer,
} from "./glare";
export {
  beam_half_angles,
  beam_intensity,
  beam_range,
  henyey_greenstein,
  rayleigh_phase,
} from "./beam";
export { exposure_ev100 } from "./exposure";
