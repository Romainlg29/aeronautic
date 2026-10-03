// The dials split four ways, the way the physics does
//
// `VaporAirframe` is what the aircraft is: its wing's planform and its body,
// in metres, in the frame the component sits in. It is fixed for a flight
//
// `VaporFlight` is what it is doing: how fast and at what angle of attack.
// Cheap to write every frame, and the reason the vapour comes and goes: lift,
// and with it every vortex and every suction peak, follows from these
//
// `VaporAir` is the day: the altitude, the temperature and the humidity. The
// vapour is all in the humidity. A pull that leaves dry air clear fills humid
// air with cloud
//
// `VaporLook` is how it is lit and photographed. Vapour is white because it
// scatters, not because it is given a colour, so what it looks like is the
// sun's and the sky's light, scattered by droplets of a given size

/**
 * The aircraft, in metres and radians.
 *
 * In the airframe's own frame: it flies along `forward` (by default -Z, as
 * three's cameras look) with `up` up, and every station is measured from the
 * component's origin, usually the model's.
 */
export type VaporAirframe = {
  // Tip to tip
  span_m: number;

  // The wing's chord where its leading and trailing edges, carried inboard,
  // meet the centreline: the theoretical root of a trapezoidal planform
  root_chord_m: number;

  // And at the tip
  tip_chord_m: number;

  // How far the leading edge is swept back
  //
  // Past about 45 degrees the flow separates off it at any useful angle of
  // attack and rolls into a vortex lying over the wing: the vapour tubes over
  // a delta or a strake. And the more swept, the later that vortex bursts
  leading_edge_sweep_rad: number;

  // Where the leading edge meets the centreline, how far aft of the origin
  // Negative is ahead of it
  apex_m: number;

  // How high the wing's mid-plane is above the origin, at the centreline
  wing_height_m: number;

  // The wing's dihedral; negative is anhedral
  dihedral_rad: number;

  // Thickness over chord: a fighter's is 4 to 6 per cent, an airliner's 10
  thickness: number;

  // How far out the wing leaves the body, from the centreline
  // The leading-edge vortex starts here, and there is no wing inboard of it
  root_span_m: number;

  // The fuselage, as a body of revolution of the same volume, for the vapour
  // cone. How far ahead of the origin the nose is, how long and how fat
  nose_m: number;
  fuselage_length_m: number;
  fuselage_radius_m: number;

  // How high the fuselage's axis is above the origin
  fuselage_height_m: number;

  // The mass, in kilograms. Only for the load factor the state reports and
  // for `angle_of_attack_for_load`: the vapour follows lift, not weight
  mass_kg: number;

  // How sharp the leading edge is, 0 to 1
  //
  // A sharp edge sheds all of its suction as a vortex, which the Polhamus
  // analogy turns into lift and the vortex's strength. A round one holds the
  // flow attached far longer and sheds little. 1 for a chined fighter or a
  // delta, about 0.5 for a round-nosed wing at high angle of attack
  leading_edge_sharpness: number;

  // The tip vortex's core just behind the wing, as a share of the span
  //
  // Near the wing the core is a few per cent of the span and holds only part
  // of the circulation, the rest still rolling up. Together these set how
  // deep its pressure well is, and so whether it fogs
  tip_core_radius: number;

  // How much of the wing's circulation that core holds, 0 to 1
  tip_core_share: number;

  // The leading-edge vortex's core, as a share of the local semispan
  // The flow over a delta is conical, so the core grows with the distance
  // from the apex and its pressure stays the same all the way along
  leading_edge_core_radius: number;
};

/**
 * What the aircraft is doing.
 */
export type VaporFlight = {
  // True airspeed, in metres per second
  airspeed_m_s: number;

  // The angle between the wing's chord plane and the oncoming air, in radians
  angle_of_attack_rad: number;
};

/**
 * The day it flies on.
 */
export type VaporAir = {
  // Metres above sea level, through the International Standard Atmosphere
  altitude_m: number;

  // How much warmer the day is than the standard one, in kelvin
  temperature_offset_k: number;

  // Relative humidity, 0 to 1
  //
  // Everything comes down to this. The cooling a wing or a vortex makes is
  // tens of kelvin at most, so at 30 % on a warm day nothing fogs, and at
  // 95 % a gentle pull trails its tips
  relative_humidity: number;
};

