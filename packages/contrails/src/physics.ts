// The physics behind the trails, for tools, tests and anyone curious. The
// air itself is `@aeronautic/core`'s

export {
  HOMOGENEOUS_FREEZING_K,
  ICE_DENSITY,
  humidity_over_water,
  ice_humidity,
  ice_saturation_pressure,
  water_saturation_pressure,
} from "./ice";
export {
  age_at_dilution,
  dilution,
  extinction_efficiency,
  mixing_slope,
  mixture,
  PLUME_MAX_AGE_S,
  PLUME_MIN_AGE_S,
  plume_at,
  plume_formation,
  schmidt_appleman,
  type ContrailFormation,
  type Emission,
  type PlumeFormation,
  type PlumeState,
} from "./plume";
export {
  buoyancy_frequency,
  CRUISE_EDDY_DISSIPATION_M2_S3,
  capture_time,
  exhaust_offset,
  link_time,
  wake,
  wake_descent,
  type Wake,
} from "./wake";
export { THROTTLE_RATIO, thrust_lapse } from "./thrust";
export {
  TRAIL_POINTS_PER_EFOLD,
  TRAIL_MIN_AGE_S,
  TrailHistory,
  trail_ages,
  type TrailFlight,
  type TrailPoint,
} from "./history";
