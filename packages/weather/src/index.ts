// Without React: the weather, its layers and their genera, and its clouds'
// node. The components are in `@aeronautic/weather/react`, the microphysics
// and the field behind them in `@aeronautic/weather/physics`

export { clouds, CloudsNode, type CloudsOptions } from "./clouds-node";
export { CLOUD_GENERA, cloud_layer, type CloudGenus } from "./genera";
export {
  default_weather_day,
  default_weather_look,
  resolve_weather_quality,
  WEATHER_QUALITY,
  type CloudAnvil,
  type CloudCell,
  type CloudForm,
  type CloudLayer,
  type WeatherDay,
  type WeatherLook,
  type WeatherQuality,
  type WeatherQualityName,
} from "./types";
export { Weather, type WeatherOptions, type WeatherSample } from "./weather";
