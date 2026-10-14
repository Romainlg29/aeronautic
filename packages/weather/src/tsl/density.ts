import { type Texture, Vector2, Vector3, Vector4 } from "three";
import {
  dot,
  float,
  If,
  max,
  pow,
  select,
  texture,
  texture3D,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { Climate } from "../climate";
import {
  CIRRUS_STRETCH,
  EDGE_SOFTNESS,
  MEAN_FROM,
  MEAN_TO,
  RAIN_COEFFICIENT,
  RAIN_EXPONENT,
  RAIN_SHAFTS_MEAN,
  SHALLOW_SHAPE,
  TABLE_RANGE_M,
  TABLE_ROW_COUNT,
  TABLE_ROWS,
  TABLE_SIZE,
  TOWER_SHAPE,
  TOWER_UPDRAFT_M_S,
  type ShapeFrame,
  type SheetLid,
} from "../density";
import type { MapFrame } from "../map";
import {
  COVERAGE_SIZE,
  DETAIL_REACH,
  DETAIL_TERMS,
  SHAPE_PEAK,
  SHAPE_SPREAD,
  SHAPE_WEIGHTS,
  UNION_COS,
  UNION_OFFSET,
  UNION_SCALE,
  UNION_SIN,
} from "../noise";

// density.ts in TSL: the cloud at a point of the march, as the CPU works it
// out
//
// The scene's points are near its origin, but the air's frame runs on for
// thousands of kilometres, past what a float holds to the metre. So the CPU
// works out, in doubles, where the scene's origin is in each noise's tile
// and in the map, and the shader only adds the point's offset from it

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

type Uniform<T, N> = N & { value: T };

/**
 * What the shader reads the clouds from: their textures, and where the
 * scene's origin is in them.
 */
export type FieldNodes = {
  shape: Texture;
  detail: Texture;
  table: Texture;
  covers: Texture;
  heights: Texture;
  rest: Texture;

  /** The scene's origin in the map, metres from its centre, and its side */
  mapOrigin: Uniform<Vector2, V2>;
  mapExtent: Uniform<number, F>;

  /** The far map's, the same */
  far: { covers: Texture; heights: Texture; rest: Texture };
  farOrigin: Uniform<Vector2, V2>;
  farExtent: Uniform<number, F>;

  /**
   * The scene's origin in each noise's tile, 0 to 1 each way: the cumulus',
   * the sheets', the altostratus', the cirrus', the rain's, the detail's.
   * The shape's union does not repeat with the tile, so each of its two
   * reads has its own, wrapped from the unwrapped origin in doubles
   */
  cumulusOrigin: UnionOrigin;
  stratusOrigin: UnionOrigin;
  altoOrigin: UnionOrigin;
  cirrusOrigin: UnionOrigin;
  rainOrigin: UnionOrigin;
  detailOrigin: Uniform<Vector3, V3>;

  /**
   * One over each noise's tile: the cumulus', the sheets', the
   * altostratus', the cirrus'; the rain's and the detail's; and how much
   * flatter the sheets are
   */
  tiles: Uniform<Vector4, V4>;
  rainTile: Uniform<number, F>;
  detailTile: Uniform<number, F>;
  flatten: Uniform<number, F>;

  /** The upper wind's direction, x and z */
  upper: Uniform<Vector2, V2>;

  /** The scene origin's altitude, which the tiles' origins are at */
  altitude: Uniform<number, F>;

  /** The climate's ground, cirrus and tropopause */
  ground: Uniform<number, F>;
  cirrusBase: Uniform<number, F>;
  cirrusDepth: Uniform<number, F>;
  tropopause: Uniform<number, F>;
};

/** The scene's origin in the union's two reads, the plain and the turned */
export type UnionOrigin = { a: Uniform<Vector3, V3>; b: Uniform<Vector3, V3> };

const v2 = () => uniform(new Vector2()) as unknown as Uniform<Vector2, V2>;
const v3 = () => uniform(new Vector3()) as unknown as Uniform<Vector3, V3>;
const union_origin = (): UnionOrigin => ({ a: v3(), b: v3() });
const f1 = (value = 0) => uniform(value) as unknown as Uniform<number, F>;

/**
 * The field's nodes, for its textures.
 * @param textures The noise, the water table and the map
 * @returns Them
 */
export const create_field_nodes = (textures: {
  shape: Texture;
  detail: Texture;
  table: Texture;
  map: readonly [Texture, Texture, Texture];
  far: readonly [Texture, Texture, Texture];
}): FieldNodes => ({
  shape: textures.shape,
  detail: textures.detail,
  table: textures.table,
  covers: textures.map[0],
  heights: textures.map[1],
  rest: textures.map[2],
  mapOrigin: v2(),
  mapExtent: f1(1),
  far: {
    covers: textures.far[0],
    heights: textures.far[1],
    rest: textures.far[2],
  },
  farOrigin: v2(),
  farExtent: f1(1),
  cumulusOrigin: union_origin(),
  stratusOrigin: union_origin(),
  altoOrigin: union_origin(),
  cirrusOrigin: union_origin(),
  rainOrigin: union_origin(),
  detailOrigin: v3(),
  tiles: uniform(new Vector4(1, 1, 1, 1)) as unknown as Uniform<Vector4, V4>,
  rainTile: f1(1),
  detailTile: f1(1),
  flatten: f1(1),
  upper: v2(),
  altitude: f1(),
  ground: f1(),
  cirrusBase: f1(),
  cirrusDepth: f1(1),
  tropopause: f1(),
});

const fract = (v: number) => v - Math.floor(v);

/**
 * Bring the field's uniforms to where the scene's origin is in the air.
 * @param nodes The nodes
 * @param air The scene origin's x and z in the low clouds' air
 * @param altitude_m Its altitude
 * @param climate The climate
 * @param shapes The noise's frame
 * @param map Where the map is
 * @param far Where the far map is
 */
export const update_field_nodes = (
  nodes: FieldNodes,
  air: readonly [number, number],
  altitude_m: number,
  climate: Climate,
  shapes: ShapeFrame,
  map: MapFrame | null,
  far: MapFrame | null,
): void => {
  const [x, z] = air;
  const { scales, offset } = shapes;
  const [ox, oy, oz] = offset;

  // No map yet: far off it, where it holds nothing
  const place = (
    origin: Uniform<Vector2, V2>,
    extent: Uniform<number, F>,
    frame: MapFrame | null,
  ) => {
    if (frame) {
      origin.value.set(x - frame.x, z - frame.z);
      extent.value = frame.extentM;
    } else {
      origin.value.set(1e9, 1e9);
    }
  };

  place(nodes.mapOrigin, nodes.mapExtent, map);
  place(nodes.farOrigin, nodes.farExtent, far);

  // The origin's place in the union's two reads, from where it is in tiles,
  // unwrapped: a wrap of a whole tile would move the turned read, which
  // does not repeat with it, and the clouds would jump
  const union = (target: UnionOrigin, u: number, v: number, w: number) => {
    target.a.value.set(
      fract(u * UNION_SCALE),
      fract(v * UNION_SCALE),
      fract(w * UNION_SCALE),
    );
    target.b.value.set(
      fract((UNION_COS * u - UNION_SIN * w) * UNION_SCALE + UNION_OFFSET[0]),
      fract(v * UNION_SCALE + UNION_OFFSET[1]),
      fract((UNION_SIN * u + UNION_COS * w) * UNION_SCALE + UNION_OFFSET[2]),
    );
  };

  // Its altitude's too, the sheets flattened
  const origin = (target: UnionOrigin, tile: number, flatten: number) =>
    union(
      target,
      x / tile + ox,
      (altitude_m * flatten) / tile + oy,
      z / tile + oz,
    );

  origin(nodes.cumulusOrigin, scales.cumulus, 1);
  origin(nodes.stratusOrigin, scales.stratus, scales.flatten);
  origin(nodes.altoOrigin, scales.alto, scales.flatten);

  // The cirrus, along the upper wind and across it, carried past the low air
  const [ux, uz] = shapes.upper;
  const cx = x - shapes.drift[0];
  const cz = z - shapes.drift[1];

  union(
    nodes.cirrusOrigin,
    (cx * ux + cz * uz) / CIRRUS_STRETCH / scales.cirrus + ox,
    (altitude_m * scales.flatten) / scales.cirrus + oy,
    (-cx * uz + cz * ux) / scales.cirrus + oz,
  );

  // The rain's shafts, drawn out six times taller
  union(
    nodes.rainOrigin,
    x / scales.rain + ox,
    altitude_m / 6 / scales.rain + oy,
    z / scales.rain + oz,
  );
  nodes.detailOrigin.value.set(
    fract(x / scales.detail),
    fract(altitude_m / scales.detail),
    fract(z / scales.detail),
  );

  nodes.tiles.value.set(
    1 / scales.cumulus,
    1 / scales.stratus,
    1 / scales.alto,
    1 / scales.cirrus,
  );
  nodes.rainTile.value = 1 / scales.rain;
  nodes.detailTile.value = 1 / scales.detail;
  nodes.flatten.value = scales.flatten;
  nodes.upper.value.set(ux, uz);
  nodes.altitude.value = altitude_m;
  nodes.ground.value = climate.groundM;
  nodes.cirrusBase.value = climate.cirrusBaseM;
  nodes.cirrusDepth.value = climate.cirrusDepthM;
  nodes.tropopause.value = climate.tropopauseM;
};

/**
 * The column over a point of the scene, as the map holds it.
 */
export type ColumnNodes = {
  /** cumulus, stratus, alto, cirrus */
  covers: V4;

  /** base, cumulus top, stratus top, alto base */
  heights: V4;

  /** alto top, anvil depth, rain, updraft */
  rest: V4;
};

/**
 * The column over a point of the scene: the map's, bilinearly.
 * @param nodes The field
 * @param xz The point, in the scene
 * @param far Whether from the far map
 * @returns Its column
 */
export const map_column = (
  nodes: FieldNodes,
  xz: V2,
  far = false,
): ColumnNodes => {
  const origin = far ? nodes.farOrigin : nodes.mapOrigin;
  const extent = far ? nodes.farExtent : nodes.mapExtent;
  const maps = far ? nodes.far : nodes;
  const uv = xz.add(origin).div(extent).add(0.5) as V2;

  return {
    covers: texture(maps.covers, uv).toVar() as unknown as V4,
    heights: texture(maps.heights, uv).toVar() as unknown as V4,
    rest: texture(maps.rest, uv).toVar() as unknown as V4,
  };
};

/**
 * The shape noise: noise.ts's `shape_noise`, of its `shape_union`.
 * @param nodes The field
 * @param origin The scene's origin in the union's reads
 * @param at Where, in tiles from the scene's origin
 * @returns 0 to 1
 */
const shape_noise = (nodes: FieldNodes, origin: UnionOrigin, at: V3): F => {
  const turned = vec3(
    at.x.mul(UNION_COS).sub(at.z.mul(UNION_SIN)),
    at.y,
    at.x.mul(UNION_SIN).add(at.z.mul(UNION_COS)),
  );
  const a = texture3D(nodes.shape, at.mul(UNION_SCALE).add(origin.a)).yzw;
  const b = texture3D(nodes.shape, turned.mul(UNION_SCALE).add(origin.b)).yzw;

  return dot(max(a, b), vec3(...SHAPE_WEIGHTS))
    .sub(SHAPE_SPREAD[0])
    .div(SHAPE_SPREAD[1] - SHAPE_SPREAD[0]) as F;
};

/**
 * The detail noise: noise.ts's `detail_noise`.
 * @param nodes The field
 * @param at Where, in tiles
 * @returns 0 to 1
 */
const detail_noise = (nodes: FieldNodes, at: V3): F =>
  dot(texture3D(nodes.detail, at).xyz, vec3(...DETAIL_TERMS.weights)).sub(
    DETAIL_TERMS.offset,
  ) as F;

/**
 * An entry of the water table: density.ts's `table_at`, the texture's
 * filtering doing the interpolation.
 * @param nodes The field
 * @param row Its row
 * @param height The height above the layer's base
 * @returns The droplets' coefficient in x, the ice's in y
 */
const table_at = (nodes: FieldNodes, row: number, height: F): V2 => {
  const at = height
    .div(TABLE_RANGE_M)
    .mul(TABLE_SIZE - 1)
    .clamp(0, TABLE_SIZE - 1);

  return texture(
    nodes.table,
    vec2(at.add(0.5).div(TABLE_SIZE), (row + 0.5) / TABLE_ROW_COUNT),
  ).xy as unknown as V2;
};

/**
 * The noise's threshold for a cover: noise.ts's `coverage_threshold`.
 * @param nodes The field
 * @param cover The cover
 * @returns The threshold
 */
const threshold = (nodes: FieldNodes, cover: F): F =>
  texture(
    nodes.table,
    vec2(
      cover
        .clamp(0, 1)
        .mul(COVERAGE_SIZE - 1)
        .add(0.5)
        .div(TABLE_SIZE),
      (TABLE_ROWS.coverage + 0.5) / TABLE_ROW_COUNT,
    ),
  ).x as unknown as F;

const saturate = (x: F): F => x.clamp(0, 1) as F;

/**
 * The mean, over the billows, of the density a cut leaves and of its ⅔
 * power: density.ts's `mean_density`, from the table.
 * @param nodes The field
 * @param edge The cut
 * @returns The mean of d^⅔ in x, of d in y
 */
const mean_at = (nodes: FieldNodes, edge: F): V2 =>
  texture(
    nodes.table,
    vec2(
      edge
        .sub(MEAN_FROM)
        .div(MEAN_TO - MEAN_FROM)
        .mul(TABLE_SIZE - 1)
        .clamp(0, TABLE_SIZE - 1)
        .add(0.5)
        .div(TABLE_SIZE),
      (TABLE_ROWS.mean + 0.5) / TABLE_ROW_COUNT,
    ),
  ).xy as unknown as V2;

/**
 * The cloud at a point, as it is drawn.
 */
export type CloudNodes = {
  /** The droplets' extinction: the cumulus', the sheets', the altostratus' */
  water: V3;

  /** The ice's and the rain's */
  ice: F;
  rain: F;

  /** The rain's without its shafts: their mean, for a long path through it */
  rainMean: F;

  /** The optical depth over it to its cloud's top, and under it to its base */
  up: F;
  down: F;
};

/**
 * The cloud at a point of the scene: density.ts's `cloud_extinction`.
 * @param nodes The field
 * @param p The point, in the scene
 * @param altitude Its altitude, above sea level, the earth's curve counted
 * @param column The column over it
 * @param detail_share How much of the detail noise wears it: 1 near, 0 past
 *   the detail's reach, where its mean does instead and it is not sampled
 * @param lit Whether its light is wanted: the cloud over and under it
 * @param mean Whether as the mean of its billows, as a far step through many
 *   of them sees it: no noise is read
 * @returns The cloud there
 */
export const cloud_at = (
  nodes: FieldNodes,
  p: V3,
  altitude: F,
  column: ColumnNodes,
  detail_share: F | null,
  lit: boolean,
  mean = false,
): CloudNodes => {
  const { covers, heights, rest } = column;
  const water = vec3(0).toVar();
  const ice = float(0).toVar();
  const rain = float(0).toVar();
  const rain_mean = float(0).toVar();
  const up = float(0).toVar();
  const down = float(0).toVar();
  const a = altitude;
  const shares = mean ? null : detail_share;

  // The point, its height measured as its altitude above the origin's: the
  // layers follow the earth's curve
  const q = vec3(p.x, a.sub(nodes.altitude), p.z).toVar();

  // The detail, sampled once, on the first cloud the point is in, faded
  // out past its reach
  const detail = float(0).toVar();
  const sampled = float(0).toVar();
  const detail_value = (): F => {
    if (shares) {
      If(sampled.equal(0).and(shares.greaterThan(0)), () => {
        const at = q
          .mul(nodes.detailTile)
          .add(nodes.detailOrigin) as unknown as V3;

        detail.assign(detail_noise(nodes, at).mul(shares));
        sampled.assign(1);
      });
    }

    return detail;
  };

  // A layer's water, its droplets going as d^⅔ and its ice as d
  const deposit = (
    row: number,
    base: F,
    top: F,
    liquid_share: F,
    frozen_share: F,
    channel: "x" | "y" | "z" | null,
  ) => {
    const coefficients = table_at(nodes, row, a.sub(base)).toVar();
    const liquid = coefficients.x.mul(liquid_share);
    const frozen = coefficients.y.mul(frozen_share);
    const here = liquid.add(frozen);

    if (channel === "x") water.addAssign(vec3(liquid, 0, 0));
    else if (channel === "y") water.addAssign(vec3(0, liquid, 0));
    else if (channel === "z") water.addAssign(vec3(0, 0, liquid));
    else ice.addAssign(liquid);

    ice.addAssign(frozen);

    if (lit) {
      up.addAssign(here.mul(top.sub(a).max(0)));
      down.addAssign(here.mul(a.sub(base).max(0)));
    }
  };

  // A layer cut from its noise at an edge, its density shaped by a profile
  // through it. Near, from the noise lifted by the detail, only sampled
  // where the most detail could make cloud; far, the mean of what the cut
  // leaves, the profile being smooth over a billow
  const add = (
    row: number,
    base: F,
    top: F,
    noise: () => F,
    edge: F,
    profile: F | null,
    channel: "x" | "y" | "z" | null,
  ) => {
    if (mean) {
      const m = mean_at(nodes, edge).toVar();

      If(m.y.greaterThan(0), () => {
        deposit(
          row,
          base,
          top,
          (profile ? m.x.mul(pow(profile, 2 / 3)) : m.x) as F,
          (profile ? m.y.mul(profile) : m.y) as F,
          channel,
        );
      });

      return;
    }

    const n = noise().toVar();
    const density_of = (shift: F | number): F => {
      const d = saturate(n.add(shift).sub(edge).div(EDGE_SOFTNESS) as F);

      return (profile ? d.mul(profile) : d) as F;
    };

    If(density_of(shares ? DETAIL_REACH : 0).greaterThan(0), () => {
      const d = density_of(detail_value()).toVar();

      If(d.greaterThan(0), () => {
        deposit(row, base, top, pow(d, 2 / 3) as F, d as F, channel);
      });
    });
  };

  // The point in a layer's tile
  const in_tile = (tile: F, flatten: F | number): V3 =>
    vec3(q.x, q.y.mul(flatten), q.z).mul(tile) as unknown as V3;

  const sheet_profile = (h: F): F => {
    const s = saturate(h).mul(2).sub(1);
    const s2 = s.mul(s);

    return s2.mul(s2).oneMinus() as F;
  };

  // density.ts's sheet_density: the cut rising to the noise's peak away from
  // where the sheet saturates first
  const sheet_edge = (h: F, cover: F, lid: SheetLid): F => {
    const t = threshold(nodes, cover);
    const away =
      lid === "top" ? saturate(h).oneMinus() : saturate(h).mul(2).sub(1).abs();

    return t.add(float(SHAPE_PEAK).sub(t).mul(away)) as F;
  };

  // Cumulus
  const base = heights.x;
  const top = heights.y;

  If(
    covers.x.greaterThan(0.001).and(a.greaterThan(base)).and(a.lessThan(top)),
    () => {
      const h = a.sub(base).div(top.sub(base).max(1));
      const k = saturate(rest.w.div(TOWER_UPDRAFT_M_S))
        .mul(TOWER_SHAPE - SHALLOW_SHAPE)
        .add(SHALLOW_SHAPE);
      const t = threshold(nodes, covers.x as F);
      const edge = t.add(
        float(SHAPE_PEAK)
          .sub(t)
          .mul(pow(saturate(h as F), k)),
      );

      add(
        TABLE_ROWS.cumulus,
        base as F,
        top as F,
        () =>
          shape_noise(
            nodes,
            nodes.cumulusOrigin,
            in_tile(nodes.tiles.x as F, 1),
          ),
        edge as F,
        null,
        "x",
      );
    },
  );

  // The deck, under the inversion
  const deck_top = heights.z;
  const deck_base = base.min(deck_top.sub(150));

  If(
    covers.y
      .greaterThan(0.001)
      .and(a.greaterThan(deck_base))
      .and(a.lessThan(deck_top)),
    () => {
      const h = a.sub(deck_base).div(deck_top.sub(deck_base).max(1)) as F;

      add(
        TABLE_ROWS.stratus,
        deck_base as F,
        deck_top as F,
        () =>
          shape_noise(
            nodes,
            nodes.stratusOrigin,
            in_tile(nodes.tiles.y as F, nodes.flatten),
          ),
        sheet_edge(h, covers.y as F, "top"),
        sheet_profile(h),
        "y",
      );
    },
  );

  // Altostratus
  const alto_base = heights.w;
  const alto_top = rest.x;

  If(
    covers.z
      .greaterThan(0.001)
      .and(a.greaterThan(alto_base))
      .and(a.lessThan(alto_top)),
    () => {
      const h = a.sub(alto_base).div(alto_top.sub(alto_base).max(1)) as F;

      add(
        TABLE_ROWS.alto,
        alto_base as F,
        alto_top as F,
        () =>
          shape_noise(
            nodes,
            nodes.altoOrigin,
            in_tile(nodes.tiles.z as F, nodes.flatten),
          ),
        sheet_edge(h, covers.z as F, "none"),
        sheet_profile(h),
        "z",
      );
    },
  );

  // Cirrus, drawn out along the upper wind
  const cirrus_top = nodes.cirrusBase.add(nodes.cirrusDepth);

  If(
    covers.w
      .greaterThan(0.001)
      .and(a.greaterThan(nodes.cirrusBase))
      .and(a.lessThan(cirrus_top)),
    () => {
      const h = a.sub(nodes.cirrusBase).div(nodes.cirrusDepth) as F;

      add(
        TABLE_ROWS.cirrus,
        nodes.cirrusBase,
        cirrus_top as F,
        () => {
          const u = nodes.upper;
          const along = q.x.mul(u.x).add(q.z.mul(u.y)).div(CIRRUS_STRETCH);
          const across = q.z.mul(u.x).sub(q.x.mul(u.y));
          const at = vec3(along, q.y.mul(nodes.flatten), across).mul(
            nodes.tiles.w,
          ) as unknown as V3;

          return shape_noise(nodes, nodes.cirrusOrigin, at);
        },
        sheet_edge(h, covers.w as F, "none"),
        sheet_profile(h),
        null,
      );
    },
  );

  // An anvil, under the tropopause
  const anvil = rest.y;
  const anvil_base = nodes.tropopause.sub(anvil);

  If(
    anvil
      .greaterThan(1)
      .and(a.greaterThan(anvil_base))
      .and(a.lessThan(nodes.tropopause)),
    () => {
      const h = a.sub(anvil_base).div(anvil) as F;

      add(
        TABLE_ROWS.anvil,
        anvil_base as F,
        nodes.tropopause,
        () =>
          shape_noise(
            nodes,
            nodes.stratusOrigin,
            in_tile(nodes.tiles.y as F, nodes.flatten),
          ),
        sheet_edge(h, float(0.95), "top"),
        sheet_profile(h),
        null,
      );
    },
  );

  // Rain, under the cloud it falls from, in shafts
  const rate = rest.z;

  If(rate.greaterThan(0.01), () => {
    const from = select(
      covers.x.greaterThan(0.01),
      base,
      select(covers.z.greaterThan(0.01), alto_base, deck_base),
    ).toVar();

    If(a.lessThan(from).and(a.greaterThan(nodes.ground)), () => {
      // Under a cumulus, only where there is cloud at its base to fall from:
      // far off, the share of its base there is
      const under = float(1).toVar();

      If(covers.x.greaterThan(0.01).and(covers.x.lessThan(0.99)), () => {
        const cut = threshold(nodes, covers.x as F);

        if (mean) {
          under.assign(mean_at(nodes, cut).y);
        } else {
          const at = vec3(q.x, from.add(1).sub(nodes.altitude), q.z).mul(
            nodes.tiles.x,
          ) as unknown as V3;

          under.assign(
            saturate(
              shape_noise(nodes, nodes.cumulusOrigin, at)
                .sub(cut)
                .div(EDGE_SOFTNESS) as F,
            ),
          );
        }
      });

      const unshafted = pow(rate, RAIN_EXPONENT)
        .mul(RAIN_COEFFICIENT)
        .mul(under)
        .toVar();

      rain_mean.assign(unshafted.mul(RAIN_SHAFTS_MEAN));

      if (mean) {
        rain.assign(rain_mean);
      } else {
        const shafts = shape_noise(
          nodes,
          nodes.rainOrigin,
          vec3(q.x, q.y.div(6), q.z).mul(nodes.rainTile) as unknown as V3,
        );

        rain.assign(unshafted.mul(saturate(shafts.mul(1.6).sub(0.2) as F)));
      }
    });
  });

  return { water, ice, rain, rainMean: rain_mean, up, down };
};
