import { Color } from "three";

// The dials split three ways, and the split is the whole shape of this module
//
// `AfterburnerParams` is what one engine is: its nozzle, the gas leaving it and
// what that gas is carrying. They ride on the instance, so two engines on one
// airframe may burn differently. Every one of them is a physical quantity, in SI
// units, and there is no colour among them but one: the plume's colour comes
// out of its temperature, through Planck's law, and nowhere else
//
// `AfterburnerProfile` is the world the engines run in and the camera looking
// at them: the air, the exposure, the shutter. It rides on the material as
// uniforms, shared by every nozzle in one batch and free to move while it runs
//
// `AfterburnerQuality` is what a frame may spend. The step counts are uniforms
// too, the march's bound being dynamic; only the octave count is compiled in

/**
 * One engine: its nozzle and the gas leaving it, in SI units.
 */
export type AfterburnerParams = {
  /**
   * The nozzle exit radius, in metres. Every length in the plume is set by it
   * and by the gas below: nothing about the plume's length is a dial
   *
   * For a nozzle that isn't round, the radius of the round exit of the same
   * area: the outline below sets the shape, this its size
   */
  nozzleRadiusM: number;

  /**
   * The exit's width over its height. One is round, or square; an oval
   * fighter nozzle is about 1.4, a flat vectoring one 3 or more
   *
   * The width runs along the nozzle frame's x and the height along its y.
   * A plume aimed with `direction` keeps its y as near up as the turn allows,
   * so a wide nozzle aimed level is wide side to side
   */
  nozzleAspect: number;

  /**
   * How square the exit is, as a superellipse's exponent
   * Two is an ellipse, four a rounded rectangle, eight and up a sharp one;
   * one is a diamond. Held between 0.5 and 24
   */
  nozzleSquareness: number;

  /**
   * How far the outline is turned about the plume's axis, in radians
   * Right handed about the way the gas runs, as a rotation about that axis is:
   * a quarter turn stands a wide exit on its side
   */
  nozzleRoll: number;

  /**
   * How far downstream the outline lasts, in potential core lengths
   *
   * A jet from a shaped exit mixes round: its corners and its long sides shear
   * faster than the rest, and by the end of the core little of the shape is
   * left. Zero is round from the lip
   */
  nozzleOutlineLength: number;

  /**
   * The Mach number the nozzle is built to, at its exit plane
   * About 1.5 for a fighter's convergent-divergent nozzle, 3 to 4.5 for a
   * rocket bell at sea level
   */
  exitMach: number;

  /**
   * Exit pressure over ambient, at full power, standing still at sea level
   *
   * Above one the jet is underexpanded and balloons, then recompresses through
   * a train of shocks; below one it is overexpanded and pinches. At exactly one
   * it leaves clean and the diamonds all but vanish. This is the one number
   * that decides how strong the shock diamonds are
   *
   * It moves with the air the profile puts the engine in. A rocket's exit
   * pressure is fixed by its chamber, so as the air thins with altitude the
   * ratio climbs and the plume balloons. A jet's is fixed by what its inlet
   * swallows, which falls with the air and climbs with the ram of flight
   */
  pressureRatio: number;

  /**
   * The gas's static temperature at the exit plane at full power, in kelvin
   *
   * Static, not stagnation: a nozzle trades heat for speed, so a rocket whose
   * chamber is at 3500 K leaves its bell at nearer 1500. What the gas recovers
   * behind a Mach disk is what makes the disk glow
   */
  exitTemperatureK: number;

  /**
   * And on dry thrust, with the burner out
   * A rocket has no burner, so for a rocket this is the same as the above
   */
  dryTemperatureK: number;

  /**
   * The exhaust's ratio of specific heats, about 1.3 for a jet and 1.2 for a
   * rocket's hot, dissociated products
   */
  gamma: number;

  /**
   * The exhaust's mean molar mass, in grams per mole
   * Air is 29; hydrogen-rich exhaust is about 13, which is why it is so fast
   */
  molarMassGPerMol: number;

  /**
   * Soot in the exhaust, as its absorption coefficient at 550 nm, per metre
   *
   * Soot absorbs and emits as one over the wavelength, so it reddens what it
   * glows and what it lets through. A clean afterburner has a trace, a kerosene
   * rocket enough that its plume is opaque, and soot that has cooled is smoke
   *
   * For a jet this is its burner flame's soot: it makes none while its exhaust
   * is too cool to be a flame, see `PLUME_SOOT_FLAME_K`
   */
  sootPerM: number;

  /**
   * How much of that soot survives into the far plume, 0 to 1
   *
   * Soot meeting hot air burns. A reheat's trace is gone a few diameters aft,
   * which is why a fighter leaves no smoke; a kerosene rocket makes far more
   * than the mixing layer can burn, and trails it for kilometres
   */
  sootSurvival: number;

  /**
   * Grey particles in the exhaust, as their extinction coefficient per metre
   * The alumina of a solid motor burning aluminium; zero for a liquid engine
   */
  particlesPerM: number;

  /**
   * How much of that extinction is scattering rather than absorption, 0 to 1
   * Alumina is white, so it scatters nearly everything
   */
  particleAlbedo: number;

  /**
   * How much hotter the exhaust gets where it mixes with the air, in kelvin
   *
   * Exhaust leaves rich, carrying fuel it had no oxygen for, and that fuel
   * burns the moment it meets the atmosphere. This is the bright sheath round a
   * kerosene rocket, and most of what a hydrogen engine shows at all
   */
  afterburningK: number;

  /**
   * The colour of the gas's own band emission
   *
   * Chemiluminescence from the radicals in the burning gas: the violet-blue of
   * CH and C₂ in a hydrocarbon flame, cyan for an argon plasma. The one colour
   * the shader is given rather than works out, because it is a line spectrum
   */
  bandColor: Color;

  /**
   * How bright that band emission is, per metre of exhaust at the reference
   * temperature, in units of the reference blackbody's luminance
   */
  bandStrength: number;

  /**
   * How turbulent the mixing layer is, as a share of a mixing length
   * Zero is a laminar jet, one is a real one, more is a gusty day
   */
  turbulence: number;

  /** How far the far plume meanders off its axis, as a share of its width */
  meander: number;

  /**
   * How far the hot exhaust bends what is behind it, in metres of displacement
   * The cue that says the gas is hot rather than merely bright
   */
  refractionM: number;
};

