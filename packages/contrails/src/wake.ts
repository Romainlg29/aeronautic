import { AIR_CP, standard_atmosphere } from "@aeronautic/core";

// Where the exhaust goes: down, with the wake
//
// The wing's lift leaves a pair of counter-rotating vortices behind it, π/4 of
// the span apart for an elliptically loaded wing, each carrying the whole
// wing's circulation. Each pushes the other down, so the pair sinks, at the
// speed one induces at the other's distance. The exhaust is caught by them:
// wrapped round the nearest core within about the time the flow takes to turn
// it round that core, and carried down with it. So two engines or four leave
// two trails, and they lie below the aircraft's path, not on it
//
// The pair sinks into air that grows lighter with height. Displaced down into
// denser air it is buoyant, and the stratification stops it within a quarter
// of its own buoyancy period: a hundred-odd metres at cruise, as observed
//
// Nor does the pair last for ever. The air's turbulence bends the two
// vortices into the Crow instability until they touch and link into rings,
// which break up: the wake is gone, and the exhaust it carried stays where
// it was left. How long that takes, in the pair's own time b₀ / w₀, falls
// with the turbulence measured against the pair's descent. A pair that sinks
// fast, from a hard pull, lives a short time, and so sinks about as far as a
// gentle one: a few of its spacings
//
// Pulled negative, the lift is down: the vortices turn the other way and the
// pair rises, the way the lift does not

const G0 = 9.80665;

// The upper troposphere's eddy dissipation rate, m²/s³: Unterstrasser's
// reference case for cruise levels, weakly turbulent (Unterstrasser et al.,
// "Dispersion of an aircraft wake: the vortex phase", ACP 14, 2014)
export const CRUISE_EDDY_DISSIPATION_M2_S3 = 1e-7;

/**
 * How long a vortex pair lives before the Crow instability links it, in its
 * own time b₀ / w₀: Crow and Bate's solution for the time to link in
 * turbulence, as Sarpkaya (1998) fitted it, against the turbulence's
 * strength ε* = (ε b₀)^⅓ / w₀.
 * @param epsilon_star The turbulence, against the pair's descent
 * @returns The time to link, in b₀ / w₀
 */
export const link_time = (epsilon_star: number): number => {
  const e = Math.max(epsilon_star, 0);

  if (e < 0.001) return 9;
  if (e < 0.0121) return -180 * e + 9.18;
  if (e > 0.2535) return 0.8039 * Math.pow(e, -3 / 4);

  // T^¼ exp(-0.7 T) = ε*, falling in T over [2.25, 7]: halved to the root
  let low = 2.25;
  let high = 7;

  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;

    if (Math.pow(middle, 0.25) * Math.exp(-0.7 * middle) > e) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
};

/**
 * An aircraft's wake: its vortex pair, and how it sinks.
 */
export type Wake = {
  /** How far apart the two vortices are, metres: π/4 of the span */
  spacingM: number;

  /** The circulation round each, m²/s */
  circulationM2PerS: number;

  /**
   * How fast the pair sinks, at first, m/s. Negative, it rises: the lift
   * was down
   */
  descentMPerS: number;

  /** How long it lives before it links and breaks up, seconds */
  lifetimeS: number;

  /**
   * The air's buoyancy frequency, the Brunt–Väisälä frequency, rad/s: how
   * hard the stratification pushes a parcel back
   */
  buoyancyRadPerS: number;
};

/**
 * The air's Brunt–Väisälä frequency at an altitude, from the standard
 * atmosphere's lapse rate: about 0.012 rad/s under the tropopause, 0.02 above.
 * @param altitude_m Metres above sea level
 * @param temperature_offset_k How much warmer the day is than the standard
 *   one, which leaves the lapse rate as it is
 * @returns The frequency, rad/s
 */
export const buoyancy_frequency = (
  altitude_m: number,
  temperature_offset_k = 0,
): number => {
  // Over a few metres either side, unless that would cross the ground
  const below = Math.max(altitude_m - 5, 0);
  const above = below + 10;

  const lapse_k_m =
    (standard_atmosphere(above).temperatureK -
      standard_atmosphere(below).temperatureK) /
    (above - below);

  const temperature_k =
    standard_atmosphere(altitude_m).temperatureK + temperature_offset_k;

  // N² = g/T (dT/dz + g/cp): zero for a dry adiabatic lapse, stable above it
  const n2 = (G0 / temperature_k) * (lapse_k_m + G0 / AIR_CP);

  return Math.sqrt(Math.max(n2, 0));
};

