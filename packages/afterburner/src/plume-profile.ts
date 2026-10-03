import { atmosphere } from "./atmosphere";
import { nozzle_outline_fit } from "./nozzle-outline";
import type { AfterburnerParams, AfterburnerProfile } from "./types";

// What a jet is, worked out from the nozzle and the gas, as pure functions
//
// The plume is not drawn to a length or a width anyone chose. It is the jet the
// nozzle makes: the exhaust expands or recompresses to the ambient pressure,
// which sets how wide it really is and how fast and hot it leaves; that sets how
// long its potential core lasts, how far apart its shock cells stand and how
// fast its mixing layer spreads; and those set everything you see
//
// Every one of these is written twice, here and in TSL in `tsl/plume.ts`. The
// main thread needs them to cull and to report, the GPU needs them to draw, and
// the two disagreeing is a plume culled at a length it is not drawn at. So they
// are tested here, and the shader is written to match line for line

// The full treatment: marched, turbulent, with the shock train resolved
export const PLUME_LOD_NEAR = 0;

// Still marched, but laminar and with fewer steps
export const PLUME_LOD_MID = 1;

// One analytic sample through the thickest part, and no marching at all
export const PLUME_LOD_FAR = 2;

// Not drawn: the instance is collapsed before it reaches the rasterizer
export const PLUME_LOD_CULLED = 3;

// Air, for the ambient side of the mixing layer
const AIR_MOLAR_MASS = 28.97;

const UNIVERSAL_GAS_CONSTANT = 8314.46;

// Where the half-temperature profile has fallen to nothing worth drawing, in
// half-widths: two to the minus 2.8 squared is under half a percent
export const PLUME_FIELD_EXTENT = 2.8;

// How far an eddy may push the profile, as a share of the mixing layer
export const PLUME_EDDY_REACH = 0.35;

// How much air the fuel in the exhaust needs before thin air stops it burning,
// as a share of sea level's density: past about 30 km the plume no longer burns
export const PLUME_QUENCH_DENSITY = 0.03;

// How steeply a jet's soot falls with the pressure it burns at. A hydrocarbon
// flame's soot climbs as about the pressure to a power of one to two, and an
// afterburner burns at the ambient times its inlet's ram: so high up the
// yellow soot glow fades and the blue of the burning gas shows through it
export const PLUME_SOOT_PRESSURE_EXPONENT = 1.5;

// The fastest the air may run with the jet, as a share of its speed
// Past this the mixing layer all but stops growing, and the plume never ends
export const PLUME_MAX_COFLOW = 0.85;

// The far field's half-width spread rate, dr½/dx, for a round jet's temperature
// profile, which is a little wider than its velocity profile's 0.094
export const PLUME_FAR_SPREAD = 0.11;

/**
 * Hold a value inside a range.
 * @param value The value to hold
 * @param low The bottom of the range
 * @param high The top of it
 * @returns The value, brought inside
 */
const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/**
 * Hermite between two edges, as GLSL and WGSL do it.
 * @param low Where it starts climbing
 * @param high Where it reaches one
 * @param value The value
 * @returns 0 to 1
 */
const smoothstep = (low: number, high: number, value: number): number => {
  const t = clamp((value - low) / (high - low), 0, 1);

  return t * t * (3 - 2 * t);
};

/**
 * How much of the afterburner is lit at one throttle setting.
 *
 * Below the threshold there is no reheat, only the dry engine. A threshold of
 * zero or less is an engine with no burner to light, which is always lit.
 * @param throttle How hard the engine is running, 0 to 1
 * @param profile Where the burner lights
 * @returns Zero on dry thrust, one at full burner, smooth between
 */
export const burner_lit = (
  throttle: number,
  profile: AfterburnerProfile,
): number => {
  const threshold = profile.burner_threshold;

  if (threshold <= 0) {
    return 1;
  }

  // A burner lit exactly at full power is a step, and a step is not a curve
  return smoothstep(threshold, Math.max(threshold + 1e-6, 1), throttle);
};

/**
 * Everything about one jet that is constant along it.
 */
