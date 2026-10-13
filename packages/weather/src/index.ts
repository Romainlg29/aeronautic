// Without React: the weather, its climates and plugins, its clouds' node,
// its rain and its lightning. The components are in
// `@aeronautic/weather/react`, the physics behind them in
// `@aeronautic/weather/physics`

export { Bolts, BOLT_SEGMENTS } from "./bolts";
export { clouds, CloudsNode, LIGHTS, type CloudsOptions } from "./clouds-node";
export {
  air_column,
  clamp_air,
  CLIMATES,
  field_salts,
  make_climate,
  type AirColumn,
  type AirField,
  type Climate,
  type ClimateName,
  type FieldSpec,
} from "./climate";
export {
  evolve_cell,
  tower_radius,
  type Cell,
  type CellSpec,
  type CellStage,
  type Region,
} from "./convection";
export {
  diagnose,
  empty_column,
  prepare,
  type CloudColumn,
  type Prepared,
} from "./diagnose";
export {
  Lightning,
  flash_power,
  type Flash,
  type LightningEvents,
  type Stroke,
  type Thunder,
} from "./lightning";
export { WeatherMap, type MapBounds, type MapFrame } from "./map";
export { weather_medium } from "./medium";
export {
  front,
  ground_to_air,
  patch,
  storm,
  type FrontOptions,
  type PatchOptions,
  type StormOptions,
  type WeatherContext,
  type WeatherPlugin,
} from "./plugin";
export { RainStreaks, RAIN_BOX_M, RAIN_DROPS } from "./rain";
export {
  default_weather_look,
  look_lux,
  resolve_weather_quality,
  steps_to,
  WEATHER_QUALITY,
  type WeatherLook,
  type WeatherQuality,
  type WeatherQualityName,
} from "./types";
export { Weather, type WeatherOptions, type WeatherSample } from "./weather";
