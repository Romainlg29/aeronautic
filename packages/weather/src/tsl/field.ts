import { type Data3DTexture, type Texture } from "three";
import {
  dot,
  exp,
  float,
  floor,
  If,
  ivec2,
  max,
  min,
  pow,
  select,
  sqrt,
  texture,
  texture3D,
  uint,
  uniform,
  uvec3,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";
import {
  detail_reach,
  SLOPE_MAX,
  TABLE_SIZE,
  type ResolvedLayer,
} from "../field";
import { layer_has_map, type MapFrame } from "../map";
import {
  DETAIL_CELLS,
  DETAIL_SPREAD,
  SHAPE_CELLS,
  SHAPE_SPREAD,
  SHAPE_WEIGHTS,
} from "../noise";
import { pcg3d, unit3 } from "./noise";

// field.ts in TSL: a layer's column, its density and its extinction at a
// point, as the CPU works them out
//
// What can change every frame is a uniform: the winds' drift, the clock, the
// map's place. What changes the shader's shape, a layer's form, its octaves of
// sizes, whether it has a map, rebuilds it

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;
type U = Node<"uint">;

/** A float uniform, as a node with its value */
type FloatUniform = UniformNode<"float", number> & F;

const float_uniform = (value = 0): FloatUniform =>
  uniform(value) as unknown as FloatUniform;

/**
 * One octave of a cumuliform layer's sizes, as the shader reads it.
 */
type OctaveNodes = {
  /** Its spacing, its probability, and its sizes' inverse distribution */
  spacing: FloatUniform;
  probability: FloatUniform;
  from: FloatUniform;
  span: FloatUniform;
  power: FloatUniform;

  /** Its hash's salt */
  salt: UniformNode<"uint", number> & U;
};

/**
 * A layer, as the shader reads it.
 */
export type LayerNodes = {
  /** What its shader's shape was built for */
  key: string;

  /** Whether it is cumuliform, its towers worn a whole billow in */
  cumuliform: boolean;

  base: FloatUniform;
  top: FloatUniform;

  /** Its air's offset from the scene: the origin, less the wind's drift */
  air: UniformNode<"vec2", { x: number; y: number }> & V2;

  aspect: FloatUniform;
  inverseCrown: FloatUniform;
  billow: FloatUniform;
  detail: FloatUniform;
  /** How far the detail wears in, metres: field.ts's `detail_reach` */
  detailReach: FloatUniform;
  roughness: FloatUniform;

  /** How far its billows have boiled up, metres */
  rise: FloatUniform;

  /** Its wind's direction, and how far its billows are drawn out along it */
  stretch: UniformNode<"vec3", { x: number; y: number; z: number }> & V3;

  noiseOffset: UniformNode<"vec3", { x: number; y: number; z: number }> & V3;

  octaves: OctaveNodes[];

  /** Its map, and where it lies: its centre and its extent */
  map: Texture | null;
  mapFrame: UniformNode<"vec3", { x: number; y: number; z: number }> & V3;

  /** Its row of the water table */
  row: FloatUniform;

  /** Its droplets' Mie phase: the HG lobe, Draine's g and α, its weight */
  phase: UniformNode<"vec4", { x: number; y: number; z: number; w: number }> &
    V4;
};

/**
 * What a layer's shader is built for: change any of it and it is built again.
 * @param resolved The layer
 * @returns The key
 */
export const layer_key = (resolved: ResolvedLayer): string =>
  [
    resolved.layer.form,
    resolved.octaves.length,
    layer_has_map(resolved),
    Math.abs(resolved.layer.sizeExponent - 1) < 1e-9,
  ].join(":");

/**
 * A layer's nodes, its uniforms not yet set.
 * @param resolved The layer
 * @param map Its map's texture, if it has one
 * @returns The nodes
 */
export const create_layer_nodes = (
  resolved: ResolvedLayer,
  map: Texture | null,
): LayerNodes => ({
  key: layer_key(resolved),
  cumuliform: resolved.layer.form === "cumuliform",
  base: float_uniform(),
  top: float_uniform(),
  air: uniform(vec2(0)) as unknown as LayerNodes["air"],
  aspect: float_uniform(),
  inverseCrown: float_uniform(),
  billow: float_uniform(),
  detail: float_uniform(),
  detailReach: float_uniform(),
  roughness: float_uniform(),
  rise: float_uniform(),
  stretch: uniform(vec3(1, 0, 1)) as unknown as LayerNodes["stretch"],
  noiseOffset: uniform(vec3(0)) as unknown as LayerNodes["noiseOffset"],
  octaves: resolved.octaves.map(() => ({
    spacing: float_uniform(),
    probability: float_uniform(),
    from: float_uniform(),
    span: float_uniform(),
    power: float_uniform(),
    salt: uniform(0, "uint") as unknown as OctaveNodes["salt"],
  })),
  map,
  mapFrame: uniform(vec3(0, 0, 1)) as unknown as LayerNodes["mapFrame"],
  row: float_uniform(),
  phase: uniform(vec4(0.9, 0.5, 0, 0.5)) as unknown as LayerNodes["phase"],
});

/**
 * Set a layer's uniforms for the frame.
 * @param nodes Its nodes
 * @param resolved It, worked out for the day
 * @param air_x Its air's offset from the scene
 * @param air_z Its air's offset from the scene
 * @param time_s The weather's clock
 * @param map_frame Where its map lies
 * @param row Its row of the water table
 */
export const update_layer_nodes = (
  nodes: LayerNodes,
  resolved: ResolvedLayer,
  air_x: number,
  air_z: number,
  time_s: number,
  map_frame: MapFrame | null,
  row: number,
): void => {
  const { layer } = resolved;
  const [wx, wz] = layer.windMPerS;
  const speed = Math.hypot(wx, wz);

  nodes.base.value = resolved.baseM;
  nodes.top.value = resolved.topM;
  nodes.air.value.x = air_x;
  nodes.air.value.y = air_z;
  nodes.aspect.value = layer.aspect;
  nodes.inverseCrown.value = 1 / Math.max(layer.crown, 1e-3);
  nodes.billow.value = layer.billowM;
  nodes.detail.value = layer.detailM;
  nodes.detailReach.value = detail_reach(layer);
  nodes.roughness.value = layer.form === "stratiform" ? 1 : 0.15;
  nodes.rise.value = layer.updraftMPerS * time_s;

  const stretched = speed > 0 && layer.stretch !== 1;

  nodes.stretch.value.x = stretched ? wx / speed : 1;
  nodes.stretch.value.y = stretched ? wz / speed : 0;
  nodes.stretch.value.z = stretched ? 1 / layer.stretch - 1 : 0;

  nodes.noiseOffset.value.x = resolved.noiseOffset[0];
  nodes.noiseOffset.value.y = resolved.noiseOffset[1];
  nodes.noiseOffset.value.z = resolved.noiseOffset[2];

  const b = layer.sizeExponent;
  const linear = Math.abs(b - 1) < 1e-9;

  for (const [index, octave] of resolved.octaves.entries()) {
    const target = nodes.octaves[index];

    if (!target) break;

    target.spacing.value = octave.spacing;
    target.probability.value = octave.probability;

    // D = (from + u span)^power, or e^(from + u span) for b = 1
    if (linear) {
      target.from.value = Math.log(octave.low);
      target.span.value = Math.log(octave.high / octave.low);
      target.power.value = 1;
    } else {
      target.from.value = octave.low ** (1 - b);
      target.span.value = octave.high ** (1 - b) - octave.low ** (1 - b);
      target.power.value = 1 / (1 - b);
    }

    target.salt.value = (resolved.salt ^ Math.imul(index, 0x27d4eb2f)) >>> 0;
  }

  if (map_frame) {
    nodes.mapFrame.value.x = map_frame.x;
    nodes.mapFrame.value.y = map_frame.z;
    nodes.mapFrame.value.z = map_frame.extent;
  }

  nodes.row.value = row;

  nodes.phase.value.x = resolved.phase.hg;
  nodes.phase.value.y = resolved.phase.draine;
  nodes.phase.value.z = resolved.phase.alpha;
  nodes.phase.value.w = resolved.phase.weight;
};

/**
 * The highest a cumuliform layer's random towers reach at a point of its air,
 * above its base: field.ts's `cell_cloud` and `add_cloud`, one cell an octave.
 * @param nodes The layer
 * @param resolved It, for its shape
 * @param air Where, in its air
 * @returns Metres
 */
const tower_height = (
  nodes: LayerNodes,
  resolved: ResolvedLayer,
  air: V2,
): V2 => {
  const height = float(0).toVar();
  const slope = float(0).toVar();
  const depth = nodes.top.sub(nodes.base);
  const linear = Math.abs(resolved.layer.sizeExponent - 1) < 1e-9;

  for (const octave of nodes.octaves) {
    const spacing = octave.spacing;
    const cell = ivec2(floor(air.div(spacing)) as unknown as V2);
    const first = pcg3d(
      uvec3(
        uint(cell.x as unknown as U),
        uint(cell.y as unknown as U),
        octave.salt,
      ) as unknown as Node<"uvec3">,
    ).toVar();
    const drawn = unit3(first).toVar();

    If(drawn.x.lessThan(octave.probability), () => {
      const along = octave.from.add(drawn.y.mul(octave.span));
      const diameter = (linear ? exp(along) : pow(along, octave.power)) as F;

      const second = unit3(
        pcg3d(
          uvec3(first.z, first.x, uint(0x165667b1)) as unknown as Node<"uvec3">,
        ),
      );
      const radius = diameter.mul(0.5);
      const room = spacing.sub(diameter);
      const centre = vec2(cell as unknown as V2)
        .mul(spacing)
        .add(radius)
        .add(second.xy.mul(room));

      const apart = air.sub(centre);
      const r2 = dot(apart, apart).div(radius.mul(radius));

      If(r2.lessThan(1), () => {
        const tall = min(nodes.aspect.mul(diameter), depth);
        const u = r2.oneMinus().max(1e-9);
        const here = tall.mul(pow(u, nodes.inverseCrown));

        If(here.greaterThan(height), () => {
          height.assign(here);

          // field.ts's dome_slope
          slope.assign(
            tall
              .mul(nodes.inverseCrown)
              .mul(2)
              .mul(sqrt(r2))
              .mul(pow(u, nodes.inverseCrown.sub(1)))
              .div(radius)
              .min(SLOPE_MAX),
          );
        });
      });
    });
  }

  return vec2(height, slope) as V2;
};

/**
 * A layer's column at a point of the scene: how high its cloud reaches above
 * its base, how thick its anvil hangs, how hard it rains.
 * @param nodes The layer
 * @param resolved It, for its shape
 * @param scene_xz Where, in the scene's x and z
 * @returns Height, anvil, rain, and the point in the layer's air
 */
export const layer_column = (
  nodes: LayerNodes,
  resolved: ResolvedLayer,
  scene_xz: V2,
): { column: V4; air: V2 } => {
  const air = scene_xz.add(nodes.air).toVar() as unknown as V2;
  let tower: V2 = vec2(0) as V2;

  if (resolved.layer.form === "cumuliform" && nodes.octaves.length > 0) {
    tower = tower_height(nodes, resolved, air).toVar() as unknown as V2;
  }

  const height = tower.x;

  if (nodes.map) {
    const frame = nodes.mapFrame;
    const uv = air.sub(frame.xy).div(frame.z).add(0.5).toVar();
    const inside = uv
      .greaterThanEqual(vec2(0))
      .all()
      .and(uv.lessThanEqual(vec2(1)).all());
    const sampled = texture(nodes.map, uv as unknown as V2);
    const mapped = select(inside, sampled, vec4(0)) as unknown as V4;
    const taller = mapped.x.greaterThan(height);

    return {
      column: vec4(
        max(height, mapped.x),
        mapped.y,
        mapped.z,
        select(taller, mapped.w, tower.y),
      ) as V4,
      air,
    };
  }

  return { column: vec4(height, 0, 0, tower.y) as V4, air };
};

/**
 * Where a point is in a layer's noise: field.ts's `noise_coordinates`.
 * @param nodes The layer
 * @param air Where, in its air
 * @param altitude Its altitude
 * @returns The shape's coordinates and the detail's
 */
export const noise_coordinates = (
  nodes: LayerNodes,
  air: V2,
  altitude: F,
): { shape: V3; detail: V3 } => {
  const s = nodes.stretch;
  const along = dot(air, s.xy).mul(s.z);
  const p = vec3(
    air.x.add(s.x.mul(along)),
    altitude.sub(nodes.rise),
    air.y.add(s.y.mul(along)),
  );
  const o = nodes.noiseOffset;

  return {
    shape: p.div(nodes.billow.mul(SHAPE_CELLS)).add(o) as V3,
    detail: p.div(nodes.detail.mul(DETAIL_CELLS)).add(o.zxy) as V3,
  };
};

/**
 * The shape texture's noise at a point: noise.ts's `shape_noise`.
 * @param shape The texture
 * @param at Where, in tiles
 * @returns 0 to 1
 */
export const shape_noise = (shape: Data3DTexture, at: V3): F =>
  dot(texture3D(shape, at).yzw, vec3(...SHAPE_WEIGHTS))
    .sub(SHAPE_SPREAD[0])
    .div(SHAPE_SPREAD[1] - SHAPE_SPREAD[0])
    .clamp(0, 1) as F;

/**
 * The detail texture's noise at a point: noise.ts's `detail_noise`.
 * @param detail The texture
 * @param at Where, in tiles
 * @returns 0 to 1
 */
export const detail_noise = (detail: Data3DTexture, at: V3): F =>
  dot(texture3D(detail, at).xyz, vec3(0.625, 0.25, 0.125))
    .sub(DETAIL_SPREAD[0])
    .div(DETAIL_SPREAD[1] - DETAIL_SPREAD[0])
    .clamp(0, 1) as F;

/**
 * How much of its water a layer holds at a point: field.ts's
 * `layer_density`.
 * @param nodes The layer
 * @param column Its column there
 * @param altitude The point's altitude
 * @param shape The shape's noise there
 * @param detail The detail's noise there, 1 to leave it out
 * @returns 0 to 1
 */
export const layer_density = (
  nodes: LayerNodes,
  column: V4,
  altitude: F,
  shape: F,
  detail: F,
): F => {
  const height = altitude.sub(nodes.base);
  const worn_shape = shape.oneMinus();
  const worn_detail = detail.oneMinus().mul(nodes.detailReach);

  const reach = nodes.cumuliform
    ? nodes.billow
    : min(nodes.billow, column.x.mul(0.5));
  const under = column.x.sub(height).div(sqrt(column.w.mul(column.w).add(1)));
  const top = under.sub(worn_shape.mul(reach)).sub(worn_detail);
  const base = height.sub(
    worn_shape.mul(reach).add(worn_detail).mul(nodes.roughness),
  );
  const tower = select(
    column.x.greaterThan(0),
    min(top, base).div(nodes.detail).clamp(0, 1),
    float(0),
  );

  const below = nodes.top.sub(altitude);
  const anvil_reach = min(nodes.billow, column.y).mul(0.5);
  const lens = min(below, column.y.sub(below))
    .sub(worn_shape.mul(anvil_reach))
    .sub(worn_detail);
  const anvil = select(
    column.y.greaterThan(0),
    lens.div(nodes.detail).clamp(0, 1),
    float(0),
  );

  return max(tower, anvil) as F;
};

/**
 * Whether a point can be in a layer's cloud or rain at all, from its column:
 * the noise only ever wears the column in.
 * @param nodes The layer
 * @param column Its column there
 * @param altitude The point's altitude
 * @param ground The ground's altitude
 * @returns Whether it can
 */
export const layer_occupied = (
  nodes: LayerNodes,
  column: V4,
  altitude: F,
  ground: F,
): Node<"bool"> => {
  const cloud_top = nodes.base.add(column.x);

  const tower = altitude
    .greaterThanEqual(nodes.base)
    .and(altitude.lessThan(cloud_top));
  const anvil = column.y
    .greaterThan(0)
    .and(altitude.greaterThan(nodes.top.sub(column.y)))
    .and(altitude.lessThanEqual(nodes.top));
  // Rain above the base is in the tower
  const rain = column.z
    .greaterThan(0)
    .and(altitude.greaterThan(ground))
    .and(altitude.lessThan(nodes.base));

  return tower.or(anvil).or(rain) as unknown as Node<"bool">;
};

/**
 * A layer's extinction at a point: field.ts's `layer_extinction`.
 * @param nodes The layer
 * @param table The water table
 * @param layers How many rows it has
 * @param column Its column there
 * @param altitude The point's altitude
 * @param density How much of its water it holds there
 * @param ground The ground's altitude
 * @returns Per metre: droplets, ice, rain
 */
export const layer_extinction = (
  nodes: LayerNodes,
  table: Texture,
  layers: number,
  column: V4,
  altitude: F,
  density: F,
  ground: F,
): V3 => {
  const at = altitude
    .sub(nodes.base)
    .div(nodes.top.sub(nodes.base))
    .clamp(0, 1)
    .mul((TABLE_SIZE - 1) / TABLE_SIZE)
    .add(0.5 / TABLE_SIZE);
  const row = nodes.row.add(0.5).div(layers);
  const sigma = texture(table, vec2(at, row) as unknown as V2).xy;

  const d = max(density, 1e-6);
  const water = sigma.x.mul(pow(d, 2 / 3));
  const ice = sigma.y.mul(d);

  // field.ts's: in the cloud, and in the shaft under its base
  const raining = column.z
    .greaterThan(0)
    .and(altitude.greaterThan(ground))
    .and(
      altitude
        .lessThan(nodes.base)
        .or(
          density
            .greaterThan(0)
            .and(altitude.lessThan(nodes.base.add(column.x))),
        ),
    );

  // Marshall and Palmer: π N₀ / Λ³, Λ = 4.1 R^−0.21 per mm
  const slope = pow(max(column.z, 1e-3), -0.21).mul(4.1);
  const rain = select(
    raining,
    float(Math.PI * 8000 * 1e-6).div(slope.mul(slope).mul(slope)),
    float(0),
  );

  return vec3(
    select(density.greaterThan(0), water, float(0)),
    select(density.greaterThan(0), ice, float(0)),
    rain,
  ) as V3;
};
