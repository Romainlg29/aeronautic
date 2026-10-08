// The anti-collision lights' flashes, and how bright the eye finds them
//
// A flash shorter than a few tenths of a second looks dimmer than its peak:
// the eye adds light up over about 0.2 s. Blondel and Rey (1911) put it as
// an effective intensity, the steady light that looks as bright,
//
//   Ie = ∫ I dt / (0.2 + t₂ - t₁),
//
// over the part of the flash from t₁ to t₂ that makes it largest, which is
// where the intensity at both ends equals Ie. CS/FAR 25.1401 sets the
// anti-collision lights' minima in effective intensity, so that is what a
// light is given by. A 0.2 ms xenon flash of 400 cd effective peaks near
// 400 000 cd; drawn as that for one frame it would be sixty times too bright,
// and drawn as 400 cd for one it would be a fifth as bright as it looks. The
// eye sees a flash as Ie held for 0.2 s + (t₂ - t₁), which carries the
// flash's whole light, so that is how it is drawn

/** The Blondel–Rey constant: how long, in seconds, the eye adds light up */
export const BLONDEL_REY_S = 0.2;

/**
 * A flash's shape over time.
 *
 * `rectangular` is an LED's: on at its peak for `durationS`, then off.
 * `exponential` is a flash tube's: at its peak at once, and dying away with
 * `durationS` its time constant.
 */
export type PulseShape = "rectangular" | "exponential";

/**
 * One flash.
 */
export type Pulse = {
  shape: PulseShape;

  /** An LED's on time, or a flash tube's time constant, in seconds */
  durationS: number;
};

/**
 * A flash's intensity at a time, as a share of its peak.
 * @param pulse The flash
 * @param t_s Seconds since it began
 * @returns 0 to 1
 */
export const pulse_at = (pulse: Pulse, t_s: number): number => {
  if (t_s < 0) return 0;

  const duration = Math.max(pulse.durationS, 1e-9);

  return pulse.shape === "rectangular"
    ? t_s < duration
      ? 1
      : 0
    : Math.exp(-t_s / duration);
};

/**
 * A flash's light between two times since it began, as candela seconds
 * over its peak.
 * @param pulse The flash
 * @param from_s From
 * @param to_s To
 * @returns ∫ I dt / I_peak, seconds
 */
export const pulse_energy = (
  pulse: Pulse,
  from_s: number,
  to_s: number,
): number => {
  const duration = Math.max(pulse.durationS, 1e-9);
  const a = Math.max(from_s, 0);
  const b = Math.max(to_s, 0);

  if (b <= a) return 0;

  return pulse.shape === "rectangular"
    ? Math.max(Math.min(b, duration) - a, 0)
    : duration * (Math.exp(-a / duration) - Math.exp(-b / duration));
};

/**
 * Where the eye's integration of a flash ends, at its best: the time t₂,
 * from the flash's start, at which its intensity has fallen to Ie.
 * @param pulse The flash
 * @returns Seconds since it began
 */
export const blondel_rey_window = (pulse: Pulse): number => {
  const duration = Math.max(pulse.durationS, 1e-9);

  if (pulse.shape === "rectangular") return duration;

  // With I = e^(-t/τ) and t₂ = uτ, I(t₂) = Ie reads
  // e^(-u) (0.2 + τu + τ) = τ, solved for u by Newton's method from
  // u = ln((0.2 + τ) / τ), just below the answer
  const tau = duration;
  let u = Math.max(Math.log((BLONDEL_REY_S + tau) / tau), 1e-6);

  for (let step = 0; step < 32; step++) {
    const e = Math.exp(-u);
    const f = e * (BLONDEL_REY_S + tau * u + tau) - tau;
    const df = e * (tau - (BLONDEL_REY_S + tau * u + tau));
    const next = u - f / df;

    if (!Number.isFinite(next) || Math.abs(next - u) < 1e-12) break;

    u = Math.max(next, 0);
  }

  return u * tau;
};

/**
 * A flash's effective intensity, as a share of its peak, at its best.
 * @param pulse The flash
 * @returns Ie / I_peak
 */
export const effective_ratio = (pulse: Pulse): number => {
  const t2 = blondel_rey_window(pulse);

  return pulse_energy(pulse, 0, t2) / (BLONDEL_REY_S + t2);
};

/**
 * The peak a flash needs for an effective intensity.
 * @param pulse The flash
 * @param effective_cd Its effective intensity, candela
 * @returns Its peak, candela
 */
export const peak_intensity = (pulse: Pulse, effective_cd: number): number =>
  effective_cd / effective_ratio(pulse);

/**
 * How long the eye sees a flash as its effective intensity: 0.2 s, and the
 * part of the flash it integrates over. Ie for this long carries the
 * flash's whole light.
 * @param pulse The flash
 * @returns Seconds
 */
export const perceived_duration = (pulse: Pulse): number =>
  pulse_energy(pulse, 0, Infinity) / effective_ratio(pulse);

/**
 * How bright a flashing light is at a moment, as a share of its effective
 * intensity.
 *
 * As the eye sees it, `eye`: one while the flash's light is seen, for
 * `perceived_duration` from each flash's start. As a camera sees it,
 * `camera`: the flash's light that falls within the frame's exposure, over
 * that exposure, so a flash tube's 0.2 ms burst is one frame very bright,
 * as on film.
 * @param pulse The flash
 * @param period_s Seconds between flashes
 * @param time_s Seconds since the first flash began
 * @param perception `eye` or `camera`
 * @param exposure_s The frame's exposure, for `camera`, seconds
 * @returns A share of the effective intensity
 */
export const flash_at = (
  pulse: Pulse,
  period_s: number,
  time_s: number,
  perception: "eye" | "camera",
  exposure_s = 1 / 60,
): number => {
  const period = Math.max(period_s, 1e-3);

  if (perception === "eye") {
    const since = time_s - period * Math.floor(time_s / period);

    return since < perceived_duration(pulse) ? 1 : 0;
  }

  // The exposure ends now; every flash that began within a pulse of it
  const exposure = Math.max(exposure_s, 1e-6);
  const from = time_s - exposure;
  const ratio = effective_ratio(pulse);
  let light = 0;

  for (
    let start = period * Math.floor(from / period);
    start <= time_s;
    start += period
  ) {
    light += pulse_energy(pulse, from - start, time_s - start);
  }

  return light / exposure / ratio;
};

/**
 * The anti-collision lights' minimum effective intensities above and below
 * the horizontal plane, as a share of 400 cd (25.1401): 400 cd to 5°, 240 to
 * 10°, 80 to 20°, 40 to 30° and 20 to 75°. Joined at each band's far edge at
 * its own minimum, as the position lights' are, and held past 75°, where the
 * rule asks nothing and the airframe hides the light anyway.
 */
export const ANTICOLLISION_VERTICAL: readonly (readonly [number, number])[] = [
  [0, 1],
  [5, 1],
  [10, 0.6],
  [20, 0.2],
  [30, 0.1],
  [75, 0.05],
];

/** The anti-collision lights' least effective intensity, candela (25.1401) */
export const ANTICOLLISION_CD = 400;

/** The flashes a minute the rule allows, at least and at most (25.1401) */
export const ANTICOLLISION_RATE = [40, 100] as const;
