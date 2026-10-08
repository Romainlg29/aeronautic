// Without React: the lights themselves, and the defaults. The component is
// in `@aeronautic/lights/react`, the physics behind it in
// `@aeronautic/lights/physics`

export {
  Lights,
  type LightsAirframe,
  type LightsFrame,
  type LightsOptions,
} from "./lights-core";
export {
  default_anticollision,
  default_light_switches,
  default_lights_air,
  default_lights_illuminate,
  default_lights_look,
  default_navigation,
  LIGHTS_QUALITY,
  resolve_lights_quality,
  type AntiCollisionDials,
  type AntiCollisionLight,
  type BeamLight,
  type LightMount,
  type LightsAir,
  type LightsIlluminate,
  type LightsLook,
  type LightsQuality,
  type LightsQualityName,
  type LightsSwitches,
  type NavigationDials,
  type NavigationLight,
} from "./types";
export { LAMP, type Lamp, type LampName } from "./beam";
export { exposure_ev100 } from "./exposure";
