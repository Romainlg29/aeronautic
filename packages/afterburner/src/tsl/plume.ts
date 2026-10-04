import {
  If,
  abs,
  clamp,
  dot,
  exp,
  exp2,
  float,
  fract,
  length,
  log,
  max,
  min,
  mix,
  pow,
  select,
  smoothstep,
  sqrt,
  vec2,
  vec3,
} from "three/tsl";
import type { Node } from "three/webgpu";
import {
  AFTERBURNER_MAX_THROTTLE,
  PLUME_EDDY_REACH,
  PLUME_LIGHT_OFF,
  PLUME_MAX_ADAPTATION,
  PLUME_MIN_REHEAT,
  PLUME_NOZZLE_MAX_MACH,
  PLUME_PHOTOPIC_K,
  PLUME_FAR_SPREAD,
  PLUME_FIELD_EXTENT,
  PLUME_IDLE_GLOW,
  PLUME_MAX_COFLOW,
  PLUME_QUENCH_DENSITY,
  PLUME_SOOT_FLAME_K,
  PLUME_SHOCK_DECAYS,
  PLUME_SOOT_PRESSURE_EXPONENT,
} from "../plume-profile";
import { REFERENCE_TEMPERATURE_K } from "../blackbody";
import type { AfterburnerProfile } from "../types";
import { signed, volume_turbulence, volume_wander } from "./noise";

// The plume as a jet: a temperature field and what is in it
//
// Nothing here is drawn to a shape. The vertex stage works out the fully
// expanded jet from the nozzle and the gas, and the fragment stage asks, at each
// point a ray crosses, how much of the gas there is exhaust and how hot it is,
// using the self-similar structure every round jet has: a potential core that
// is still pure exhaust, a mixing layer that eats into it and spreads, and past
// the core a profile that relaxes to a Gaussian and decays as one over the
// distance. Inside the supersonic core the gas expands and recompresses through
// a train of shocks, and behind each Mach disk it is hotter
//
// Then the material does radiative transfer through it: soot and particles
// absorb and emit as blackbodies at the local temperature, the gas adds its own
// band emission, and the colour of everything comes out of Planck's law
//
// Every function here is plain TSL over explicit inputs, so a custom material
// can call any of them. The point is always in the nozzle's own frame, metres
// from the exit plane, with +X running aft down the plume

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type B = Node<"bool">;

// Under this a divisor has degenerated
export const PLUME_EPSILON = 1e-5;

// The barrel shock around each cell, as shares of the inviscid core: where it
// leaves the Mach disk's rim, how far it bows out mid-cell, and how thin the
// heated sheet behind it is
const BARREL_RIM = 0.55;
const BARREL_BOW = 0.35;
const BARREL_WIDTH = 0.06;

// How hot that sheet is against the gas behind a disk
const BARREL_HEAT = 0.55;

// What soot's absorption is in each primary, over what it is at 550 nm
// Soot absorbs as one over the wavelength, and sRGB's primaries sit near 610,
// 550 and 465 nm, so it is more opaque to blue: smoke reddens what it hides
const SOOT_SPECTRUM: [number, number, number] = [550 / 610, 1, 550 / 465];

/**
 * The air the profile puts the engines in, as `atmosphere` works it out.
 */
export type PlumeAirNodes = {
  /** In kelvin */
  temperatureK: F;

  /** As shares of sea level's on a standard day */
  pressure: F;
  density: F;

  /** Metres per second */
  sound: F;

  /** Stagnation over static pressure, at the inlet */
  ram: F;
};

/**
 * The profile, one float node per dial and a vector toward the sun, usually
 * uniforms, and the air it is.
 */
export type PlumeProfileNodes = {
  [K in Exclude<keyof AfterburnerProfile, "sunDirection">]: F;
} & {
  sunDirection: V3;
  air: PlumeAirNodes;
};

/**
 * One engine's params, as nodes, before the jet is worked out from them.
 */
export type PlumeEngineNodes = {
  nozzleRadius: F;
  exitMach: F;
  pressureRatio: F;
  exitTemperature: F;
  dryTemperature: F;
  gamma: F;
  molarMass: F;
  soot: F;
  sootSurvival: F;
  particles: F;
  afterburning: F;
  turbulence: F;
  meander: F;
  throttle: F;
};

/**
 * One jet, as the fragment sees it: everything constant along it.
 * Every length is in metres, already scaled to the nozzle's world.
 */
export type PlumeJetNodes = {
  /** The fully expanded jet: its radius and its speed */
  radius: F;
  velocity: F;

  /** How long the potential core is, and how far the plume is drawn */
  coreLength: F;
  reach: F;

  /** The fully expanded static temperature, and what afterburning adds to it */
  temperature: F;
  afterburning: F;

  /**
   * How much thinner the expanded jet is than the exit plane, which dilutes
   * what it carries: its soot, its particles, its radicals
   */
  thinning: F;

  /**
   * The static temperature at the exit plane, before the jet has expanded: a
   * jet's nozzle opened up by the ram lets the gas out cooler. A rocket high
   * up leaves its bell far hotter than it is once expanded
   */
  lipTemperature: F;

  /**
   * How much denser the gas is behind a Mach disk than in the jet, the
   * normal shock's ratio weighted by how strong the train is
   */
  compression: F;

  /**
   * What burns behind each Mach disk, in kelvin: an air-breathing engine's core
   * still carries air, and the fuel it has left relights where a disk heats it.
   * A rocket's core has no oxygen, so its fuel only burns at the edge
   */
  reheat: F;

  /**
   * The shock train: how far the gas swings through a cell as a share of the jet,
   * how far it lasts, how far apart the cells are, and where the first stands
   */
  shockHeat: F;
  shockLength: F;
  shockSpacing: F;
  firstDisk: F;

  /** dr½/dx before the core closes and after */
  spreadNear: F;
  spreadFar: F;

  /** What is in the gas: absorption per metre of pure exhaust */
  soot: F;
  sootSurvival: F;
  particles: F;
  albedo: F;

  bandColor: V3;
  bandStrength: F;

  /**
   * How bright the dry engine's turbine glows up the nozzle, the exposure
   * divided out
   */
  glow: F;

  turbulence: F;
  meander: F;
  refraction: F;

  /** A per nozzle offset, so no two engines move in step */
  seed: F;

  /** The widest the field reaches at the far end of the plume, outline and all */
  outerRadius: F;

  /** The exit's outline, for a nozzle that isn't round. Left out, it is */
  outline?: PlumeOutlineNodes;
};

