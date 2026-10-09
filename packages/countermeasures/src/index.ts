// Without React: the countermeasures themselves, and the defaults. The
// component is in `@aeronautic/countermeasures/react`, the physics behind it
// in `@aeronautic/countermeasures/physics`

export {
  Countermeasures,
  type CountermeasuresFrame,
  type CountermeasuresOptions,
} from "./countermeasures-core";
export {
  COUNTERMEASURES_QUALITY,
  default_countermeasures_air,
  default_countermeasures_airframe,
  default_countermeasures_flight,
  default_countermeasures_look,
  resolve_countermeasures_quality,
  type CountermeasuresAir,
  type CountermeasuresAirframe,
  type CountermeasuresFlight,
  type CountermeasuresLook,
  type CountermeasuresQuality,
  type CountermeasuresQualityName,
  type Dispenser,
  type DispenserMount,
} from "./types";
export { FLARE, type Flare, type FlareName } from "./flare";
export { default_program, type Program } from "./program";
