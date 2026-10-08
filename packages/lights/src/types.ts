import type { Object3D } from "three";
import type { Lamp, LampName } from "./beam";
import { ILLUMINANT_A_K, LED_GREEN, LED_RED, type Chromaticity } from "./color";
import { exposure_ev100 } from "./exposure";
import { ANTICOLLISION_CD, type Pulse } from "./flash";
import type { NavigationSide } from "./navigation";

// The dials split the way the lights do
//
// Where each light is, and which way a beam points, is the airframe's: a
// position in the component's frame, or a node of the model, read every
// frame so a light on a moving part moves with it. What each kind of light
// gives is the rule's: the position lights' minima, the anti-collision
// lights' effective intensity and rate, a lamp's catalogue. The air between
// them and the eye is the day's, and the eye itself the look's

/**
 * Where a light is: a position in the component's frame, in metres, or a
 * node of the model, whose position is read every frame.
 */
export type LightMount = readonly [number, number, number] | Object3D;

/**
 * A position light: red on the left wingtip, green on the right, white
 * astern.
 */
export type NavigationLight = {
  side: NavigationSide;
  at: LightMount;
};

/**
 * An anti-collision light: a red beacon or a white strobe.
 */
export type AntiCollisionLight = {
  at: LightMount;

  /** Aviation red or white. Red by default */
  color?: "red" | "white";

  /** Seconds into the cycle its flash begins, to stagger lights. 0 by default */
  phaseS?: number;
};

/**
 * A landing or taxi light.
 */
export type BeamLight = {
  /**
   * Where it is. On a node, it points along the node's -Z, unless
   * `direction` says otherwise in the node's frame
   */
  at: LightMount;

  /** The lamp: `"landing"` (the default), `"taxi"`, or its numbers */
  lamp?: LampName | Lamp;

  /**
   * Which way it points, in the frame of what it is on: the component's, or
   * the node's. Forward, or the node's -Z, by default
   */
  direction?: readonly [number, number, number];

  /** Which switch it is on. The lamp's name, or `landing` for one of yours */
  switch?: "landing" | "taxi";

  /**
   * Whether it is on the landing gear, so lit only with the gear down, as a
   * gear-mounted lamp's interlock has it
   */
  onGear?: boolean;
};

/**
 * Which lights are on.
 */
export type LightsSwitches = {
  navigation: boolean;
  anticollision: boolean;
  landing: boolean;
  taxi: boolean;
};

/**
 * The position lights.
 */
export type NavigationDials = {
  /**
   * How many times the rule's minimum the lights give inside their angles.
   * A real light gives at least the minimum; 1 by default
   */
  scale: number;

  /**
   * How much of the spill the rule allows past each light's angle: 1, the
   * default, is the most it allows, 0 a light cut off sharp at its edge
   */
  spill: number;

  /** The red's and the green's chromaticity: a red LED's and a green's */
  red: Chromaticity;
  green: Chromaticity;

  /** The white's colour temperature, kelvin: a filament's, CIE illuminant A */
  whiteTemperatureK: number;
};

/**
 * The anti-collision lights.
 */
export type AntiCollisionDials = {
  /**
   * Their effective intensity in the horizontal plane, candela: the rule's
   * least, 400, by default. Above and below it falls as the rule's minima do
   */
  effectiveCd: number;

  /** Flashes a minute. The rule allows 40 to 100; 60 by default */
  flashesPerMinute: number;

  /**
   * The flash's shape. A xenon flash tube's by default: its discharge dies
   * away with a time constant of about 0.2 ms
   */
  pulse: Pulse;

  /** The red's chromaticity */
  red: Chromaticity;

  /** The white's colour temperature, kelvin: a xenon arc's, about 6000 K */
  whiteTemperatureK: number;
};

/**
 * The air between the lights and the eye.
 */