/**
 * The world the engines run in and the camera seeing them, shared per batch.
 */
export type AfterburnerProfile = {
  /**
   * How high the engines are, in metres above sea level
   *
   * The air's pressure, temperature and density follow from it through the
   * International Standard Atmosphere, to 86 km and isothermal above. Thin air
   * balloons a rocket's plume and dilutes it, quenches the fuel the exhaust
   * still carries, and bends less light
   */
  altitudeM: number;

  /** How much warmer the day is than the standard one, in kelvin */
  temperatureOffsetK: number;

  /**
   * How fast the engines move through the air, in metres per second
   *
   * Air already moving with the jet shears it less, so the mixing layer grows
   * more slowly and the core and the shock train last further. An inlet moving
   * that fast also rams its air, raising a jet engine's exit pressure
   */
  airspeedMPerS: number;

  /**
   * How bright the plume is drawn, as a multiplier on its radiance
   *
   * A camera's exposure, in linear units: the radiance itself is physical, a
   * blackbody at 2000 K having a luminance of one, and a real plume runs from a
   * thousandth of that to a thousand times it. This picks which part of it the
   * tone curve sees
   */
  exposure: number;

  /**
   * How far the camera opens up for a burner dimmer than at full power, 0 to 1
   *
   * A burner just lit is far dimmer than one at the stop, its gas a few
   * hundred kelvin cooler. A camera filming meters it and opens up, so the
   * light-off shows. Zero holds the exposure where it is, one draws every
   * stage as bright as full power, the colour still the gas's own
   */
  adaptation: number;

  /**
   * How bright the dry engine's glow is, as it reaches the screen
   *
   * On dry thrust the exhaust is a thousand kelvin or less, too cool to see
   * but as a shimmer. What shows is the hardware: the last turbine stage and
   * the jet pipe glowing a dull red, only up the nozzle from nearly astern.
   * Brighter the harder the engine runs, gone once the burner lights. Zero
   * leaves a dry engine dark
   */
  dryGlow: number;

  /**
   * How much sky light the particles scatter, in the same units
   * The reason a solid motor's smoke is white in daylight and black at night
   */
  skyLight: number;

  /**
   * How much direct sunlight the particles scatter, in the same units
   *
   * Unlike the sky's, the sun's light comes from one way: smoke seen against
   * the sun glows, seen with the sun behind the camera it is dull, and the side
   * of a thick plume away from the sun is in its own shadow. Zero leaves the
   * plume lit by the sky alone
   */
  sunLight: number;

  /**
   * The direction toward the sun in world space, at any length
   * The position of a directional light aimed at the origin will do
   */
  sunDirection: readonly [number, number, number];

  /**
   * Below this the gas no longer glows enough to see, in kelvin
   * What the plume is cut at, where nothing in it is hot or dense enough to show
   */
  visibleTemperatureK: number;

  /**
   * The longest any plume is drawn, in exit diameters
   * A smoky plume never ends on its own, so it is faded out by here
   */
  maxLengthD: number;

  /**
   * Below this throttle the engine is on dry thrust; a rocket's is zero
   *
   * The throttle runs from 0 at idle to 1 at military power, the most the dry
   * engine makes, and on to 1.1 at full reheat. The burner lights past here,
   * its first zone fading in over `PLUME_LIGHT_OFF` and the rest staging in up
   * to the stop
   */
  burnerThreshold: number;

  /**
   * What is left of the exit pressure at zero throttle, as a share of full
   * A rocket throttled down is a lower chamber pressure, and so a more
   * overexpanded nozzle with a shorter, tighter shock train
   */
  idlePressure: number;

  /**
   * What is left of the dry exhaust's heat over the air at zero throttle, as
   * a share of what it is at military power. An idling turbine is barely warm;
   * pushed to the detent it leaves at `dryTemperatureK`, still too cool for
   * the gas to show beside the turbine's glow (`dryGlow`)
   */
  idleTemperature: number;

  /**
   * A multiplier on the potential core length Lau's correlation gives, for
   * the jet's Mach number and density. One is the correlation as measured
   */
  coreScale: number;

  /** A multiplier on how fast the mixing layer spreads */
  spreadScale: number;

  /**
   * How strong the shock train of a perfectly expanded nozzle still is, 0 to 1
   * A real nozzle is never perfectly expanded everywhere across its exit
   */
  shockFloor: number;

  /**
   * A multiplier on how far down the plume the shock train lasts. At one it
   * ends where the jet's axis stops being supersonic over the air, past which
   * no shock can stand: see `sonic_distance`. Above one draws the longer
   * trains long exposures show
   */
  shockPersistence: number;

  /**
   * How quickly the gas behind a shock cools as it expands again, per cell
   * High is a sharp disk with a dark gap behind; low is a smeared glow
   */
  shockRelaxation: number;

  /**
   * The activation temperature of the band emission, in kelvin
   * Chemiluminescence climbs very steeply with temperature, which is why the
   * Mach disks of a hydrogen engine glow when the rest of it barely does
   */
  activationK: number;

  /** How much longer an eddy is than it is wide, before the shutter */
  eddyStretch: number;

  /**
   * How long the shutter is open for, in seconds
   *
   * This is the motion blur, and it is what lets the exhaust move at its real
   * speed at all: at 2000 m/s the gas crosses its own eddies many times a
   * frame, and a camera records that as streaks, not as eddies. So the noise is
   * stretched along the flow by exactly what the gas travels while the shutter
   * is open, and slow gas downstream resolves into eddies while fast gas at the
   * nozzle is the smooth streaked barrel a photograph shows
   */
  shutterS: number;

  /** How long a meander is, in local plume widths */
  meanderScale: number;

  /** How far a sphere trace trusts its own distance estimate, 0 to 1 */
  stepSafety: number;

  /** How finely the march's dither is decorrelated, in inverse metres */
  ditherScale: number;
};