export type JetState = {
  // How much reheat is lit, 0 to 1
  burner: number;

  // Whether the engine breathes air, 0 for a rocket and 1 for a jet
  breathes: number;

  // The exit pressure over the ambient, once altitude and flight have moved it
  pressure_ratio: number;

  // The fully expanded jet: once the exhaust has reached ambient pressure
  mach: number;
  temperature_k: number;
  velocity_m_s: number;
  radius_m: number;

  // How far the potential core lasts, inside which the axis is still exhaust
  core_length_m: number;

  // dr½/dx of the mixing layer before the core closes, and after
  spread_near: number;
  spread_far: number;

  // The shock train: how far apart the cells are, how far the gas swings
  // either side of the jet's temperature through one, as a share of it, how far down the train
  // lasts, and where the first disk stands, in cells
  shock_spacing_m: number;
  shock_heat: number;
  shock_length_m: number;
  first_disk: number;

  // What the fuel left in the exhaust adds where it burns, in kelvin
  afterburning_k: number;

  // How much thinner the gas is once expanded than at the exit plane
  // What it carries, its soot and its radicals, is diluted by the same
  thinning: number;

  // The static temperature at the exit plane, before the jet has expanded
  exit_temperature_k: number;

  // How much denser the gas is behind a Mach disk than in the jet
  compression: number;

  // How much of the soot survives into the far plume, once thin air has
  // left the mixing layer too little oxygen to burn it
  soot_survival: number;

  // How much soot the engine makes against what it makes at sea level,
  // standing: a jet's falls with the pressure it burns at, a rocket's is its
  // chamber's and stays
  soot_formed: number;

  // How far the plume is drawn, and how wide the field is at each end of it,
  // its outline's reach and all
  reach_m: number;
  outer_near_m: number;
  outer_far_m: number;
};

/**
 * How much soot an engine makes against what it makes at sea level, standing.
 * @param pressure The ambient pressure, as a share of sea level's
 * @param ram How much the inlet raises it
 * @param breathes Whether it breathes air, 0 for a rocket
 * @returns The share
 */
export const soot_formation = (
  pressure: number,
  ram: number,
  breathes: number,
): number =>
  1 +
  (Math.min(Math.max(pressure * ram, 0) ** PLUME_SOOT_PRESSURE_EXPONENT, 3) -
    1) *
    breathes;

/**
 * The jet one nozzle makes at one throttle setting.
 * @param params The engine
 * @param throttle How hard it is running, 0 to 1
 * @param profile The air it runs in
 * @param scale How much bigger than its params the engine is drawn
 * @returns The jet
 */
