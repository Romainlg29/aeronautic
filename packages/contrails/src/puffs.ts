// The plume, drawn as the eddies it is made of
//
// A plume is not a smooth Gaussian at any instant: that is only its mean.
// It is turbulence, blobs of exhaust and the air they have taken in, and
// what a probe on a jet's axis reads wanders round its mean by about a
// quarter: Dowling and Dimotakis' 0.23, the same at every Reynolds number
// they measured. So each trail is drawn as Gaussian puffs, each the size of
// an eddy, scattered round its axis: their mean is the plume, and how many
// there are to a metre is what sets that quarter
//
// Puffs of mass μ, width σₚ, scattered about the axis with a spread s, at λ
// to the metre: on the axis the ice's mean is λ / 2πs² over the puffs'
// shapes, and its variance λ / 2πs² ∫ b², ∫ b² = (4π σₚ²)^-3/2. So
//
//   I² = 2π s² / (λ (4π)^3/2 σₚ³),   s² + σₚ² = σ²
//
// and with the plume's spread shared evenly between where its eddies are and
// how big, σₚ = σ / √2, λ σ = 3.77: about four puffs to each width of
// plume along the trail
//
// Each puff is left in the air at one instant and stays in it, so it is laid
// at its own age, back along the path flown. The instants are a grid in
// time, a power of two seconds apart, as close as the plume's width asks:
// closer while it is thin, twice as far each time it has doubled. As a
// stretch of trail ages into a coarser grid, the puffs that are not on it
// fade, and those that are take their ice: nothing jumps, and a puff is the
// same puff, at the same place in the air, for as long as it is drawn

/** A probe's wander round the mean on a jet's axis, over the mean */
export const PUFF_UNMIXEDNESS = 0.23;

/** How wide a puff is, over the plume: its spread shared evenly */
export const PUFF_SIZE = Math.SQRT1_2;

/**
 * Puffs to a metre times the plume's width, for a size of puff: how many
 * it takes to wander by PUFF_UNMIXEDNESS.
 * @param size The puff's width over the plume's, below one
 * @returns λ σ
 */
export const puffs_per_width = (size: number) =>
  (2 * Math.PI * (1 - size * size)) /
  (PUFF_UNMIXEDNESS ** 2 * (4 * Math.PI) ** 1.5 * size ** 3);

/**
 * The same, turned round: what a puff's size is, for how many there are,
 * so the plume still wanders by PUFF_UNMIXEDNESS. Fewer puffs, bigger ones.
 * The shader does the same.
 * @param per_width λ σ
 * @returns The puff's width over the plume's
 */
export const puff_size = (per_width: number) => {
  // (1 - u²) / u³ = λ σ I² (4π)^3/2 / 2π: from one, Newton's steps only fall
  const k =
    (per_width * PUFF_UNMIXEDNESS ** 2 * (4 * Math.PI) ** 1.5) / (2 * Math.PI);
  let size = 1;

  for (let step = 0; step < PUFF_SIZE_STEPS; step++) {
    const value = k * size ** 3 + size * size - 1;
    const slope = 3 * k * size * size + 2 * size;

    size -= value / slope;
  }

  return Math.min(Math.max(size, PUFF_SIZE_MIN), PUFF_SIZE_MAX);
};

/** Newton's steps to a puff's size: six get it to 1e-6 from λ σ of 0.5 to 40 */
export const PUFF_SIZE_STEPS = 6;

// A puff no smaller than a fifth of the plume, which would take hundreds to
// a width, and no bigger than the plume
export const PUFF_SIZE_MIN = 0.2;
export const PUFF_SIZE_MAX = 0.98;

// The finest grid puffs are left on, 2^-12 s: at Mach 2 a puff every 15 cm,
// finer than a fresh plume's 0.2 m eddies need. A puff's name is where it is
// on it, to 2^24, so the names come round every 2^12 s, 68 minutes
const FINEST_EXPONENT = -12;
const NAMES = 2 ** 24;

/**
 * One stretch of trail whose puffs are left on one grid.
 */
export type PuffLevel = {
  /** The grid's step, 2^exponent seconds */
  exponent: number;

  /** The ages it covers, seconds */
  from: number;
  to: number;

  /** How many of its steps make the next grid's */
  ratio: number;
};

/**
 * The grids puffs are left on along a trail: each a power of two seconds,
 * as close as the plume's width asks.
 * @param sigma_m The plume's width at an age, metres
 * @param start_s The age it forms at
 * @param oldest_s The trail's length
 * @param speed_m_s The airspeed: how far apart in the air a step is
 * @param per_width λ σ, puffs to a metre times the width
 * @returns The grids, youngest first
 */