/**
 * The radius of an outline in one direction across the plume, in nozzle radii.
 * @param direction Unit length, in the outline's own axes: x across its width,
 * y up its height
 * @param frame Where the plume is being sampled
 * @returns How far out the outline is that way, over `nozzleRadiusM`
 */
export type PlumeOutlineRadius = (direction: V2, frame: PlumeFrame) => F;

/**
 * A nozzle exit's outline, as the field reads it.
 *
 * Inside the outline is inside the nozzle, and downstream the jet mixes round:
 * the field measures how far out a point is against the outline at the lip, and
 * against a circle once the outline has relaxed.
 */
export type PlumeOutlineNodes = {
  /** The roll's cosine and sine: the outline turned about +X, right handed */
  roll: V2;

  /**
   * Width over height, the superellipse's exponent, and its mean semi-axis
   * over the radius of the round exit of its area
   */
  aspect: F;
  squareness: F;
  areaScale: F;

  /** How far the outline reaches from the axis, in nozzle radii */
  reach: F;

  /** How far downstream it lasts, in potential core lengths, before it is round */
  length: F;

  /** Any outline, in place of the superellipse. `reach` must bound it */
  radius?: PlumeOutlineRadius;
};

/**
 * Everything the field functions read.
 */
export type PlumeContext = {
  jet: PlumeJetNodes;
  profile: PlumeProfileNodes;

  /** Seconds, whatever clock the plume runs on */
  time: F;

  /** Temperature to radiance, a luminance of one at the reference temperature */
  blackbody: (temperature_k: F) => V3;

  /** The sun, for the particles to scatter. Left out, only the sky lights them */
  sun?: PlumeSunNodes;
};

/**
 * The sun as one pixel of the plume sees it.
 */
export type PlumeSunNodes = {
  /** Toward the sun, unit length, in the nozzle's frame */
  direction: V3;

  /**
   * How much of the sun's light the particles send down this ray, against
   * what they would if they scattered evenly every way: `plume_sun_phase`
   */
  phase: F;
};

// How strongly the particles scatter forward, Henyey and Greenstein's g
// Alumina a few microns across sends most of what it scatters onward
const SUN_FORWARD_SCATTER = 0.6;

// A thick cloud is never black on its shadowed side: light scattered many
// times leaks round. Stood in for by a share of the light let through a
// shadow a few times thinner
const SUN_MULTIPLE_SHARE = 0.3;
const SUN_MULTIPLE_THINNING = 0.25;

// The shallowest a ray toward the sun is allowed to cross the plume, as the
// sine of its angle to the axis. Shallower would run it down an endless plume
const SUN_MIN_SLANT = 0.2;

/**
 * How much of the sun's light scatters down a ray, against even scattering.
 * Henyey and Greenstein's phase function, times 4π.
 * @param direction The ray, from the camera, unit length
 * @param sun Toward the sun, unit length, in the same frame
 * @returns One for even scattering; more looking toward the sun, less away
 */
export const plume_sun_phase = (direction: V3, sun: V3): F => {
  const g = SUN_FORWARD_SCATTER;

  // Light runs from the sun along -sun, and on to the camera along -direction
  const cosine = dot(direction, sun);
  const denominator = float(1 + g * g).sub(cosine.mul(2 * g));

  return float(1 - g * g).div(pow(max(denominator, 1e-4), 1.5));
};

/**
 * The complementary error function, to about 1e-3.
 * Abramowitz and Stegun's 7.1.27, mirrored for negative arguments.
 * @param x The argument
 * @returns erfc(x), 0 to 2
 */
const erfc = (x: F): F => {
  const a = abs(x);

  const series = a
    .mul(0.078108)
    .add(0.000972)
    .mul(a)
    .add(0.230389)
    .mul(a)
    .add(0.278393)
    .mul(a)
    .add(1);

  const squared = series.mul(series);
  const tail = float(1).div(squared.mul(squared));

  return select(x.lessThan(0), float(2).sub(tail), tail);
};

/**
 * How much the plume shades one point of itself from the sun.
 *
 * Locally the plume is a cylinder of gas whose extinction falls off across it
 * as a Gaussian in its half-width. The optical depth from a point out to the
 * sun through such a cylinder has a closed form, in the error function, so the
 * shadow costs a handful of operations rather than a second march.
 * @param frame Where the point is
 * @param axis Extinction per metre on the axis at this station, per primary
 * @param sun Toward the sun, unit length, in the nozzle's frame
 * @returns The optical depth to the sun, per primary
 */
export const plume_sun_depth = (frame: PlumeFrame, axis: V3, sun: V3): V3 => {
  const width = max(frame.halfWidth, PLUME_EPSILON);

  // 2^-(r/r½)² as e^-k r²
  const k = float(Math.LN2).div(width.mul(width));
  const root_k = sqrt(k);

  // Across the axis: how far the point is, and how fast the ray leaves it
  const across = sun.yz;
  const slant = length(across);
  const heading = across.div(max(slant, PLUME_EPSILON));

  // How far along the ray's track across the plume the point already is, and
  // how close that track passes to the axis
  const ahead = dot(frame.lateral, heading);
  const miss = max(dot(frame.lateral, frame.lateral).sub(ahead.mul(ahead)), 0);

  const crossing = exp(k.mul(miss).negate())
    .mul(Math.sqrt(Math.PI) / 2)
    .div(root_k)
    .mul(erfc(ahead.mul(root_k)))
    .div(max(slant, SUN_MIN_SLANT));

  return axis.mul(crossing) as unknown as V3;
};

/**
 * The jet one engine makes, worked out from its params. Mirrors `jet_state`.
 * @param engine The engine's params, scaled to its world
 * @param profile The air it runs in
 * @returns What the jet is, less what the fragment does not need here
 */