/**
 * The wake an aircraft leaves.
 * @param mass_kg Its mass
 * @param load_factor Lift over weight
 * @param span_m Tip to tip
 * @param density_kg_m3 The air's density
 * @param airspeed_m_s True airspeed
 * @param buoyancy_rad_s The air's Brunt–Väisälä frequency
 * @param dissipation_m2_s3 The air's eddy dissipation rate
 * @returns The wake
 */
export const wake = (
  mass_kg: number,
  load_factor: number,
  span_m: number,
  density_kg_m3: number,
  airspeed_m_s: number,
  buoyancy_rad_s: number,
  dissipation_m2_s3 = CRUISE_EDDY_DISSIPATION_M2_S3,
): Wake => {
  const spacing_m = (Math.PI / 4) * Math.max(span_m, 1e-3);
  const lift_n = Math.abs(load_factor) * Math.max(mass_kg, 0) * G0;

  // Kutta–Joukowski over the vortices' spacing: L = ρ V Γ b₀
  const circulation =
    lift_n /
    (Math.max(density_kg_m3, 1e-4) * Math.max(airspeed_m_s, 1) * spacing_m);
  const descent = circulation / (2 * Math.PI * spacing_m);

  // Its own time, and the turbulence against it
  const own_time_s = spacing_m / Math.max(descent, 1e-6);
  const epsilon_star =
    Math.cbrt(Math.max(dissipation_m2_s3, 0) * spacing_m) /
    Math.max(descent, 1e-6);

  return {
    spacingM: spacing_m,
    circulationM2PerS: circulation,
    descentMPerS: load_factor < 0 ? -descent : descent,
    buoyancyRadPerS: buoyancy_rad_s,
    lifetimeS: link_time(epsilon_star) * own_time_s,
  };
};

/**
 * How far the wake has sunk at an age.
 *
 * At its own speed at first, slowed by the buoyancy it gains: in air of
 * buoyancy frequency N, it reaches w/N after a quarter period and stops.
 * Once it has linked and broken up, nothing carries the exhaust further.
 * @param wake The wake
 * @param age_s Seconds since it was shed
 * @returns How far below the flight path, metres: negative, above it
 */
export const wake_descent = (wake: Wake, age_s: number): number => {
  const n = wake.buoyancyRadPerS;
  const age = Math.min(Math.max(age_s, 0), wake.lifetimeS);

  if (n < 1e-6) {
    return wake.descentMPerS * age;
  }

  return (wake.descentMPerS / n) * Math.sin(Math.min(n * age, Math.PI / 2));
};

/**
 * How long the wake takes to wrap an engine's exhaust round its vortex: the
 * time the vortex turns the flow through a radian, at the engine's distance
 * from its core.
 * @param wake The wake
 * @param distance_m How far the exhaust leaves from the core
 * @returns Seconds
 */
export const capture_time = (wake: Wake, distance_m: number): number =>
  (2 * Math.PI * distance_m * distance_m) /
  Math.max(wake.circulationM2PerS, 1e-6);

/**
 * Where an engine's exhaust is, an age after it left, in the frame the
 * aircraft had when it left it: x aft, y up, z out along the left wing, as
 * core's canonical frame has it. Drawn from the engine towards its side's
 * vortex core, and sunk with the wake.
 * @param wake The wake
 * @param engine The exhaust's position in that frame
 * @param age_s Seconds since it left
 * @param target Where to write it, three floats
 * @returns target
 */
export const exhaust_offset = (
  wake: Wake,
  engine: readonly [number, number, number],
  age_s: number,
  target: [number, number, number] = [0, 0, 0],
): [number, number, number] => {
  const [x, y, z] = engine;

  // An engine on the centreline is shared by both cores, and stays between
  const core = Math.abs(z) < 1e-6 ? 0 : Math.sign(z) * (wake.spacingM / 2);
  const distance = Math.abs(z - core);
  const settle = capture_time(wake, distance);
  // Only while there is a wake to wrap it
  const wrapped_s = Math.min(Math.max(age_s, 0), wake.lifetimeS);
  const left = settle > 1e-6 ? Math.exp(-wrapped_s / settle) : 0;

  target[0] = x;
  target[1] = y - wake_descent(wake, age_s);
  target[2] = core + (z - core) * left;

  return target;
};
