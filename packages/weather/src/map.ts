import {
  cell_cloud,
  cloud_reach,
  dome_slope,
  sheet_column,
  type Cloud,
  type Column,
  type ResolvedLayer,
} from "./field";

// The weather map: what of a layer is too large and too smooth to work out
// per sample, baked once over the ground round the camera
//
// A cumulus tower is worked out where it is sampled, from its cell, at any
// scale; everything kilometres across is baked here instead: a sheet's
// coverage, an anvil's lens, the rain under the clouds, and the storms placed
// by hand. Four channels, per texel:
//
// - red: how high cloud reaches above the base, metres, of a sheet or a storm
//   placed by hand
// - green: how thick an anvil hangs under the top, metres
// - blue: how hard it rains, mm/h
// - alpha: how steep the tower's dome is there, metres a metre
//
// The map follows the camera through the layer's air, baked again once the
// camera has crossed a quarter of it

/** The map's channels per texel */
export const MAP_CHANNELS = 4;

/**
 * Where a map lies, in its layer's air.
 */
export type MapFrame = {
  /** Its centre, metres */
  x: number;
  z: number;

  /** How much ground it spans a side, metres */
  extent: number;

  /** Its texels a side */
  size: number;
};

/**
 * Lay one cloud's columns over the texels it covers: its tower if it is laid
 * by hand, its anvil and its rain.
 * @param out The map
 * @param frame Where it lies
 * @param cloud The cloud
 * @param tower Whether to lay its tower too
 */
const rasterise = (
  out: Float32Array,
  frame: MapFrame,
  cloud: Cloud,
  tower: boolean,
): void => {
  const { extent, size } = frame;
  const texel = extent / size;
  const left = frame.x - extent / 2;
  const top = frame.z - extent / 2;
  const reach = cloud_reach(cloud);

  const i0 = Math.max(Math.floor((cloud.x - reach - left) / texel), 0);
  const i1 = Math.min(Math.ceil((cloud.x + reach - left) / texel), size - 1);
  const j0 = Math.max(Math.floor((cloud.z - reach - top) / texel), 0);
  const j1 = Math.min(Math.ceil((cloud.z + reach - top) / texel), size - 1);

  for (let j = j0; j <= j1; j++) {
    const z = top + (j + 0.5) * texel;

    for (let i = i0; i <= i1; i++) {
      const x = left + (i + 0.5) * texel;
      const at = (j * size + i) * MAP_CHANNELS;

      const dx = x - cloud.x;
      const dz = z - cloud.z;
      const r2 = (dx * dx + dz * dz) / (cloud.radius * cloud.radius);

      if (r2 < 1) {
        const bump = 1 - r2;

        const height = cloud.height * bump ** (1 / cloud.crown);

        if (tower && height > out[at]) {
          out[at] = height;
          out[at + 3] = dome_slope(cloud, r2);
        }

        out[at + 2] = Math.max(out[at + 2], cloud.rain * bump * bump);
      }

      const { anvil } = cloud;

      if (anvil) {
        const ax = x - anvil.x;
        const az = z - anvil.z;
        const a2 = (ax * ax + az * az) / (anvil.radius * anvil.radius);

        if (a2 < 1) {
          out[at + 1] = Math.max(
            out[at + 1],
            anvil.thickness * Math.sqrt(1 - a2),
          );
        }
      }
    }
  }
};

/**
 * Whether a layer has anything for the map: a sheet, anvils, rain or clouds
 * laid by hand.
 * @param resolved The layer
 * @returns Whether it does
 */
export const layer_has_map = (resolved: ResolvedLayer): boolean =>
  resolved.layer.form === "stratiform" ||
  resolved.layer.anvil !== undefined ||
  resolved.layer.rainMmPerH > 0 ||
  (resolved.layer.cells?.length ?? 0) > 0;

/**
 * Bake a layer's map.
 * @param resolved The layer
 * @param hand Its clouds laid by hand
 * @param frame Where the map lies
 * @param out Where to write it: size² texels of four channels, cleared here
 * @returns out
 */
export const bake_map = (
  resolved: ResolvedLayer,
  hand: readonly Cloud[],
  frame: MapFrame,
  out: Float32Array = new Float32Array(frame.size * frame.size * MAP_CHANNELS),
): Float32Array => {
  const { extent, size } = frame;
  const texel = extent / size;
  const left = frame.x - extent / 2;
  const top = frame.z - extent / 2;

  out.fill(0);

  if (resolved.layer.form === "stratiform") {
    const column: Column = { height: 0, slope: 0, anvil: 0, rain: 0 };

    for (let j = 0; j < size; j++) {
      const z = top + (j + 0.5) * texel;

      for (let i = 0; i < size; i++) {
        const at = (j * size + i) * MAP_CHANNELS;

        column.height = 0;
        column.rain = 0;
        sheet_column(resolved, left + (i + 0.5) * texel, z, column);

        out[at] = column.height;
        out[at + 2] = column.rain;
      }
    }
  } else if (resolved.layer.anvil || resolved.layer.rainMmPerH > 0) {
    // The cells' anvils and rain, each laid over the texels it reaches
    const anvil = resolved.layer.anvil;

    for (const [index, octave] of resolved.octaves.entries()) {
      const { spacing } = octave;
      const reach = anvil ? (anvil.diameterM * (1 + anvil.drift)) / 2 : spacing;

      const i0 = Math.floor((left - reach) / spacing);
      const i1 = Math.floor((left + extent + reach) / spacing);
      const j0 = Math.floor((top - reach) / spacing);
      const j1 = Math.floor((top + extent + reach) / spacing);

      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cloud = cell_cloud(resolved, index, i, j);

          if (cloud) rasterise(out, frame, cloud, false);
        }
      }
    }
  }

  for (const cloud of hand) rasterise(out, frame, cloud, true);

  return out;
};