export const plume_jet = (
  engine: PlumeEngineNodes,
  profile: PlumeProfileNodes,
) => {
  const travel = clamp(engine.throttle, 0, AFTERBURNER_MAX_THROTTLE);

  // The dry engine is at its hardest by the detent, and reheat adds to that
  const throttle = min(travel, 1);

  const threshold = profile.burnerThreshold;

  // The first zone lights just past the threshold, the rest stage in
  const lit = smoothstep(threshold, threshold.add(PLUME_LIGHT_OFF), travel);

  const staged = smoothstep(
    threshold,
    max(threshold.add(PLUME_LIGHT_OFF), AFTERBURNER_MAX_THROTTLE),
    travel,
  );

  // A threshold at or under zero is an engine with no burner, always lit
  const burner = select(
    threshold.lessThanEqual(0),
    float(1),
    lit.mul(mix(float(PLUME_MIN_REHEAT), float(1), staged)),
  );

  // A turbine runs hotter the harder it is pushed
  const ambient_k = profile.air.temperatureK;

  const dry_temperature = mix(
    ambient_k,
    engine.dryTemperature,
    mix(profile.idleTemperature, float(1), throttle),
  );

  const exit_temperature = mix(dry_temperature, engine.exitTemperature, burner);

  // Only an engine with a dry state breathes air, and only its core has any
  const breathes = smoothstep(
    0,
    0.2,
    float(1).sub(engine.dryTemperature.div(max(engine.exitTemperature, 1))),
  );

  const air = profile.air;

  // A rocket's exit pressure is its chamber's, so its ratio climbs as the air
  // thins. A jet's follows its inlet, which sees the ambient times the ram
  const ambient_scale = mix(
    float(1).div(max(air.pressure, 1e-9)),
    air.ram,
    breathes,
  );

  const built_ratio = max(
    engine.pressureRatio
      .mul(mix(profile.idlePressure, float(1), throttle))
      .mul(ambient_scale),
    0.05,
  );

  const gamma = max(engine.gamma, 1.05);
  const k = gamma.sub(1).mul(0.5);
  const exponent = gamma.div(gamma.sub(1));

  const exit_mach = max(engine.exitMach, 0.2);
  const exit_stagnation = k.mul(exit_mach).mul(exit_mach).add(1);

  // Isentropic from the exit plane to ambient: stagnation pressure is kept
  const total_over_ambient = pow(exit_stagnation, exponent).mul(built_ratio);

  // A jet's nozzle opens up with the ram, up to as wide as it goes
  const widest = k.mul(PLUME_NOZZLE_MAX_MACH * PLUME_NOZZLE_MAX_MACH).add(1);

  const lip_stagnation = max(
    min(
      exit_stagnation.mul(pow(max(air.ram, 1), breathes.div(exponent))),
      widest,
    ),
    exit_stagnation,
  );

  const lip_temperature = exit_temperature
    .mul(exit_stagnation)
    .div(lip_stagnation);

  // What the gas still has to expand by once it is out
  const pressure_ratio = max(
    total_over_ambient.div(pow(lip_stagnation, exponent)),
    0.05,
  );

  const mach = max(
    sqrt(max(pow(total_over_ambient, float(1).div(exponent)).sub(1), 0).div(k)),
    0.2,
  );

  const jet_stagnation = k.mul(mach).mul(mach).add(1);

  const temperature = exit_temperature.mul(exit_stagnation).div(jet_stagnation);

  // And by continuity, how much wider or narrower it is once expanded
  const area = exit_mach
    .div(mach)
    .mul(
      pow(
        jet_stagnation.div(exit_stagnation),
        gamma.add(1).div(gamma.sub(1).mul(2)),
      ),
    );

  const expanded = clamp(area, 0.25, 36);

  const radius = engine.nozzleRadius.mul(sqrt(expanded));

  const gas_constant = float(8314.46).div(max(engine.molarMass, 1));

  const sound = sqrt(gamma.mul(gas_constant).mul(temperature));
  const velocity = mach.mul(sound);

  // Continuity: the same mass through a wider, faster jet
  const exit_velocity = exit_mach.mul(
    sqrt(gamma.mul(gas_constant).mul(exit_temperature)),
  );

  const thinning = exit_velocity.div(max(expanded.mul(velocity), 1e-3));

  const ambient = air.temperatureK;
  const airspeed = max(profile.airspeedMPerS, 0);

  const convective = max(velocity.sub(airspeed), 0).div(sound.add(air.sound));

  // Air moving with the jet shears it less
  const coflow = clamp(airspeed.div(velocity), 0, PLUME_MAX_COFLOW);
  const shear = float(1).sub(coflow).div(coflow.add(1));

  const compressibility = exp(convective.mul(convective).mul(-3.4))
    .mul(0.77)
    .add(0.23);

  const density = ambient
    .div(max(temperature, 1))
    .mul(engine.molarMass.div(28.97));

  const diameter = radius.mul(2);

  const core_length = profile.coreScale
    .mul(diameter)
    .mul(mach.mul(mach).mul(1.1).add(4.2))
    .mul(pow(clamp(density, 0.01, 10), 0.28))
    .div(shear);

  const spread_far = profile.spreadScale.mul(PLUME_FAR_SPREAD).mul(shear);
  const spread_near = spread_far.mul(compressibility);

  // Pack's spacing, and how strong the train is
  const supersonic = smoothstep(1, 1.2, mach);

  const shock_spacing = diameter
    .mul(1.306)
    .mul(sqrt(max(mach.mul(mach).sub(1), 0.04)));

  const mismatch = float(1).sub(exp(abs(log(pressure_ratio)).mul(-4)));

  // A dry jet's train is too cool to glow until the burner relights it
  const diamonds = mix(float(1), burner, breathes);

  const strength = mix(profile.shockFloor, float(1), mismatch)
    .mul(supersonic)
    .mul(diamonds);

  // How far the gas swings either side of the jet through a cell, at most up
  // to its stagnation temperature behind a disk
  const shock_heat = strength.mul(jet_stagnation.sub(1));

  // The train lasts as long as the supersonic core does: past the core the
  // axis' excess speed and heat fall together, and it ends where the speed
  // left no longer outruns the sound there. Mirrors `sonic_distance`
  const gamma_r = gamma.mul(gas_constant);
  const heat = gamma_r.mul(temperature.sub(ambient));
  const excess = velocity.sub(airspeed);
  const speed = max(excess.mul(excess), 1);

  const sonic_share = clamp(
    heat
      .add(sqrt(heat.mul(heat).add(speed.mul(gamma_r).mul(ambient).mul(4))))
      .div(speed.mul(2)),
    0.05,
    1,
  );

  const sonic = core_length.mul(pow(max(pow(sonic_share, -4).sub(1), 0), 0.25));

  const shock_length = profile.shockPersistence
    .mul(sonic)
    .div(PLUME_SHOCK_DECAYS);

  // A normal shock's density ratio at the jet's Mach number
  const normal = gamma
    .add(1)
    .mul(mach)
    .mul(mach)
    .div(gamma.sub(1).mul(mach).mul(mach).add(2));

  const compression = mix(float(1), normal, strength);

  const first_disk = smoothstep(0.9, 1.3, pressure_ratio).mul(0.3).add(0.5);

  // How far it is worth drawing
  const visible_excess = max(profile.visibleTemperatureK.sub(ambient), 1);

  // The fuel left over burns only where there is air enough to burn it in
  const quench = air.density
    .mul(1 + PLUME_QUENCH_DENSITY)
    .div(air.density.add(PLUME_QUENCH_DENSITY));

  const afterburning = max(engine.afterburning.mul(burner), 0).mul(quench);

  // And soot only burns out where there is oxygen to burn it: high up, what
  // the mixing layer would have burnt away at sea level survives as smoke
  const soot_survival = mix(float(1), clamp(engine.sootSurvival, 0, 1), quench);

  // A jet's soot falls with the pressure it burns at, a rocket's stays. And a
  // jet's is its burner flame's: none until the exhaust is hot enough to be one
  const soot_formed = mix(
    float(1),
    min(
      pow(max(air.pressure.mul(air.ram), 1e-6), PLUME_SOOT_PRESSURE_EXPONENT),
      3,
    ).mul(smoothstep(...PLUME_SOOT_FLAME_K, exit_temperature)),
    breathes,
  );

  const reheat = afterburning.mul(breathes);

  const hottest_excess = max(temperature.sub(ambient), 0).add(
    afterburning.mul(4),
  );

  const thermal = core_length.div(
    max(visible_excess.div(max(hottest_excess, 1e-3)), 1e-3),
  );

  const extinction = max(engine.soot, 0)
    .mul(soot_formed)
    .mul(soot_survival)
    .add(max(engine.particles, 0))
    .mul(thinning);

  const smoke_depth = extinction.mul(core_length).mul(spread_far).mul(2.13);

  // Never short of the first disk and the cell behind it, which high up
  // stands far down a ballooning plume and is the brightest thing in it
  const shortest = max(radius.mul(8), first_disk.add(1.5).mul(shock_spacing));

  const longest = max(
    profile.maxLengthD.mul(engine.nozzleRadius).mul(2),
    shortest,
  );

  const reach = clamp(
    max(thermal, smoothstep(0.01, 0.06, smoke_depth).mul(longest)),
    shortest,
    longest,
  );

  // The camera only opens up for a burner it can see. Dry, there is only the
  // glow, drawn at the exposure the burner is
  const lighting = min(burner.div(PLUME_MIN_REHEAT), 1);

  const glow = breathes
    .mul(lighting.oneMinus())
    .mul(mix(float(PLUME_IDLE_GLOW), float(1), throttle))
    .mul(max(profile.dryGlow, 0))
    .div(max(profile.exposure, 1e-6));

  // And once the burner lights, the pipe is full of its flame, burning at the
  // gas's stagnation temperature
  const pipe_flame = breathes
    .mul(lighting)
    .mul(max(engine.soot, 0))
    .mul(soot_formed);
  const pipe_temperature = exit_temperature.mul(exit_stagnation);

  // What the pipe glows at: its hardware dry, its flame lit
  const glow_temperature = mix(exit_temperature, pipe_temperature, lighting);

  // How far the camera opens up for a burner dimmer than at full power
  const adaptation = clamp(
    exp(
      clamp(profile.adaptation, 0, 1)
        .mul(lighting)
        .mul(PLUME_PHOTOPIC_K)
        .mul(
          float(1)
            .div(max(exit_temperature, 1))
            .sub(float(1).div(max(engine.exitTemperature, 1))),
        ),
    ),
    1,
    PLUME_MAX_ADAPTATION,
  );

  const extent = float(PLUME_FIELD_EXTENT)
    .add(max(engine.turbulence, 0).mul(PLUME_EDDY_REACH))
    .add(max(engine.meander, 0))
    .mul(1.05);

  const far_width = radius
    .add(spread_near.mul(min(reach, core_length)))
    .add(spread_far.mul(max(reach.sub(core_length), 0)));

  return {
    burner,
    breathes,
    radius,
    velocity,
    core_length,
    reach,
    temperature,
    afterburning,
    reheat,
    thinning,
    exit_temperature,
    lip_temperature,
    compression,
    soot_survival,
    soot_formed,
    adaptation,
    glow,
    pipe_flame,
    glow_temperature,
    shock_heat,
    shock_length,
    shock_spacing,
    first_disk,
    spread_near,
    spread_far,
    outer_near: radius.mul(extent),
    outer_far: far_width.mul(extent),
  };
};

