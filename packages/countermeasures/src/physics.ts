// The physics behind the countermeasures, for tools, tests and anyone
// curious: the flare's grain burning down, its flame as the eye and a
// seeker see it, its flight through the air, and the dispensers' programs

export {
  airstream_share,
  band_intensity,
  burn_time,
  drag_per_speed2,
  FLARE,
  flare_light,
  G0,
  grain_at,
  grain_length,
  luminous_per_band,
  mass_rate,
  mean_area,
  mixture_density,
  MTV_DENSITIES,
  MTV_FRACTIONS,
  terminal_speed,
  type Flare,
  type FlareLight,
  type FlareName,
  type Grain,
} from "./flare";
export {
  band_radiance,
  blackbody_luminance,
  KM,
  PHOTOPIC,
  planck,
} from "./graybody";
export {
  default_program,
  program_releases,
  type Program,
  type Release,
} from "./program";
