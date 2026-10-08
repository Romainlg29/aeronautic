// The throttle's travel, and how much reheat it lights
//
// A flight's throttle runs from 0 at idle to 1 at military power, the most
// the dry engine makes; past that detent is reheat, full at the end of the
// travel. The afterburner draws the burner from it and the contrails burn
// its fuel, so both read it through these: one burner, lit the same

// The end of the throttle's travel: full reheat
export const THROTTLE_MAX = 1.1;

// Where a jet's burner lights: at the detent, military power
export const REHEAT_DETENT = 1;

// How much reheat lights as the throttle passes the detent
// A burner does not creep in: its first zone lights with a thump, and the rest
// stage in behind it as the throttle goes on to the stop
export const REHEAT_FIRST_ZONE = 0.35;

// Over how much throttle that first zone lights: a few slider steps, so it
// fades in rather than popping
export const REHEAT_LIGHT_OFF = 0.03;

/**
 * Hermite between two edges, as GLSL and WGSL do it.
 * @param low Where it starts climbing
 * @param high Where it reaches one
 * @param value The value
 * @returns 0 to 1
 */
const smoothstep = (low: number, high: number, value: number): number => {
  const t = Math.min(Math.max((value - low) / (high - low), 0), 1);

  return t * t * (3 - 2 * t);
};

/**
 * Hold a throttle inside its travel, reading anything else as idle.
 * @param throttle The throttle
 * @returns 0 to `THROTTLE_MAX`
 */
export const clamp_throttle = (throttle: number): number =>
  Number.isFinite(throttle) ? Math.min(Math.max(throttle, 0), THROTTLE_MAX) : 0;

/**
 * How much of the burner is lit at one throttle setting.
 *
 * Below the detent there is no reheat, only the dry engine. Past it the first
 * zone lights within `REHEAT_LIGHT_OFF` and the rest stage in up to the stop.
 * A detent at zero or less is an engine with no burner to light, a rocket,
 * which is always lit.
 * @param throttle How hard the engine is running, 0 to 1.1
 * @param detent Where the burner lights, `REHEAT_DETENT` for a jet
 * @returns Zero on dry thrust, one at full reheat
 */
export const reheat_share = (
  throttle: number,
  detent = REHEAT_DETENT,
): number => {
  if (detent <= 0) {
    return 1;
  }

  const lit = smoothstep(detent, detent + REHEAT_LIGHT_OFF, throttle);

  const staged = smoothstep(
    detent,
    Math.max(detent + REHEAT_LIGHT_OFF, THROTTLE_MAX),
    throttle,
  );

  return lit * (REHEAT_FIRST_ZONE + (1 - REHEAT_FIRST_ZONE) * staged);
};