/**
 * The jet's half-width at one station. Mirrors `jet_half_width`.
 * @param x Metres downstream
 * @param jet The jet
 * @returns The half-width, in metres
 */
export const plume_half_width = (x: F, jet: PlumeJetNodes): F => {
  const station = max(x, 0);

  return jet.radius
    .add(jet.spreadNear.mul(min(station, jet.coreLength)))
    .add(jet.spreadFar.mul(max(station.sub(jet.coreLength), 0)));
};

/**
 * The centreline excess temperature, as a share of the exit's.
 * Mirrors `jet_centreline`: one in the core, x_c / x far past it.
 * @param x Metres downstream
 * @param jet The jet
 * @returns 0 to 1
 */
export const plume_centreline = (x: F, jet: PlumeJetNodes): F => {
  const ratio = max(x, 0).div(max(jet.coreLength, PLUME_EPSILON));
  const squared = ratio.mul(ratio);

  return pow(squared.mul(squared).add(1), -0.25);
};

/**
 * Where a station sits in the flow, in metres of travel at the exit velocity.
 *
 * The centreline velocity holds through the core and falls as x_c / x past it,
 * so advecting each station at its own speed shears the field a little more
 * every second. What convects rigidly is the travel time to a station, which
 * for that velocity is linear and then quadratic.
 * @param x Metres downstream
 * @param jet The jet
 * @returns The station, in metres
 */