export const puff_levels = (
  sigma_m: (age_s: number) => number,
  start_s: number,
  oldest_s: number,
  speed_m_s: number,
  per_width: number,
): PuffLevel[] => {
  const levels: PuffLevel[] = [];

  if (!(speed_m_s > 0) || !(per_width > 0) || !(oldest_s > start_s)) {
    return levels;
  }

  // The step the width asks for at an age, as a power of two
  const exponent_at = (age: number) =>
    Math.max(
      Math.floor(
        Math.log2(Math.max(sigma_m(age), 1e-6) / (per_width * speed_m_s)),
      ),
      FINEST_EXPONENT,
    );

  let from = start_s;
  let exponent = exponent_at(from);

  while (from < oldest_s) {
    let to = oldest_s;

    // Where the width has grown to ask for the next step: it only grows
    if (exponent_at(oldest_s) > exponent) {
      let low = from;
      let high = oldest_s;

      for (let step = 0; step < 40; step++) {
        const middle = (low + high) / 2;

        if (exponent_at(middle) > exponent) high = middle;
        else low = middle;
      }

      to = high;
    }

    const next = to < oldest_s ? exponent_at(to) : exponent;

    levels.push({ exponent, from, to, ratio: 2 ** (next - exponent) });

    from = to;
    exponent = next;
  }

  return levels;
};

/**
 * How many puffs the grids hold, at most.
 * @param levels The grids
 * @returns The count
 */
export const puff_count = (levels: readonly PuffLevel[]) =>
  levels.reduce(
    (total, level) =>
      total + Math.floor((level.to - level.from) / 2 ** level.exponent) + 1,
    0,
  );

/**
 * The grids for as many puffs as there is room for: as the turbulence asks,
 * or fewer and bigger.
 * @param sigma_m The plume's width at an age, metres
 * @param start_s The age it forms at
 * @param oldest_s The trail's length
 * @param speed_m_s The airspeed
 * @param budget The most puffs
 * @returns The grids
 */
export const fit_puff_levels = (
  sigma_m: (age_s: number) => number,
  start_s: number,
  oldest_s: number,
  speed_m_s: number,
  budget: number,
): PuffLevel[] => {
  let per_width = puffs_per_width(PUFF_SIZE);
  let levels = puff_levels(sigma_m, start_s, oldest_s, speed_m_s, per_width);

  // Fewer to a width cuts the count about as much, a grid's step at a time
  for (let step = 0; step < 16 && puff_count(levels) > budget; step++) {
    per_width *= (0.97 * budget) / puff_count(levels);
    levels = puff_levels(sigma_m, start_s, oldest_s, speed_m_s, per_width);
  }

  return levels;
};

/**
 * Write each puff's age and name for now: four floats a puff, its age, its
 * name, the seconds of trail its ice stands for and the seconds apart it is
 * sized for. A puff not drawn has an age below zero.
 * @param levels The grids
 * @param now_s The history's clock
 * @param target Four floats a puff
 * @returns How many puffs are drawn
 */
export const write_puffs = (
  levels: readonly PuffLevel[],
  now_s: number,
  target: Float32Array,
): number => {
  const budget = Math.floor(target.length / 4);
  let count = 0;

  for (const level of levels) {
    const step = 2 ** level.exponent;
    const named = 2 ** (level.exponent - FINEST_EXPONENT);
    const newest = Math.floor(now_s / step);
    const phase = now_s - newest * step;
    const first = Math.max(Math.ceil((level.from - phase) / step), 0);
    const ratio = level.ratio;
    const span = Math.max(level.to - level.from, 1e-9);

    for (let index = first; count < budget; index++) {
      const age = phase + index * step;

      if (age >= level.to) break;

      const instant = newest - index;
      const name = (((instant * named) % NAMES) + NAMES) % NAMES;

      // Over the second half of the grid's ages the puffs the next grid
      // drops fade, and those it keeps take their ice
      let mass = 1;
      let size = 1;

      if (ratio > 1) {
        const x = Math.min(
          Math.max(((age - level.from) / span - 0.5) * 2, 0),
          1,
        );
        const fading = 1 - x * x * (3 - 2 * x);
        const kept = ((instant % ratio) + ratio) % ratio === 0;

        mass = kept ? 1 + (ratio - 1) * (1 - fading) : fading;
        size = ratio / (1 + (ratio - 1) * fading);
      }

      const at = count * 4;

      target[at] = age;
      target[at + 1] = name;
      target[at + 2] = step * mass;
      target[at + 3] = step * size;

      count++;
    }
  }

  for (let at = count * 4; at < budget * 4; at += 4) {
    target[at] = -1;
    target[at + 1] = 0;
    target[at + 2] = 0;
    target[at + 3] = 0;
  }

  return count;
};
