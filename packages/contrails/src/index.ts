// Without React: the trails themselves, and the defaults. The component is
// in `@aeronautic/contrails/react`, the physics behind it in
// `@aeronautic/contrails/physics`

export {
  Contrails,
  type ContrailsFrame,
  type ContrailsOptions,
  type ContrailsState,
} from "./contrails-core";
export {
  CONTRAIL_FUEL,
  CONTRAIL_QUALITY,
  default_contrail_air,
  default_contrail_airframe,
  default_contrail_flight,
  default_contrail_look,
  resolve_contrail_quality,
  type ContrailAir,
  type ContrailAirframe,
  type ContrailColor,
  type ContrailEngine,
  type ContrailFlight,
  type ContrailFuel,
  type ContrailFuelName,
  type ContrailLook,
  type ContrailQuality,
  type ContrailQualityName,
} from "./types";