export const plume_station = (x: F, jet: PlumeJetNodes): F => {
  const core = max(jet.coreLength, PLUME_EPSILON);
  const station = max(x, 0);

  return select(
    station.lessThan(core),
    station,
    core.add(station.mul(station).sub(core.mul(core)).div(core.mul(2))),
  );
};

/**
 * Where a ray enters and leaves the field's bounding cylinder.
 * @param origin The ray's origin, in the nozzle's frame
 * @param direction Its direction, unit length
 * @param radius The cylinder's radius
 * @param reach Its length, from the exit plane
 * @param far The furthest the ray may go, where the scene stops it
 * @returns x: entry distance, y: exit distance; empty when y <= x
 */
export const plume_span = (
  origin: V3,
  direction: V3,
  radius: F,
  reach: F,
  far: F,
): V2 => {
  // Clip against the two end caps first
  // Which is also what throws away the half of the cylinder at x < 0
  const parallel = direction.x.abs().lessThan(PLUME_EPSILON);

  const cap_a = origin.x.negate().div(direction.x);
  const cap_b = reach.sub(origin.x).div(direction.x);

  const outside_caps = origin.x.lessThan(0).or(origin.x.greaterThan(reach));

  const near_caps = select(parallel, float(0), max(min(cap_a, cap_b), 0));
  const far_caps = select(
    parallel,
    select(outside_caps, float(-1), far),
    min(far, max(cap_a, cap_b)),
  );

  // Then against the wall, which in the nozzle's own frame is y² + z² = r²
  const a = dot(direction.yz, direction.yz);
  const b = dot(origin.yz, direction.yz).mul(2);
  const c = dot(origin.yz, origin.yz).sub(radius.mul(radius));

  const discriminant = b.mul(b).sub(a.mul(c).mul(4));
  const root = sqrt(max(discriminant, 0));

  // The ray runs straight down the axis
  // So it is inside for its whole length or outside for all of it
  const axial = a.lessThan(PLUME_EPSILON);

  const near_t = select(
    axial,
    near_caps,
    max(near_caps, b.negate().sub(root).div(a.mul(2))),
  );

  const far_t = select(
    axial,
    select(c.greaterThan(0), float(-1), far_caps),
    select(
      discriminant.lessThan(0),
      float(-1),
      min(far_caps, b.negate().add(root).div(a.mul(2))),
    ),
  );

  return vec2(near_t, far_t);
};

/**
 * The parameter along a ray where it passes closest to the plume's axis.
 * @param origin The ray's origin, in the nozzle's frame
 * @param direction Its direction, unit length
 * @param span Where it enters and leaves the plume
 * @returns The distance along the ray, held inside the span
 */
export const plume_closest = (origin: V3, direction: V3, span: V2): F => {
  const lateral = dot(direction.yz, direction.yz);

  return select(
    lateral.greaterThan(PLUME_EPSILON),
    clamp(dot(origin.yz, direction.yz).negate().div(lateral), span.x, span.y),
    span.x.add(span.y).mul(0.5),
  );
};

/**
 * What the bound and the field share at one point, worked out once.
 */
export type PlumeFrame = {
  point: V3;

  /** Metres downstream, and how far through the potential core, 0 to 1 */
  x: F;
  core: F;

  halfWidth: F;

  /** The centreline excess, 0 to 1, and the local centreline velocity */
  centre: F;
  speed: F;

  /** The station the flow has carried this point from, in metres */
  station: F;

  /** How thick the mixing layer is here */
  layer: F;

  /**
   * The point off the meandering axis, and how far off it is: against the
   * nozzle's outline, as the radius of the round exit it stands in for
   */
  lateral: V2;
  radial: F;

  /**
   * How much further than `radial` the field may reach from the axis, the
   * outline's widest over its mean, one once the jet is round
   */
  spread: F;
};

/**
 * How long a structure is along the flow, in station metres, once the shutter
 * has streaked it.
 * @param size How long it is, in metres, with the shutter closed
 * @param frame Where it is
 * @param context The plume
 * @returns Its period in station coordinates
 */
const streaked = (size: F, frame: PlumeFrame, context: PlumeContext): F => {
  const { jet, profile } = context;

  // Large structures convect at about 0.6 of the local centreline velocity
  const convective = frame.speed.mul(0.6);

  // A metre here is velocity / local speed metres of station
  return size
    .add(convective.mul(profile.shutterS))
    .mul(jet.velocity)
    .div(max(frame.speed, PLUME_EPSILON));
};

/**
 * Work out what both the bound and the field need at one point.
 * @param point The point, in the nozzle's frame
 * @param context The plume
 * @returns The shared frame
 */
export const plume_frame = (point: V3, context: PlumeContext): PlumeFrame => {
  const { jet, profile, time } = context;

  const x = point.x;

  const core = clamp(x.div(max(jet.coreLength, PLUME_EPSILON)), 0, 1).toVar();

  const half_width = plume_half_width(x, jet).toVar();
  const centre = plume_centreline(x, jet).toVar();
  const speed = jet.velocity.mul(centre).toVar();
  const station = plume_station(x, jet).toVar();

  // Thin at the lip, the core's own radius by the time it closes
  const layer = max(
    half_width.sub(jet.radius.mul(core.oneMinus())),
    jet.radius.mul(0.02),
  ).toVar();

  const frame_so_far = {
    point,
    x,
    core,
    halfWidth: half_width,
    centre,
    speed,
    station,
    layer,
  } as unknown as PlumeFrame;

  // The far plume meanders as its large structures roll up, carried at their
  // convective speed. Rigid at the lip, free past a couple of core lengths
  const freedom = smoothstep(0, jet.coreLength.mul(2), x);

  const period = streaked(
    half_width.mul(profile.meanderScale),
    frame_so_far,
    context,
  );

  const phase = station.sub(time.mul(jet.velocity).mul(0.6)).div(period);

  // Both curves from one fetch of the noise volume
  const drift = volume_wander(phase, jet.seed)
    .sub(0.5)
    .mul(jet.meander.mul(half_width).mul(freedom).mul(2));

  const lateral = point.yz.sub(drift).toVar();
  const round = length(lateral).toVar();

  const measured = {
    ...frame_so_far,
    lateral,
    radial: round,
    spread: float(1),
  };

  return jet.outline
    ? { ...measured, ...plume_outline(measured, jet.outline, jet) }
    : measured;
};

