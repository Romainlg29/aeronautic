import type { ColorRepresentation, Object3D } from "three";

// The dials split the way the physics does
//
// `ContrailAirframe` is what the aircraft is: how heavy, how wide, how clean,
// how thirsty its engines are and where they are. Lift sets the wake that
// carries the exhaust down, and drag the fuel it burns
//
// `ContrailFuel` is what it burns: how much water and heat a kilogram of it
// gives, and how many crystals its soot makes
//
// `ContrailFlight` is what it is doing, the throttle with it: a lit
// afterburner burns several times the fuel, and lays its trail with all of
// that fuel's water. `ContrailAir` is the day. Whether a
// contrail forms at all is in the air's temperature; whether it lasts is in
// its humidity over ice
//
// `ContrailLook` is how it is lit. Ice is white because it scatters every
// colour alike, so what it looks like is the sun's and the sky's light

/**
 * An engine's exhaust: a position in the frame the component sits in, in
 * metres, or a node of the model whose position is read every frame.
 */
export type ContrailEngine = readonly [number, number, number] | Object3D;

/**
 * The aircraft, in SI units.
 */
export type ContrailAirframe = {
  /** In kilograms: with the load factor, the lift its wake carries */
  massKg: number;

  /** Tip to tip, metres: the vortices trail π/4 of it apart */
  spanM: number;

  /**
   * Lift over drag at cruise, at 1 g. Thrust is the drag, so this and the
   * mass set how hard the engines work: about 18 for an airliner, 9 for a
   * fighter. Loaded, the drag polar sets the rest
   */
  liftToDrag: number;

  /**
   * Thrust-specific fuel consumption, in kilograms of fuel per newton of
   * thrust per second. Its efficiency follows from it: a modern high-bypass
   * fan at cruise burns about 15 mg/(N s), a fighter's low-bypass engine
   * about 23
   */
  fuelPerThrust: number;

  /**
   * Each engine's most thrust, sea-level static, in newtons: with full reheat
   * if it has it. It lapses with the air's pressure at altitude
   */
  maxThrustN: number;

  /**
   * Each engine's most thrust dry, at military power, sea-level static, in
   * newtons. It caps the thrust a hard pull asks for until the burner lights.
   * As much as `maxThrustN` for an engine with no reheat to light
   */
  dryThrustN: number;

  /**
   * Where each engine's exhaust leaves, in the component's frame: forward
   * is `forward`, -Z by default
   */
  engines: readonly ContrailEngine[];
};

/**
 * The fuel, per kilogram burnt.
 */
export type ContrailFuel = {
  /** Kilograms of water vapour it makes */
  waterIndex: number;

  /** The heat it gives, its lower heating value, J/kg */
  heatJPerKg: number;

  /**
   * How many ice crystals its exhaust makes: one per soot particle that
   * activates, about 10¹⁵ for today's kerosene engines. Fewer crystals share
   * the same ice, grow larger and dim the light less
   */
  iceIndex: number;
};

/**
 * Fuels, by name.
 */
export const CONTRAIL_FUEL = {
  /**
   * Jet A-1, as Schumann's CoCiP takes it: 1.23 kg of water and 43.2 MJ a
   * kilogram, and a soot-rich engine's 10¹⁵ crystals
   */
  kerosene: { waterIndex: 1.23, heatJPerKg: 43.2e6, iceIndex: 1e15 },

  /**
   * Hydrogen, burnt: 8.94 kg of water for 120 MJ, so a mixing line 2.6 times
   * as steep, and no soot, so crystals only on what the air brings in: about
   * 10¹³ a kilogram, a hundredth of kerosene's per unit of energy
   */
  hydrogen: { waterIndex: 8.94, heatJPerKg: 120e6, iceIndex: 1e13 },
} as const satisfies Record<string, ContrailFuel>;

/** A fuel's name */
export type ContrailFuelName = keyof typeof CONTRAIL_FUEL;

/**
 * What the aircraft is doing.
 */
export type ContrailFlight = {
  /** True airspeed, in metres per second */
  airspeedMPerS: number;

  /**
   * The angle between the aircraft's forward axis and the oncoming air, in
   * radians, nose up positive: the flight path is below the nose by it
   */
  angleOfAttackRad: number;

  /**
   * How far the oncoming air comes from one side, in radians, from the right
   * positive, as a `Flight` has it
   */
  sideslipRad: number;

  /** Lift over weight, in g */
  loadFactor: number;

  /**
   * How hard the engines run, as a `Flight` and the afterburner read it: 0 at
   * idle, 1 at military power, on to 1.1 at full reheat
   *
   * Dry, the engines hold the flight, their thrust the drag. Past the detent
   * the burner lights as the afterburner's does, and its thrust is what the
   * burner makes, its fuel what the burner burns
   */
  throttle: number;
};