/**
 * How much a frame may spend on the plumes.
 */
export type AfterburnerQuality = {
  /**
   * How many march iterations a near plume gets
   * An iteration either skips empty space or samples the field, never both
   * So this is the ceiling on what one fragment costs, not its average
   */
  nearSteps: number;

  /** And how many once the eddies have been dropped */
  midSteps: number;

  /**
   * How many octaves of noise the eddies are built from at the near tier
   * The one setting compiled into the shader, so changing it recompiles
   */
  turbulenceOctaves: number;
};

// Fresh objects every call, the colour being mutable
// A caller tuning one nozzle must not tune every other one with it
/**
 * A fighter's engine at full reheat, as somewhere to start from.
 * @returns Default parameters, in SI units
 */
export const default_afterburner_params = (): AfterburnerParams => ({
  // A large military turbofan's nozzle at full reheat, wide open
  nozzleRadiusM: 0.5,

  // Round, as most are
  nozzleAspect: 1,
  nozzleSquareness: 2,
  nozzleRoll: 0,
  nozzleOutlineLength: 1,

  // A convergent-divergent nozzle scheduled for about Mach 1.45 at the exit,
  // and a little underexpanded at sea level, which is what puts the diamonds in
  exitMach: 1.45,
  pressureRatio: 1.35,

  // A full burner's stagnation temperature is about 2250 K, so after the nozzle
  // has expanded it to Mach 1.45 the gas leaves at about 1700. An unmixed
  // turbojet at military power leaves at about 1000 K, which a camera exposed
  // for a burner does not see at all: see `dryGlow` for what does show
  exitTemperatureK: 1700,
  dryTemperatureK: 1000,

  gamma: 1.3,
  molarMassGPerMol: 28.8,

  // A trace of soot from the reheat's rich spray bars, and none of anything
  // else. Enough to glow yellow-orange where it is hot, not enough to hide
  // what is behind it
  sootPerM: 0.5,
  sootSurvival: 0.03,
  particlesPerM: 0,
  particleAlbedo: 0,

  // A burner runs close to stoichiometric, but not all of its spray burns in
  // the can: what is left burns in the shear layer, the lavender-pink sheath
  // that keeps the column between the diamonds glowing
  afterburningK: 450,

  // The violet-blue of CH* and C₂* in a hydrocarbon flame
  bandColor: new Color("#6d78ff"),

  // The lavender sheath round the shock cells, and the violet of the flame
  // holder seen down the nozzle
  bandStrength: 0.06,

  turbulence: 0.8,
  meander: 0.12,

  refractionM: 0.05,
});

