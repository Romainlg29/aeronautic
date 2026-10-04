// The aerodynamics and the condensation behind the vapour, for tools, tests
// and anyone curious. The air itself is `@aeronautic/core`'s

export {
  lattice_loading,
  SHAPE_STATIONS,
  shape_planform,
  shape_station,
  station_span,
  trapezoid_shape,
  type WingShape,
  type WingStation,
} from "./wing-shape";
export {
  cloud_extinction,
  condensate,
  condensation_table,
  CONDENSATION_MIN_RATIO,
  CONDENSATION_TEXELS,
  saturation_ratio,
  type Condensate,
} from "./condensation";
export {
  angle_of_attack_for_load,
  breakdown_angles,
  breakdown_fraction,
  critical_pressure,
  flight_state,
  karman_tsien,
  lift_coefficient,
  lift_slope,
  planform,
  polhamus,
  pressure_ratio,
  sweep_at,
  type FlightState,
  type Planform,
} from "./aerodynamics";
export {
  cone_deficit,
  edge_at,
  edge_deficit,
  edge_path,
  tip_deficit,
  vapor_constants,
  vapor_deficit,
  vapor_state,
  wing_deficit,
  type EdgePath,
  type VaporConstants,
  type VaporField,
  type VaporGeometry,
  type VaporState,
} from "./vapor-field";
