import {
  ClampToEdgeWrapping,
  type Data3DTexture,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  RenderTarget3D,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { float, int, screenCoordinate, uniform, vec3, vec4 } from "three/tsl";
import {
  NodeMaterial,
  QuadMesh,
  RendererUtils,
  type Node,
  type Renderer,
} from "three/webgpu";
import { DETAIL_CELLS, SHAPE_CELLS } from "./noise";
import { perlin_worley, worley } from "./tsl/noise";

// The noise baked into textures, from the seed, on the GPU
//
// The shape's: 128 texels a side, four channels, Perlin–Worley and three
// octaves of cellular noise, each finer. The detail's: 64 a side, three
// octaves of finer cellular noise still. The finest of each has 8 texels a
// cell. Eight bits a channel is all noise
// that is filtered wants. Baked a slice at a time into a 3D render target,
// each texel the very function the CPU evaluates at its centre

/** The noise textures' texels a side */
export const SHAPE_SIZE = 128;
export const DETAIL_SIZE = 64;

type F = Node<"float">;
type V3 = Node<"vec3">;
type I = Node<"int">;
type U = Node<"uint">;

/**
 * A 3D noise texture's render target, repeating and filtered.
 * @param size Its texels a side
 * @param name Its name
 * @returns The target
 */
const noise_target = (size: number, name: string): RenderTarget3D => {
  const target = new RenderTarget3D(size, size, size, {
    type: UnsignedByteType,
    format: RGBAFormat,
    depthBuffer: false,
    generateMipmaps: false,
  });
  const texture = target.texture as Data3DTexture;

  texture.name = name;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;

  return target;
};

/**
 * The seed's noise, baked.
 */
export type NoiseTextures = {
  shape: RenderTarget3D;
  detail: RenderTarget3D;

  /** Bake it, for a seed's salts */
  bake: (renderer: Renderer, shape_salt: number, detail_salt: number) => void;

  dispose: () => void;
};

/**
 * The noise textures, made but not yet baked.
 * @returns Them
 */
export const create_noise_textures = (): NoiseTextures => {
  const shape = noise_target(SHAPE_SIZE, "weather.shape");
  const detail = noise_target(DETAIL_SIZE, "weather.detail");

  const slice = uniform(0);
  const salt = uniform(0, "uint");

  // A texel's centre in its tile, 0 to 1
  const where = (size: number): V3 =>
    vec3(screenCoordinate.x, screenCoordinate.y, slice.add(0.5)).div(
      size,
    ) as unknown as V3;

  const octave = (p: V3, cells: number, scale: number): F =>
    worley(
      p.mul(cells * scale) as V3,
      int(cells * scale) as unknown as I,
      salt as unknown as U,
    );

  const shape_material = new NodeMaterial();

  shape_material.name = "weather.shape";
  shape_material.fragmentNode = (() => {
    const p = where(SHAPE_SIZE);
    const c = SHAPE_CELLS;

    return vec4(
      perlin_worley(
        p.mul(c) as V3,
        int(c) as unknown as I,
        salt as unknown as U,
      ),
      octave(p, c, 1),
      octave(p, c, 2),
      octave(p, c, 4),
    );
  })();

  const detail_material = new NodeMaterial();

  detail_material.name = "weather.detail";
  detail_material.fragmentNode = (() => {
    const p = where(DETAIL_SIZE);
    const c = DETAIL_CELLS;

    return vec4(octave(p, c, 1), octave(p, c, 2), octave(p, c, 4), float(1));
  })();

  const quad = new QuadMesh(shape_material);

  // Made on the first bake, kept after: the types ask for one the first time
  let state = undefined as unknown as RendererUtils.RendererState;

  const bake_into = (
    renderer: Renderer,
    target: RenderTarget3D,
    material: NodeMaterial,
    value: number,
  ) => {
    salt.value = value;
    quad.material = material;

    for (let index = 0; index < target.depth; index++) {
      slice.value = index;
      renderer.setRenderTarget(target, index);
      quad.render(renderer);
    }
  };

  return {
    shape,
    detail,
    bake: (renderer, shape_salt, detail_salt) => {
      state = RendererUtils.resetRendererState(renderer, state);

      bake_into(renderer, shape, shape_material, shape_salt);
      bake_into(renderer, detail, detail_material, detail_salt);

      RendererUtils.restoreRendererState(renderer, state);
    },
    dispose: () => {
      shape.dispose();
      detail.dispose();
      shape_material.dispose();
      detail_material.dispose();
    },
  };
};

/**
 * A texture of half floats, four channels, filtered and clamped, for data
 * baked on the CPU.
 * @param width Its width
 * @param height Its height
 * @param name Its name
 * @returns It, and how to fill it from floats
 */
export const create_half_texture = (
  width: number,
  height: number,
  name: string,
) => {
  const data = new Uint16Array(width * height * 4);
  const texture = new DataTexture(
    data,
    width,
    height,
    RGBAFormat,
    HalfFloatType,
  );

  texture.name = name;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,

    /**
     * Fill it.
     * @param values Four floats a texel
     */
    write: (values: ArrayLike<number>) => {
      for (let index = 0; index < data.length; index++) {
        data[index] = DataUtils.toHalfFloat(values[index]);
      }

      texture.needsUpdate = true;
    },
  };
};