/**
 * How far out a point is against a nozzle's outline, and how far past that the
 * field may reach, the outline relaxing to round downstream.
 * @param frame The frame, measured round
 * @param outline The nozzle's outline
 * @param jet The jet
 * @returns The point's radius and the spread it allows
 */
export const plume_outline = (
  frame: PlumeFrame,
  outline: PlumeOutlineNodes,
  jet: PlumeJetNodes,
): { radial: F; spread: F } => {
  const { lateral, radial: round, x } = frame;

  // Into the outline's own axes: u across its width, v up its height, both
  // turned by the roll about +X, the way the plume runs
  const [cos, sin] = [outline.roll.x, outline.roll.y];
  const u = lateral.y.mul(cos).sub(lateral.x.mul(sin));
  const v = lateral.x.mul(cos).add(lateral.y.mul(sin));

  let shaped: F;

  if (outline.radius) {
    // Out to the outline that way is a nozzle radius
    const direction = vec2(u, v).div(max(round, PLUME_EPSILON));

    shaped = round.div(max(outline.radius(direction, frame), PLUME_EPSILON));
  } else {
    // The superellipse's own measure, in the round radii of its area. Taken
    // over the larger side, so a high exponent cannot overflow
    const stretch = sqrt(outline.aspect);
    const across = abs(u).div(stretch);
    const up = abs(v).mul(stretch);
    const larger = max(max(across, up), PLUME_EPSILON);
    const n = outline.squareness;

    shaped = larger
      .mul(
        pow(
          pow(across.div(larger), n).add(pow(up.div(larger), n)),
          float(1).div(n),
        ),
      )
      .div(outline.areaScale);
  }

  // The jet mixes round: as itself at the lip, a circle past its length
  const relaxed = smoothstep(
    0,
    max(outline.length.mul(jet.coreLength), PLUME_EPSILON),
    x,
  );

  // Every point the outline holds is within reach × radial of the axis, and a
  // circle's is within radial, so between the two is within the blend
  return {
    radial: mix(shaped, round, relaxed).toVar(),
    spread: float(1)
      .div(mix(float(1).div(max(outline.reach, 1)), float(1), relaxed))
      .toVar(),
  };
};

/**
 * A bound on the distance to anything in the field, in metres, negative inside.
 *
 * The profile is a Gaussian that never quite reaches zero, so "anything" is the
 * extent past which it is under half a percent of the axis, pushed out by as
 * far as an eddy may push it. A positive answer is a promise that the field is
 * empty for at least that far.
 * @param frame The shared frame at the point
 * @param context The plume
 * @returns The bound, in metres
 */
export const plume_bound = (frame: PlumeFrame, context: PlumeContext): F => {
  const { jet } = context;

  const capped = max(frame.point.x.negate(), frame.point.x.sub(jet.reach));

  const extent = frame.halfWidth
    .mul(PLUME_FIELD_EXTENT)
    .add(frame.layer.mul(max(jet.turbulence, 0)).mul(PLUME_EDDY_REACH));

  // Measured round: the outline is no distance, but it holds all of itself
  // within its spread of the axis
  return max(capped, length(frame.lateral).sub(extent.mul(frame.spread)));
};

// How far one curve of volume_wander strays from 0.5 at most, and so the
// meander's furthest reach in each axis as a share of its amplitude
const WANDER_REACH = 0.5 * (0.25 / 0.184);

/**
 * A looser bound than plume_bound, from the point alone: it allows for the
 * meander at its widest rather than measuring it, so it needs none of the
 * frame. Cheap enough to try first on every step of empty space.
 * @param point The point, in the nozzle's frame
 * @param context The plume
 * @returns The bound, in metres; positive means the field is empty that far
 */
export const plume_bound_coarse = (point: V3, context: PlumeContext): F => {
  const { jet } = context;

  const x = point.x;

  const capped = max(x.negate(), x.sub(jet.reach));

  const half_width = plume_half_width(x, jet);

  const core = clamp(x.div(max(jet.coreLength, PLUME_EPSILON)), 0, 1);

  const layer = max(
    half_width.sub(jet.radius.mul(core.oneMinus())),
    jet.radius.mul(0.02),
  );

  const extent = half_width
    .mul(PLUME_FIELD_EXTENT)
    .add(layer.mul(max(jet.turbulence, 0)).mul(PLUME_EDDY_REACH));

  // The outline holds all of itself within its reach of the axis
  const spread = jet.outline ? max(jet.outline.reach, 1) : float(1);

  // Both curves at their furthest at once, a diagonal
  const freedom = smoothstep(0, jet.coreLength.mul(2), x);

  const meander = jet.meander
    .mul(half_width)
    .mul(freedom)
    .mul(2 * WANDER_REACH * Math.SQRT2);

  return max(capped, length(point.yz).sub(extent.mul(spread)).sub(meander));
};

/**
 * What a hook sees about one sample of the plume.
 */
export type PlumeSampleContext = PlumeFrame & {
  context: PlumeContext;

  /** How much of the gas here is exhaust, 0 to 1: the mixture fraction */
  mixture: F;

  /** How far out the sample sits, in half-widths, after the eddies */
  across: F;
};

/**
 * Ways to change what the plume is made of without rewriting it.
 * Every hook is TSL, built once when the material compiles.
 */
export type PlumeFieldHooks = {
  /**
   * The eddies, in [0, 1], replacing the built-in noise volume.
   * @param flow The point in flow space: x runs aft with the gas, yz across it
   */
  turbulence?: (flow: V3, frame: PlumeFrame & { context: PlumeContext }) => F;

  /** The temperature at a sample, in kelvin, after the shocks and burning */
  temperature?: (temperature_k: F, sample: PlumeSampleContext) => F;

  /** What a sample emits per metre, in linear radiance, before exposure */
  emission?: (emission: V3, sample: PlumeSampleContext) => V3;
};

/**
 * What one sample of the plume is.
 */
export type PlumeFieldSample = {
  /** Kelvin */
  temperature: F;

  /** How much of the gas is exhaust, 0 to 1 */
  mixture: F;

  /** Extinction per metre, per primary */
  extinction: V3;

  /** What it emits per metre, per primary, before exposure */
  emission: V3;
};

/**
 * Options compiled into the field.
 */
export type PlumeFieldOptions = {
  /** Octaves of eddy noise, 1 to 3 */
  octaves: number;

  hooks?: PlumeFieldHooks;
};