/**
 * The air and the camera, as somewhere to start from.
 * @returns A fresh profile, safe to mutate
 */
export const default_afterburner_profile = (): AfterburnerProfile => ({
  // A standard day at sea level, standing still
  altitudeM: 0,
  temperatureOffsetK: 0,
  airspeedMPerS: 0,

  // A camera exposed for a night sky with a jet in it, wide open enough that
  // the core and the disks clip to yellow-white, as they do in footage
  exposure: 120,
  adaptation: 0.6,
  dryGlow: 0.35,
  skyLight: 0.0005,

  // Night: no sun. Where it would be by day, high and off to one side
  sunLight: 0,
  sunDirection: [0.4, 0.8, 0.45],

  visibleTemperatureK: 850,
  maxLengthD: 40,

  burnerThreshold: 1,
  idlePressure: 0.65,
  idleTemperature: 0.4,

  coreScale: 1,
  spreadScale: 1,

  shockFloor: 0.1,
  shockPersistence: 1,
  shockRelaxation: 4.5,

  // Of the order of the CH* activation energy
  activationK: 18000,

  eddyStretch: 2.5,

  // A 180-degree shutter at thirty frames
  shutterS: 1 / 60,

  meanderScale: 5,

  stepSafety: 0.8,
  ditherScale: 37,
});

/**
 * What a frame may spend on the plumes, as somewhere to start from.
 * @returns Fresh quality settings, safe to mutate
 */
export const default_afterburner_quality = (): AfterburnerQuality => ({
  nearSteps: 64,
  midSteps: 24,
  turbulenceOctaves: 2,
});
