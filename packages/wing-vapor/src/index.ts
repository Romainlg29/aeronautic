// Without React: the vapour itself, the airframe's capture, and the defaults.
// The component is in `@aeronautic/wing-vapor/react`, the aerodynamics and the
// condensation behind it in `@aeronautic/wing-vapor/physics`

export {
  WingVapor,
  type WingVaporFrame,
  type WingVaporOptions,
} from "./wing-vapor-core";
export {
  capture_airframe,
  capture_airframe_async,
  deserialize_capture,
  measure_airframe,
  serialize_capture,
  type BakedAirframe,
  type MeasuredAirframe,
} from "./measure";
export {
  default_vapor_air,
  default_vapor_airframe,
  default_vapor_effects,
  default_vapor_flight,
  default_vapor_look,
  resolve_vapor_quality,
  VAPOR_QUALITY,
  type VaporAir,
  type VaporAirframe,
  type VaporColor,
  type VaporEffects,
  type VaporFlight,
  type VaporLook,
  type VaporQuality,
  type VaporQualityName,
} from "./types";