/**
 * How it is lit, and how it is photographed.
 */
export type VaporLook = {
  // Which way the sunlight travels from, in world space: towards the sun
  sun_direction: readonly [number, number, number];

  // The sun's colour and its brightness, in the scene's light units
  sun_color: readonly [number, number, number];
  sun_intensity: number;

  // The sky's light, the same from every direction
  sky_color: readonly [number, number, number];
  sky_intensity: number;

  // A multiplier on the light the vapour scatters
  exposure: number;

  // The droplets' effective radius, in metres
  //
  // Vapour that forms in a millisecond nucleates on everything at once and
  // makes many tiny droplets, around a micron. Smaller is denser for the same
  // water: the extinction goes as one over the radius
  droplet_radius_m: number;

  // How unevenly moist the air is, as a share of its humidity
  // What breaks a vapour sheet into patches. Zero is perfectly even air
  humidity_spread: number;

  // How large the patches of moister air are, in metres
  eddy_m: number;

  // How long the shutter is open, in seconds
  //
  // The air goes past at the airspeed, so the patches streak along the flow
  // by exactly what it travels while the shutter is open: at 300 m/s and a
  // sixtieth, five metres. The streaks are what make the vapour read as fast
  shutter_s: number;

  // How forward-scattering the droplets are, -1 to 1
  // A micron droplet throws most of the light forward: the silver of vapour
  // seen against the sun
  anisotropy: number;
};

/**
 * Which phenomena to draw. Compiled in: changing it rebuilds the material.
 */
export type VaporEffects = {
  // The tubes trailing from the wingtips, at high lift
  tip_vortices: boolean;

  // The tubes over a swept wing at high angle of attack, and their bursting
  leading_edge_vortices: boolean;

  // The sheet over the wing's upper surface in a pull, and its hard aft edge
  // where a transonic shock stands on it
  wing: boolean;

  // The bell round the whole aircraft near the speed of sound
  cone: boolean;
};

/**
 * A twin-engined, tailless delta fighter: the one in the docs.
 * @returns A fresh airframe, safe to mutate
 */
export const default_vapor_airframe = (): VaporAirframe => ({
  // Measured off the docs' fighter.glb, whose origin is its centre of gravity
  span_m: 14,
  root_chord_m: 9.2,
  tip_chord_m: 1.6,
  leading_edge_sweep_rad: (55 * Math.PI) / 180,
  apex_m: -5.66,
  wing_height_m: 0.08,
  dihedral_rad: (-3 * Math.PI) / 180,
  thickness: 0.06,
  root_span_m: 1.6,

  nose_m: 9.9,
  fuselage_length_m: 18.5,
  fuselage_radius_m: 1.4,
  fuselage_height_m: 0,

  // A heavy fighter with a combat load
  mass_kg: 20_000,

  // A chined, sharp edge
  leading_edge_sharpness: 1,

  tip_core_radius: 0.02,
  tip_core_share: 0.35,
  leading_edge_core_radius: 0.05,
});

/**
 * Fast and loaded: a 5 g pull just under the speed of sound.
 * @returns A fresh flight state
 */
export const default_vapor_flight = (): VaporFlight => ({
  airspeed_m_s: 300,
  angle_of_attack_rad: (8 * Math.PI) / 180,
});

/**
 * A humid summer day, low over the sea.
 * @returns A fresh air state
 */
export const default_vapor_air = (): VaporAir => ({
  altitude_m: 300,
  temperature_offset_k: 5,
  relative_humidity: 0.85,
});

/**
 * A bright day, filmed at thirty frames.
 * @returns A fresh look
 */
export const default_vapor_look = (): VaporLook => ({
  sun_direction: [0.4, 0.8, 0.3],
  sun_color: [1, 0.96, 0.9],
  sun_intensity: 3,
  sky_color: [0.55, 0.68, 0.9],
  sky_intensity: 1,
  exposure: 1,
  droplet_radius_m: 1e-6,
  humidity_spread: 0.06,
  eddy_m: 0.6,
  shutter_s: 1 / 60,
  anisotropy: 0.75,
});

/**
 * Every phenomenon on.
 * @returns Fresh flags
 */
export const default_vapor_effects = (): VaporEffects => ({
  tip_vortices: true,
  leading_edge_vortices: true,
  wing: true,
  cone: true,
});