export const jet_state = (
  params: AfterburnerParams,
  throttle: number,
  profile: AfterburnerProfile,
  scale = 1,
): JetState => {
  const setting = clamp(throttle, 0, 1);
  const burner = burner_lit(setting, profile);
  const air = atmosphere(profile);

  const exit_temperature_k =
    params.dry_temperature_k +
    (params.exit_temperature_k - params.dry_temperature_k) * burner;

  // Only an engine with a dry state breathes air
  const breathes = smoothstep(
    0,
    0.2,
    1 - params.dry_temperature_k / Math.max(params.exit_temperature_k, 1),
  );

  // A rocket's exit pressure is its chamber's, so its ratio climbs as the air
  // thins. A jet's follows its inlet, which sees the ambient times the ram
  const ambient_scale = breathes * air.ram + (1 - breathes) / air.pressure;

  const pressure_ratio = Math.max(
    params.pressure_ratio *
      (profile.idle_pressure + (1 - profile.idle_pressure) * setting) *
      ambient_scale,
    0.05,
  );

  const gamma = Math.max(params.gamma, 1.05);
  const k = (gamma - 1) / 2;
  const exponent = gamma / (gamma - 1);

  // Isentropic from the exit plane to ambient pressure: the stagnation
  // pressure is conserved, so the fully expanded Mach number follows from it
  const exit_mach = Math.max(params.exit_mach, 0.2);
  const exit_stagnation = 1 + k * exit_mach * exit_mach;

  const total_over_ambient =
    Math.pow(exit_stagnation, exponent) * pressure_ratio;

  const mach = Math.max(
    Math.sqrt(Math.max(Math.pow(total_over_ambient, 1 / exponent) - 1, 0) / k),
    0.2,
  );

  const jet_stagnation = 1 + k * mach * mach;

  const temperature_k = (exit_temperature_k * exit_stagnation) / jet_stagnation;

  // And by continuity, how much wider or narrower it is once it gets there
  const area =
    (exit_mach / mach) *
    Math.pow(jet_stagnation / exit_stagnation, (gamma + 1) / (2 * (gamma - 1)));

  // A rocket high up balloons to many times its bell, so the bound is wide
  const expanded = clamp(area, 0.25, 36);

  const radius_m = params.nozzle_radius_m * scale * Math.sqrt(expanded);

  const gas_constant =
    UNIVERSAL_GAS_CONSTANT / Math.max(params.molar_mass_g_mol, 1);

  const sound = Math.sqrt(gamma * gas_constant * temperature_k);
  const velocity_m_s = mach * sound;

  // By continuity the mass through the jet is the mass through the exit, so
  // spread over a wider, faster jet everything in it is that much thinner
  const exit_velocity =
    exit_mach * Math.sqrt(gamma * gas_constant * exit_temperature_k);

  const thinning = exit_velocity / Math.max(expanded * velocity_m_s, 1e-3);

  const ambient_k = air.temperature_k;
  const airspeed = Math.max(profile.airspeed_m_s, 0);

  // The convective Mach number of the shear layer: past about a half, the
  // layer's growth is strangled by compressibility (Papamoschou and Roshko)
  const convective =
    Math.max(velocity_m_s - airspeed, 0) / (sound + air.sound_m_s);

  // And air moving with the jet shears it less: a mixing layer grows as the
  // velocity difference over the sum
  const coflow = clamp(airspeed / velocity_m_s, 0, PLUME_MAX_COFLOW);
  const shear = (1 - coflow) / (1 + coflow);

  const compressibility =
    0.23 + 0.77 * Math.exp(-3.4 * convective * convective);

  // Jet over ambient density at the same pressure: a hot, light jet mixes out
  // faster, so its core is shorter (Witze)
  const density =
    (ambient_k / Math.max(temperature_k, 1)) *
    (params.molar_mass_g_mol / AIR_MOLAR_MASS);

  const diameter_m = radius_m * 2;

  // Lau's supersonic core correlation, shortened for density
  // Lengthened as much as the mixing layer is slowed by the coflow
  const core_length_m =
    (profile.core_scale *
      diameter_m *
      (4.2 + 1.1 * mach * mach) *
      Math.pow(clamp(density, 0.01, 10), 0.28)) /
    shear;

  const spread_far = profile.spread_scale * PLUME_FAR_SPREAD * shear;
  const spread_near = spread_far * compressibility;

  // Pack's shock cell spacing, from Prandtl's vortex sheet model
  const supersonic = smoothstep(1, 1.2, mach);

  const shock_spacing_m =
    1.306 * diameter_m * Math.sqrt(Math.max(mach * mach - 1, 0.04));

  // How strong the train is: zero for a perfectly expanded jet, saturating
  // for a badly mismatched one, either way round
  const mismatch = 1 - Math.exp(-4 * Math.abs(Math.log(pressure_ratio)));

  const strength =
    (profile.shock_floor + (1 - profile.shock_floor) * mismatch) * supersonic;

  // How far the gas swings either side of the jet's temperature through a cell
  //
  // Through the expansion fan behind a disk it speeds up past the jet's Mach
  // number and cools well below the jet; through the disk it is brought nearly
  // to rest and recovers most of its stagnation temperature. The stagnation
  // temperature bounds the hot end, and a perfectly matched jet swings not at
  // all, so the swing is the mismatch's share of the way up to it
  const shock_heat = strength * (jet_stagnation - 1);

  // The train lasts about as long as the supersonic core does
  const shock_length_m = profile.shock_persistence * core_length_m;

  // A normal shock's density ratio, as much of it as the train is strong
  const normal = ((gamma + 1) * mach * mach) / ((gamma - 1) * mach * mach + 2);

  const compression = 1 + (normal - 1) * strength;

  // An underexpanded jet expands first and meets its first disk most of a cell
  // down; an overexpanded one is shocked nearly at the lip
  const first_disk = 0.5 + 0.3 * smoothstep(0.9, 1.3, pressure_ratio);

  // How far it is worth drawing: where the axis has cooled below what glows,
  // the centreline excess temperature falling as x_c / x past the core...
  const visible_excess = Math.max(profile.visible_temperature_k - ambient_k, 1);

  // The fuel left over burns only where there is air enough to burn it in
  const quench =
    (air.density * (1 + PLUME_QUENCH_DENSITY)) /
    (air.density + PLUME_QUENCH_DENSITY);

  const afterburning_k = Math.max(params.afterburning_k * burner, 0) * quench;

  // And soot only burns out where there is oxygen to burn it
  const soot_survival = 1 + (clamp(params.soot_survival, 0, 1) - 1) * quench;

  const soot_formed = soot_formation(air.pressure, air.ram, breathes);

  const hottest_excess =
    Math.max(temperature_k - ambient_k, 0) + 4 * afterburning_k;

  const thermal_m =
    core_length_m /
    Math.max(visible_excess / Math.max(hottest_excess, 1e-3), 1e-3);

  // ...or for a smoky one, the full length: the far field's optical depth is
  // the same at every station, the smoke spreading exactly as it dilutes
  // Only the soot that survives burning out in the mixing layer gets that far
  const extinction =
    (Math.max(params.soot_per_m, 0) * soot_formed * soot_survival +
      Math.max(params.particles_per_m, 0)) *
    thinning;

  const smoke_depth = extinction * core_length_m * spread_far * 2.13;

  // Never short of the first disk and the cell behind it, which high up
  // stands far down a ballooning plume and is the brightest thing in it
  const shortest_m = Math.max(
    8 * radius_m,
    (first_disk + 1.5) * shock_spacing_m,
  );

  const longest_m = Math.max(
    profile.max_length_d * 2 * params.nozzle_radius_m * scale,
    shortest_m,
  );

  const reach_m = clamp(
    Math.max(thermal_m, smoothstep(0.01, 0.06, smoke_depth) * longest_m),
    shortest_m,
    longest_m,
  );

  const state: JetState = {
    burner,
    breathes,
    pressure_ratio,
    mach,
    temperature_k,
    velocity_m_s,
    radius_m,
    core_length_m,
    spread_near,
    spread_far,
    shock_spacing_m,
    shock_heat,
    shock_length_m,
    first_disk,
    afterburning_k,
    thinning,
    exit_temperature_k,
    compression,
    soot_survival,
    soot_formed,
    reach_m,
    outer_near_m: 0,
    outer_far_m: 0,
  };

  // A shaped exit reaches further from the axis than its round equivalent
  const { reach } = nozzle_outline_fit(
    params.nozzle_aspect,
    params.nozzle_squareness,
  );
  const extent = plume_extent(params) * Math.max(reach, 1);

  state.outer_near_m = radius_m * extent;
  state.outer_far_m = jet_half_width(reach_m, state) * extent;

  return state;
};