/**
 * The day it flies on.
 */
export type ContrailAir = {
  /** Metres above sea level, through the International Standard Atmosphere */
  altitudeM: number;

  /** How much warmer the day is than the standard one, in kelvin */
  temperatureOffsetK: number;

  /**
   * Relative humidity over water, 0 to 1, as core and a `Flight` take it
   *
   * What decides a contrail is the humidity over ice, which is far higher in
   * the cold: `humidity_over_water` turns one into the other. At -55 °C, 59 %
   * over water is ice saturation, and above it a contrail persists
   */
  relativeHumidity: number;
};

/**
 * A colour: linear RGB as three numbers, or anything three's `Color` takes.
 */
export type ContrailColor =
  | readonly [number, number, number]
  | ColorRepresentation;

/**
 * How it is lit.
 */
export type ContrailLook = {
  /** Which way the sunlight travels from, in world space: towards the sun */
  sunDirection: readonly [number, number, number];

  /** The sun's colour and brightness, in the scene's light units */
  sunColor: ContrailColor;
  sunIntensity: number;

  /** The sky's light, the same from every direction */
  skyColor: ContrailColor;
  skyIntensity: number;

  /** A multiplier on the light the ice scatters */
  exposure: number;

  /**
   * How forward-scattering the crystals are, -1 to 1: about 0.77 for the
   * small columns and plates of a young contrail
   */
  anisotropy: number;
};

/**
 * A twin-engined, tailless delta fighter: the docs' one.
 * @returns A fresh airframe, safe to mutate
 */
export const default_contrail_airframe = (): ContrailAirframe => ({
  // As wing-vapor's: a heavy fighter with a combat load, measured off the
  // docs' fighter.glb
  massKg: 20_000,
  spanM: 14,
  liftToDrag: 9,

  // A low-bypass turbofan, dry, at Mach 0.85: 0.8 lb/(lbf h)
  fuelPerThrust: 22.7e-6,

  // 12 tonnes-force with reheat, 12 000 kg × 9.80665 m/s²: a heavy
  // fighter's engine, an F110's or an F100's class
  maxThrustN: 117_680,

  // And 0.6 of it dry, as Mattingly's lapse has a low-bypass engine's
  // military power: an F110-GE-129's 17 000 lbf against its 29 000 is 0.59
  dryThrustN: 70_608,

  // The model's FX_Exhaust_L and FX_Exhaust_R
  engines: [
    [-0.75, 0.05, 7],
    [0.75, 0.05, 7],
  ],
});

/**
 * Cruising level, dry.
 * @returns A fresh flight state
 */
export const default_contrail_flight = (): ContrailFlight => ({
  airspeedMPerS: 250,
  angleOfAttackRad: 0,
  sideslipRad: 0,
  loadFactor: 1,
  throttle: 1,
});

/**
 * A standard day at 11 km, the tropopause, in air just supersaturated over
 * ice: 66 % over water at -56.5 °C is 112 % over ice, so the contrail lasts.
 * @returns A fresh air state
 */
export const default_contrail_air = (): ContrailAir => ({
  altitudeM: 11_000,
  temperatureOffsetK: 0,
  relativeHumidity: 0.66,
});

/**
 * A bright day, as wing-vapor's.
 * @returns A fresh look
 */
export const default_contrail_look = (): ContrailLook => ({
  sunDirection: [0.4, 0.8, 0.3],
  sunColor: [1, 0.96, 0.9],
  sunIntensity: 3,
  skyColor: [0.55, 0.68, 0.9],
  skyIntensity: 1,
  exposure: 1,
  anisotropy: 0.77,
});

/**
 * How finely the trails are drawn.
 */
export type ContrailQuality = {
  /** Points along each trail, closer near the aircraft */
  points: number;

  /**
   * The most puffs, the plume's eddies, drawn along each trail. Fewer than
   * its turbulence asks for and each is drawn bigger, the trail lumpier
   */
  puffs: number;
};

/**
 * Qualities, by name. `high` is the default.
 */
export const CONTRAIL_QUALITY = {
  low: { points: 64, puffs: 2048 },
  medium: { points: 112, puffs: 4096 },
  high: { points: 160, puffs: 8192 },
  ultra: { points: 256, puffs: 16384 },
} as const satisfies Record<string, ContrailQuality>;

/** A quality preset's name */
export type ContrailQualityName = keyof typeof CONTRAIL_QUALITY;

/**
 * A quality by name, or over the default.
 * @param quality A preset's name, or the fields to change
 * @returns The quality
 */
export const resolve_contrail_quality = (
  quality?: ContrailQualityName | Partial<ContrailQuality>,
): ContrailQuality =>
  typeof quality === "string"
    ? { ...CONTRAIL_QUALITY[quality] }
    : { ...CONTRAIL_QUALITY.high, ...quality };
