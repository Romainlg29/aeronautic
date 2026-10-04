import {
  Data3DTexture,
  LinearFilter,
  RGFormat,
  RepeatWrapping,
  UnsignedByteType,
} from "three";

// The eddies' noise, baked once into a small tiling volume
//
// Hashed value noise costs eight hashes and seven mixes an octave, and the
// eddies are the dearest part of a sample. Baked into a 3D texture, an octave
// is one filtered fetch. It is built here at start up, as the blackbody lookup
// is, so the plume still ships no assets
//
// Gradient noise rather than value noise, now that it costs nothing more: its
// lattice does not show through once the domain is stretched along the flow.
// It is graded to the mean and spread value noise had, so every dial that was
// tuned against the one reads the same against the other

/** How many texels the volume has along each side */
export const NOISE_VOLUME_TEXELS = 64;

/** How many noise cells one tile of the volume spans along each side */
export const NOISE_VOLUME_PERIOD = 16;

// What one octave of the old value noise averaged, and how far it strayed
const VALUE_NOISE_MEAN = 0.5;
const VALUE_NOISE_DEVIATION = 0.184;

// Fixed seeds, so every build of the volume is the same volume: one per channel
const SEEDS = [0x5eed1e55, 0x0dd5eed5];

/**
 * A small seeded generator, uniform in [0, 1).
 * @param seed Where to start
 * @returns The generator
 */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * One unit gradient per lattice point of a tile, uniform over the sphere.
 * @param period Lattice points along each side
 * @param seed Which lattice
 * @returns xyz per point
 */
const lattice_gradients = (period: number, seed: number): Float32Array => {
  const random = mulberry32(seed);
  const gradients = new Float32Array(period * period * period * 3);

  for (let index = 0; index < period * period * period; index++) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);

    gradients[index * 3] = ring * Math.cos(angle);
    gradients[index * 3 + 1] = ring * Math.sin(angle);
    gradients[index * 3 + 2] = z;
  }

  return gradients;
};

// Perlin's quintic, whose first and second derivatives vanish at the lattice
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Gradient noise that tiles every `period` cells.
 * @param x Where to sample it, in cells
 * @param y Where to sample it, in cells
 * @param z Where to sample it, in cells
 * @param gradients The lattice's gradients
 * @param period How many cells before it repeats
 * @returns Noise, about zero
 */
const gradient_noise = (
  x: number,
  y: number,
  z: number,
  gradients: Float32Array,
  period: number,
): number => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const cz = Math.floor(z);

  const fx = x - cx;
  const fy = y - cy;
  const fz = z - cz;

  const wrap = (value: number) => ((value % period) + period) % period;

  const corner = (i: number, j: number, k: number) => {
    const index =
      (wrap(cx + i) * period + wrap(cy + j)) * period + wrap(cz + k);

    return (
      gradients[index * 3] * (fx - i) +
      gradients[index * 3 + 1] * (fy - j) +
      gradients[index * 3 + 2] * (fz - k)
    );
  };

  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);

  return lerp(
    lerp(
      lerp(corner(0, 0, 0), corner(1, 0, 0), u),
      lerp(corner(0, 1, 0), corner(1, 1, 0), u),
      v,
    ),
    lerp(
      lerp(corner(0, 0, 1), corner(1, 0, 1), u),
      lerp(corner(0, 1, 1), corner(1, 1, 1), u),
      v,
    ),
    w,
  );
};

/**
 * The volume's texels: one tile of gradient noise, graded to value noise's mean
 * and spread and stored as bytes.
 * @param texels Texels along each side
 * @param period Noise cells along each side
 * @param channel Which of the volume's two independent channels
 * @returns One byte per texel, x fastest
 */
export const build_noise_volume = (
  texels = NOISE_VOLUME_TEXELS,
  period = NOISE_VOLUME_PERIOD,
  channel = 0,
): Uint8Array => {
  const gradients = lattice_gradients(period, SEEDS[channel]);
  const raw = new Float32Array(texels * texels * texels);

  let sum = 0;
  let squares = 0;

  for (let k = 0; k < texels; k++) {
    for (let j = 0; j < texels; j++) {
      for (let i = 0; i < texels; i++) {
        // At texel centres, so the tile's two faces meet a texel apart
        const value = gradient_noise(
          ((i + 0.5) * period) / texels,
          ((j + 0.5) * period) / texels,
          ((k + 0.5) * period) / texels,
          gradients,
          period,
        );

        raw[(k * texels + j) * texels + i] = value;
        sum += value;
        squares += value * value;
      }
    }
  }

  const mean = sum / raw.length;
  const deviation = Math.sqrt(
    Math.max(squares / raw.length - mean * mean, 1e-12),
  );
  const gain = VALUE_NOISE_DEVIATION / deviation;

  const bytes = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index++) {
    const graded = (raw[index] - mean) * gain + VALUE_NOISE_MEAN;

    bytes[index] = Math.round(Math.min(Math.max(graded, 0), 1) * 255);
  }

  return bytes;
};

let volume: Data3DTexture | null = null;

/**
 * The noise volume the shader samples, built once and shared.
 *
 * Two independent channels, a byte each, repeating on every axis: 512 KiB.
 * The eddies read red; the meander, which needs two curves at once, both.
 * @returns The texture
 */
export const get_noise_volume = (): Data3DTexture => {
  if (volume !== null) {
    return volume;
  }

  const texels = NOISE_VOLUME_TEXELS;

  const red = build_noise_volume(texels, NOISE_VOLUME_PERIOD, 0);
  const green = build_noise_volume(texels, NOISE_VOLUME_PERIOD, 1);
  const both = new Uint8Array(red.length * 2);

  for (let index = 0; index < red.length; index++) {
    both[index * 2] = red[index];
    both[index * 2 + 1] = green[index];
  }

  volume = new Data3DTexture(both, texels, texels, texels);

  volume.name = "afterburner_noise";
  volume.format = RGFormat;
  volume.type = UnsignedByteType;
  volume.magFilter = LinearFilter;
  volume.minFilter = LinearFilter;
  volume.wrapS = RepeatWrapping;
  volume.wrapT = RepeatWrapping;
  volume.wrapR = RepeatWrapping;
  volume.generateMipmaps = false;
  volume.unpackAlignment = 1;
  volume.needsUpdate = true;

  return volume;
};
