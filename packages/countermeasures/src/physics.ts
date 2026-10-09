// The physics behind the countermeasures, for tools, tests and anyone
// curious: the flare's grain burning down, its flame as the eye and a
// seeker see it, its flight through the air, its smoke, the chaff, and
// the dispensers' programs

export {
  airstream_share,
  band_intensity,
  burn_time,
  drag_per_speed2,
  FLARE,
  flare_at_pressure,
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
  SEA_LEVEL_DENSITY,
  SEA_LEVEL_PA,
  terminal_speed,
  trail_colors,
  type Flare,
  type FlareLight,
  type FlareName,
  type Grain,
} from "./flare";
export {
  air_viscosity,
  CHAFF,
  chaff_bloom,
  chaff_cross_section,
  chaff_fall_speed,
  chaff_mass,
  dipole_count,
  type Chaff,
  type ChaffName,
} from "./chaff";
export {
  band_radiance,
  blackbody_luminance,
  KM,
  PHOTOPIC,
  planck,
} from "./graybody";
export { henyey_greenstein, smoke_sigma } from "./smoke";
export {
  default_program,
  program_releases,
  type Payload,
  type Program,
  type Release,
} from "./program";