/**
 * What the plume is at one point. Must be called inside an `Fn`.
 * @param frame The shared frame at the point
 * @param footprint x: how much one sample covers, y: how much axis it covers
 * @param turbulent Whether to draw the eddies, the detail tier's switch
 * @param context The plume
 * @param options What is compiled in
 * @returns What the sample is
 */
export const plume_field = (
  frame: PlumeFrame,
  footprint: V2,
  turbulent: B,
  context: PlumeContext,
  options: PlumeFieldOptions,
): PlumeFieldSample => {
  const { jet, profile, time } = context;
  const {
    x,
    core,
    halfWidth: half_width,
    centre,
    layer,
    lateral,
    radial,
  } = frame;

  // The eddies push the profile about by up to a fraction of the mixing
  // layer's thickness, which is a mixing length model: the fluctuation they
  // make is that length times the local gradient, and so it is strongest
  // exactly where the gradient is, in the shear layer
  const displaced = radial.toVar();

  // The potential core: gas that has not met the air yet, at the exit's own
  // temperature. A cone, the full nozzle at the lip and closing to a point at
  // the end of the core, as the mixing layer eats in from the lip line while
  // it grows outward. That narrowing cone is the hot, bright flame a fighter
  // shows, and what makes it read as a flame rather than a barrel
  const core_radius = jet.radius.mul(core.oneMinus()).toVar();

  // Across the mixing layer the gas falls from the core's to half of it at the
  // half-width, and on out as a Gaussian. Past the core this is the far
  // field's Gaussian in the half-width; at the lip a step at the lip line
  const shear_width = max(
    half_width.sub(core_radius),
    jet.radius.mul(0.04),
  ).toVar();

  // The eddies only show where they move the profile: deep in the core, or
  // past where it has fallen to nothing, however far they push the point it is
  // the same, and the noise is the dearest part of a sample
  const push = jet.turbulence.mul(layer).mul(PLUME_EDDY_REACH);

  const reaches_layer = radial
    .add(push)
    .greaterThan(core_radius)
    .and(radial.sub(push).lessThan(core_radius.add(shear_width.mul(3))));

  // Eddies a third of the layer across, growing with it downstream
  const eddy = layer.mul(0.3).add(jet.radius.mul(0.03)).toVar();

  // A step wider than an eddy cannot resolve one, and past 1.2 eddies the
  // noise would be blended out entirely, so it is not fetched
  const blur = smoothstep(0.35, 1.2, footprint.x.div(eddy)).toVar();

  If(turbulent.and(reaches_layer).and(blur.lessThan(1)), () => {
    const along = frame.station
      .sub(time.mul(jet.velocity).mul(0.6))
      .div(streaked(eddy.mul(profile.eddyStretch), frame, context));

    const flow = vec3(along, lateral.div(eddy)).add(jet.seed);

    const raw =
      options.hooks?.turbulence?.(flow, { ...frame, context }) ??
      volume_turbulence(flow, options.octaves);

    const eddies = mix(raw, float(0.5), blur);

    displaced.addAssign(
      signed(eddies).mul(jet.turbulence).mul(layer).mul(PLUME_EDDY_REACH),
    );
  });

  const across = max(displaced, 0).div(max(half_width, PLUME_EPSILON)).toVar();

  const into_layer = max(displaced.sub(core_radius), 0).div(shear_width);

  const profile_shape = exp2(into_layer.mul(into_layer).negate());

  // Faded out over the last part of the reach, and nothing upstream of the lip
  const window = smoothstep(jet.reach, jet.reach.mul(0.7), x).mul(
    select(x.lessThan(0), float(0), float(1)),
  );

  const mixture = centre.mul(profile_shape).mul(window).toVar();

  const ambient = profile.air.temperatureK;

  const spacing = max(jet.shockSpacing, PLUME_EPSILON);

  // Upstream of the first disk the exhaust is still expanding from the exit
  // plane: hotter and denser than the jet it becomes. Next to nothing at sea
  // level, and most of what a rocket high up shows
  const expanding = float(1)
    .sub(smoothstep(0, max(jet.firstDisk.mul(spacing), PLUME_EPSILON), x))
    .toVar();

  const core_temperature = mix(
    jet.temperature,
    max(jet.lipTemperature, jet.temperature),
    expanding,
  );

  // Mixed: exhaust and air in proportion, and the fuel the exhaust still
  // carries burning where it meets the air, peaking at an even mix
  const mixed = ambient
    .add(core_temperature.sub(ambient).mul(mixture))
    .add(jet.afterburning.mul(mixture).mul(mixture.oneMinus()).mul(4))
    .toVar();

  // The shock train. Each cell is an expansion and a recompression: behind a
  // Mach disk the gas is nearly at rest and nearly at its stagnation
  // temperature, then the expansion fan off the lip speeds it up past the
  // jet's Mach number and cools it far below the jet, until the oblique shocks
  // closing on the axis squeeze it into the next disk. Blackbody emission
  // being as steep as it is, that is a few hundred times brighter behind the
  // disk than in the expansion, which is the whole reason diamonds show
  const cells = x.div(spacing).sub(jet.firstDisk);

  const behind = fract(cells);

  // The inviscid core the shocks live in, eaten in by the mixing layer
  const inviscid = jet.radius
    .mul(
      clamp(
        float(1).sub(x.div(max(jet.shockLength, PLUME_EPSILON)).mul(0.65)),
        0.12,
        1,
      ),
    )
    .toVar();

  // Measured from the axis itself: the eddies live in the mixing layer, and
  // the inviscid core they have not reached yet is exactly where the shocks are
  const radial_share = radial.div(max(inviscid, PLUME_EPSILON));

  // The hot gas behind each disk: a lozenge, sharp where the disk stands and
  // tapering as the fan eats into it. The relaxation sets how much of the
  // cell it fills
  const hot_length = clamp(
    float(2.5).div(max(profile.shockRelaxation, 0.5)),
    0.05,
    0.9,
  );

  const lozenge = abs(behind.sub(hot_length.mul(0.5)))
    .div(hot_length.mul(0.5))
    .add(radial_share.div(0.85));

  // Hottest right behind the disk, cooling as the gas runs on behind it
  const recovering = float(1).sub(
    clamp(behind.div(hot_length), 0, 1).mul(0.55),
  );

  const lozenge_hot = float(1)
    .sub(smoothstep(0.2, 1.05, lozenge))
    .mul(recovering);

  // The barrel shock: a thin sheet of gas heated passing through it, from the
  // disk's rim out to its widest mid-cell and back in to the next disk. Where
  // it runs parallel to the axis a ray down the axis grazes it for its whole
  // bow, so seen from astern each cell is a ring, and as the core narrows
  // downstream the rings nest. Side on, it outlines the diamond
  const barrel = float(BARREL_RIM).add(
    behind.mul(behind.oneMinus()).mul(4 * BARREL_BOW),
  );

  // A sample sees the sheet averaged over how far across the core it reaches,
  // so a coarse step sees it dimmer and wider rather than flickering
  const sideways = sqrt(
    max(footprint.x.mul(footprint.x).sub(footprint.y.mul(footprint.y)), 0),
  ).div(max(inviscid, PLUME_EPSILON));

  const sheet_width = max(float(BARREL_WIDTH), sideways.mul(0.5));

  const sheet = exp2(radial_share.sub(barrel).div(sheet_width).pow(2).negate())
    .mul(sheet_width.reciprocal().mul(BARREL_WIDTH))
    .mul(BARREL_HEAT);

  const hot = max(lozenge_hot, sheet);

  // The first disk stands where the first expansion ends; before it there is
  // only that expansion
  const started = smoothstep(-0.15, 0, cells);

  // A step too coarse to see a cell sees their average, which is about the jet
  const resolved = float(1).sub(
    smoothstep(0.15, 0.6, footprint.y.div(spacing)),
  );

  // Full strength at the first disk, weakening from there as the core is mixed out
  const downstream = max(cells, 0).mul(spacing);

  const swing = jet.shockHeat
    .mul(exp(downstream.div(max(jet.shockLength, PLUME_EPSILON)).negate()))
    .mul(resolved);

  // Hot by the whole swing behind a disk, cold by most of it in the fan
  // The expansion reaches the whole supersonic jet, not only its core, and
  // being a share of the excess it fades out through the mixing layer itself
  // Not at the lip itself, though, where the gas is still what left the bell
  const cell = hot
    .mul(started)
    .sub(hot.oneMinus().mul(expanding.oneMinus()).mul(0.6));

  // And a reheat's core relit by it: the fuel the exhaust still carries burns
  // behind each disk as well as at the edge, which is most of why its diamonds
  // are yellow-white while the gas between them is dull red
  const disked = hot
    .mul(started)
    .mul(swing.div(max(jet.shockHeat, PLUME_EPSILON)))
    .toVar();

  const relit = jet.reheat.mul(disked).mul(mixture);

  // How dense the gas is against the exit plane's: thinned as it expands, and
  // squeezed back up behind each disk, though never past where it started
  const dense = min(
    mix(jet.thinning, float(1), expanding).mul(
      mix(float(1), jet.compression, disked),
    ),
    1,
  ).toVar();

  // As a ratio, as an isentropic change is: a weak train swings the gas by
  // the same either way, a strong one heats it severalfold behind the disk
  // and cools it by a share in the fan, never past absolute zero
  const shocked = mixed
    .add(mixed.sub(ambient).mul(pow(swing.add(1), cell).sub(1)))
    .add(relit)
    .toVar();

  const sample: PlumeSampleContext = {
    ...frame,
    context,
    mixture,
    across,
  };

  const temperature = max(
    options.hooks?.temperature?.(shocked, sample) ?? shocked,
    1,
  ).toVar();

  // What is in the gas. Soot shows only where it is hot enough to glow: in
  // the flame and behind each disk. Where the exhaust has mixed or expanded
  // below that, all but the share that survives into the far plume is drawn
  // burnt out, rather than as cold soot that could only darken the sky
  const flame = smoothstep(...PLUME_SOOT_FLAME_K, shocked);

  const soot = jet.soot
    .mul(dense)
    .mul(mixture)
    .mul(mix(jet.sootSurvival, float(1), flame));

  const particles = jet.particles.mul(dense).mul(mixture);

  const soot_rgb = vec3(...SOOT_SPECTRUM).mul(soot);

  const absorption = soot_rgb.add(particles.mul(jet.albedo.oneMinus()));
  const extinction = soot_rgb.add(particles);

  // Thermal emission: whatever absorbs, emits, at the local temperature
  const thermal = absorption.mul(context.blackbody(temperature));

  // Band emission from the radicals, climbing steeply with temperature
  const activated = exp(
    min(
      profile.activationK.mul(
        float(1 / REFERENCE_TEMPERATURE_K).sub(float(1).div(temperature)),
      ),
      6,
    ),
  );

  const band = jet.bandColor
    .mul(jet.bandStrength)
    .mul(dense)
    .mul(mixture)
    .mul(activated);

  // And the sky, scattered by whatever is white
  const lighting = vec3(profile.skyLight).toVar();

  // And the sun, from one way, through whatever of the plume is between
  const sun = context.sun;

  if (sun) {
    If(
      profile.sunLight.greaterThan(0).and(jet.particles.greaterThan(0)),
      () => {
        // The extinction the plume has on its axis here, as the profile across
        // it is measured from: what the gas holds when it is all exhaust
        const axis_soot = jet.soot
          .mul(dense)
          .mul(frame.centre)
          .mul(mix(jet.sootSurvival, float(1), frame.centre));

        const axis = vec3(...SOOT_SPECTRUM)
          .mul(axis_soot)
          .add(jet.particles.mul(dense).mul(frame.centre));

        const depth = plume_sun_depth(
          frame,
          axis as unknown as V3,
          sun.direction,
        );

        const direct = exp(depth.negate()).mul(
          sun.phase.mul(1 - SUN_MULTIPLE_SHARE),
        );

        const leaked = exp(depth.mul(-SUN_MULTIPLE_THINNING)).mul(
          SUN_MULTIPLE_SHARE,
        );

        lighting.addAssign(direct.add(leaked).mul(profile.sunLight));
      },
    );
  }

  const scattered = lighting.mul(particles.mul(jet.albedo));

  const emitted = thermal.add(band).add(scattered);

  return {
    temperature,
    mixture,
    extinction: extinction as unknown as V3,
    emission: (options.hooks?.emission?.(emitted as unknown as V3, sample) ??
      emitted) as unknown as V3,
  };
};
