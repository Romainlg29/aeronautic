import { exposure_ev100 } from "@aeronautic/core";
import type { Object3D } from "three";
import type { Flare, FlareName } from "./flare";

// The dials split the way the physics does
//
// `CountermeasuresAirframe` is where the dispensers are and which way they
// throw. The flare is its make: its grain, its composition and its
// cartridge. `CountermeasuresFlight` is how the aircraft moves through the
// air when one leaves, which the flare starts from; the air is the day the
// flares burn in, thin or thick, clear or hazy. The look is the eye: the
// exposure and whose glare

/**
 * Where a dispenser is: a position in the component's frame, in metres, or
 * a node of the model, whose position is read every frame.
 */
export type DispenserMount = readonly [number, number, number] | Object3D;

/**
 * One dispenser.
 */
export type Dispenser = {
  /** Where its flares leave */
  at: DispenserMount;

  /**
   * Which way it throws them: in the component's frame for a position, in
   * the node's for a node. Down by default
   */
  direction?: readonly [number, number, number];
};

/**
 * Where the dispensers are.
 */
export type CountermeasuresAirframe = {
  dispensers: readonly Dispenser[];
};

/**
 * How the aircraft moves through the air.
 */
export type CountermeasuresFlight = {
  /** True airspeed, m/s */
  airspeedMPerS: number;

  /**
   * The angle between the aircraft's forward axis and the oncoming air,
   * radians, nose up positive
   */
  angleOfAttackRad: number;

  /** How far the oncoming air comes from one side, radians, from the right */
  sideslipRad: number;
};

/**
 * The day.
 */
export type CountermeasuresAir = {
  /** Metres above sea level, through the International Standard Atmosphere */
  altitudeM: number;

  /** The meteorological range, metres: how far a black target is seen */
  visibilityM: number;

  /**
   * The air's turbulence, its dissipation rate ε, m²/s³: how fast it
   * spreads the smoke
   */
  turbulenceM2PerS3: number;
};

/**
 * How the flares are seen.
 */
export type CountermeasuresLook = {
  /**
   * The scene's value for 1 cd/m². `exposure_ev100` gives it from a camera's
   * exposure value
   */
  exposure: number;

  /** The observer's age, years: older eyes scatter more */
  ageYears: number;

  /** The observer's pigmentation: 0 very dark eyes, 0.5 brown, 1 blue */
  pigmentation: number;

  /**
   * Which way the sunlight comes from, in world space: towards the sun. It
   * and the sky light the smoke, as they do contrails'
   */
  sunDirection: readonly [number, number, number];

  /** The sun's colour, linear, and brightness, in the scene's light units */
  sunColor: readonly [number, number, number];
  sunIntensity: number;

  /** The sky's light, the same from every direction, as the sun's */
  skyColor: readonly [number, number, number];
  skyIntensity: number;
};

/**
 * The docs' fighter's two dispensers, measured off its model: where the
 * lower aft body turns up to its sides, ahead of the nozzles, throwing down.
 * @returns A fresh airframe
 */
export const default_countermeasures_airframe =
  (): CountermeasuresAirframe => ({
    dispensers: [
      { at: [-1, -0.57, 5], direction: [0, -1, 0] },
      { at: [1, -0.57, 5], direction: [0, -1, 0] },
    ],
  });

/**
 * Cruising at low level.
 * @returns A fresh flight
 */
export const default_countermeasures_flight = (): CountermeasuresFlight => ({
  airspeedMPerS: 250,
  angleOfAttackRad: 0,
  sideslipRad: 0,
});

/**
 * A clear day, a few thousand feet up: the 23 km of the clear sky's
 * standard visibility, and the turbulence of the top of the mixed layer,
 * 10⁻³ m²/s³: the free troposphere's is nearer 10⁻⁴, a convective
 * afternoon's near the ground 10⁻². An estimate of a typical day.
 * @returns A fresh air
 */
export const default_countermeasures_air = (): CountermeasuresAir => ({
  altitudeM: 1_000,
  visibilityM: 23_000,
  turbulenceM2PerS3: 1e-3,
});

/**
 * Dusk, EV 8, where a flare's glare and the sky both show, seen by a young
 * brown-eyed observer. No sun or sky lights the smoke: only the flares,
 * as at night. Contrails' daylight is a sun of 3 and a sky of 1.
 * @returns A fresh look
 */
export const default_countermeasures_look = (): CountermeasuresLook => ({
  exposure: exposure_ev100(8),
  ageYears: 25,
  pigmentation: 0.5,
  sunDirection: [0.4, 0.8, 0.3],
  sunColor: [1, 0.96, 0.9],
  sunIntensity: 0,
  skyColor: [0.55, 0.68, 0.9],
  skyIntensity: 0,
});

/**
 * A flare by name, or as given.
 * @param flare The name, or the fields over the MJU-7's
 * @param flares The makes by name
 * @returns The make
 */
export const resolve_flare = (
  flare: FlareName | Partial<Flare> | undefined,
  flares: Record<FlareName, Flare>,
): Flare =>
  typeof flare === "string" ? flares[flare] : { ...flares.mju7, ...flare };

/**
 * How many flares are drawn, and how many light the scene.
 */
export type CountermeasuresQuality = {
  /** The most burning at once; past it the oldest goes first */
  flares: number;

  /**
   * How many of the brightest light the scene, with three's point lights.
   * Each costs every lit pixel of the scene a light
   */
  lights: number;
};

/**
 * Qualities, by name. `high` is the default.
 */
export const COUNTERMEASURES_QUALITY = {
  low: { flares: 16, lights: 0 },
  medium: { flares: 32, lights: 1 },
  high: { flares: 64, lights: 2 },
  ultra: { flares: 128, lights: 4 },
} as const satisfies Record<string, CountermeasuresQuality>;

/** A quality preset's name */
export type CountermeasuresQualityName = keyof typeof COUNTERMEASURES_QUALITY;

/**
 * A quality by name, or over the default.
 * @param quality A preset's name, or the fields to change
 * @returns The quality
 */
export const resolve_countermeasures_quality = (
  quality?: CountermeasuresQualityName | Partial<CountermeasuresQuality>,
): CountermeasuresQuality =>
  typeof quality === "string"
    ? { ...COUNTERMEASURES_QUALITY[quality] }
    : { ...COUNTERMEASURES_QUALITY.high, ...quality };
