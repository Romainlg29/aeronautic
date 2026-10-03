// The vapour's TSL, for building a material of your own or changing this one

export { hash_cell, patchiness, value_noise } from "./noise";
export {
  edge_vortex,
  SHAPE_ROWS,
  tip_vortex,
  vapor_cone,
  vapor_field,
  wing_sheet,
  type VaporFieldNodes,
} from "./field";
export {
  create_shape_texture,
  create_vapor_material,
  create_vapor_table,
  create_vapor_uniforms,
  write_shape_texture,
  write_vapor_field,
  write_vapor_table,
  type VaporMaterialOptions,
  type VaporUniforms,
} from "../vapor-material";