export type LightsAir = {
  /** Metres above sea level: the molecules thin with height */
  altitudeM: number;

  /**
   * The day's visibility, the meteorological range, metres: 23 km by
   * default, the clear day of the standard rural haze model. Lower, the
   * haze is thicker, a far light dimmer and redder and a beam brighter
   */
  visibilityM: number;
};

/**
 * How the lights are seen.
 */
export type LightsLook = {
  /**
   * The scene's value for one cd/m². `exposure_ev100` gives it for a
   * camera's exposure value; by default EV100 3, a floodlit night
   */
  exposure: number;

  /** The observer's age, years: glare grows with it. 25 by default */
  ageYears: number;

  /**
   * The observer's eyes: 0 very dark, 0.5 brown, the most common and the
   * default, 1 blue or green
   */
  pigmentation: number;

  /**
   * How a flash is seen: `eye`, as its effective intensity for as long as
   * the eye adds it up, or `camera`, its light over each frame, a flash
   * tube's burst in one frame
   */
  perception: "eye" | "camera";
};

/**
 * Which lights light the scene as well as being seen: as three lights, each
 * a cost on every lit material.
 */
export type LightsIlluminate = {
  /** The position lights, as point lights. Off by default */
  navigation: boolean;

  /** The anti-collision lights, as point lights, flashing */
  anticollision: boolean;

  /** The landing and taxi lights, as spot lights with their beams' shape */
  beams: boolean;
};

/**
 * Every light on, the gear's lamps with the gear down.
 * @returns Fresh switches
 */
export const default_light_switches = (): LightsSwitches => ({
  navigation: true,
  anticollision: true,
  landing: true,
  taxi: true,
});

/**
 * The rule's minima, LEDs' colours.
 * @returns Fresh dials
 */
export const default_navigation = (): NavigationDials => ({
  scale: 1,
  spill: 1,
  red: LED_RED,
  green: LED_GREEN,
  whiteTemperatureK: ILLUMINANT_A_K,
});

/**
 * The rule's least intensity, a flash a second, xenon flash tubes.
 * @returns Fresh dials
 */
export const default_anticollision = (): AntiCollisionDials => ({
  effectiveCd: ANTICOLLISION_CD,
  flashesPerMinute: 60,
  pulse: { shape: "exponential", durationS: 2e-4 },
  red: LED_RED,
  whiteTemperatureK: 6000,
});

/**
 * A clear day at sea level.
 * @returns A fresh air state
 */
export const default_lights_air = (): LightsAir => ({
  altitudeM: 0,
  visibilityM: 23_000,
});

/**
 * A floodlit night, a young eye.
 * @returns A fresh look
 */
export const default_lights_look = (): LightsLook => ({
  exposure: exposure_ev100(3),
  ageYears: 25,
  pigmentation: 0.5,
  perception: "eye",
});

/**
 * The anti-collision and beam lights light the scene; the position lights,
 * a few candela, only show.
 * @returns Fresh settings
 */
export const default_lights_illuminate = (): LightsIlluminate => ({
  navigation: false,
  anticollision: true,
  beams: true,
});

/**
 * How finely the beams' light in the air is drawn.
 */
export type LightsQuality = {
  /** Samples along each ray through a beam */
  steps: number;
};

/**
 * Qualities, by name. `high` is the default.
 */
export const LIGHTS_QUALITY = {
  low: { steps: 8 },
  medium: { steps: 16 },
  high: { steps: 24 },
  ultra: { steps: 48 },
} as const satisfies Record<string, LightsQuality>;

/** A quality preset's name */
export type LightsQualityName = keyof typeof LIGHTS_QUALITY;

/**
 * A quality by name, or over the default.
 * @param quality A preset's name, or the fields to change
 * @returns The quality
 */
export const resolve_lights_quality = (
  quality?: LightsQualityName | Partial<LightsQuality>,
): LightsQuality =>
  typeof quality === "string"
    ? { ...LIGHTS_QUALITY[quality] }
    : { ...LIGHTS_QUALITY.high, ...quality };