/**
 * How many half-widths out the field may reach, the eddies and meander included.
 * @param params The engine
 * @returns The multiplier, a little over PLUME_FIELD_EXTENT
 */
export const plume_extent = (params: AfterburnerParams): number =>
  (PLUME_FIELD_EXTENT +
    PLUME_EDDY_REACH * Math.max(params.turbulence, 0) +
    Math.max(params.meander, 0)) *
  1.05;

/**
 * The jet's half-width at one station: where its excess temperature is half
 * what it is on the axis.
 *
 * The mixing layer grows linearly, slowly while it is compressible and the
 * core is intact and at the incompressible rate once it has closed. Piecewise
 * linear and convex, so a straight line from end to end bounds it.
 * @param x_m Metres downstream of the exit plane
 * @param state The jet
 * @returns The half-width, in metres
 */
export const jet_half_width = (x_m: number, state: JetState): number => {
  const x = Math.max(x_m, 0);

  return (
    state.radius_m +
    state.spread_near * Math.min(x, state.core_length_m) +
    state.spread_far * Math.max(x - state.core_length_m, 0)
  );
};

/**
 * The centreline excess temperature, as a share of the exit's.
 *
 * One inside the potential core, x_c / x far beyond it, joined smoothly.
 * @param x_m Metres downstream of the exit plane
 * @param state The jet
 * @returns 0 to 1
 */
export const jet_centreline = (x_m: number, state: JetState): number => {
  const ratio = Math.max(x_m, 0) / Math.max(state.core_length_m, 1e-6);

  return Math.pow(1 + Math.pow(ratio, 4), -0.25);
};

/**
 * How much of the screen's height a plume covers, end to end.
 * @param length_m How far the flame reaches
 * @param distance_m How far the nozzle is from the camera
 * @param screen_scale Metres one screen height covers at one metre out
 * @returns The share of the screen height it spans, 0 to 1
 */
export const plume_screen_span = (
  length_m: number,
  distance_m: number,
  screen_scale: number,
): number => {
  // Standing inside the plume, which is as large on screen as anything gets
  if (distance_m <= 0 || screen_scale <= 0) {
    return Infinity;
  }

  return length_m / (distance_m * screen_scale);
};

/**
 * Which of the four ways to draw one plume.
 * @param length_m How far the plume reaches at its current throttle
 * @param distance_m How far the nozzle is from the camera
 * @param screen_scale Metres one screen height covers at one metre out
 * @param min_screen_fraction Below this share of the screen it is not drawn
 * @param detail_distance_m Past this the turbulence is dropped
 * @param cheap_distance_m And past this the marching is dropped with it
 * @returns One of the `PLUME_LOD_*` tiers
 */
export const plume_lod = (
  length_m: number,
  distance_m: number,
  screen_scale: number,
  min_screen_fraction: number,
  detail_distance_m: number,
  cheap_distance_m: number,
): number => {
  // An engine that is not running, which is not a distance question at all
  if (length_m <= 0) {
    return PLUME_LOD_CULLED;
  }

  // Answered before the distance tiers
  // So a plume too small to read is culled however near it happens to be
  if (
    plume_screen_span(length_m, distance_m, screen_scale) < min_screen_fraction
  ) {
    return PLUME_LOD_CULLED;
  }

  if (distance_m > cheap_distance_m) {
    return PLUME_LOD_FAR;
  }

  if (distance_m > detail_distance_m) {
    return PLUME_LOD_MID;
  }

  return PLUME_LOD_NEAR;
};
