// The glare round a light: the eye's own scatter
//
// A point of light is not seen as a point. The eye's media scatter some of
// it, and the further from the light, the less: the CIE's general disability
// glare equation (CIE 146:2002, from Vos and van den Berg) gives how much,
// as the luminance a veil at an angle θ from the light adds per lux the
// light casts at the eye,
//
//   L / E = 10/θ³ + (5/θ² + 0.1 p/θ) (1 + (A/62.5)⁴) + 0.0025 p   (sr⁻¹),
//
// for θ in degrees from 0.1° to 100°, A the observer's age and p their
// eyes' pigmentation. What it does not scatter stays within 0.1° of the
// light, and is drawn there, a disc as bright as it must be to carry it.
// That is the glare a light really has, from its real illuminance at the
// eye: a light of a few candela is a speck, a landing light head on is a
// veil over the whole view

/** The equation's smallest angle, degrees: inside it, the light's own disc */
export const GLARE_MIN_DEG = 0.1;

/** Its largest */
export const GLARE_MAX_DEG = 100;

/**
 * The eye the glare is for.
 */
export type Observer = {
  /** In years. Glare grows with age, as the lens yellows and clouds */
  ageYears: number;

  /**
   * The eyes' pigmentation: 0 for very dark eyes, 0.5 for brown, 1 for blue
   * or green. Lighter eyes let more light through the iris and the wall of
   * the eye, which scatters it widely
   */
  pigmentation: number;
};

/**
 * The CIE 146 general disability glare equation.
 * @param theta_deg The angle from the light, degrees, clamped to 0.1 to 100
 * @param observer The eye
 * @returns The veil's luminance per lux at the eye, cd/m² per lx = sr⁻¹
 */
export const glare_psf = (theta_deg: number, observer: Observer): number => {
  const theta = Math.min(Math.max(theta_deg, GLARE_MIN_DEG), GLARE_MAX_DEG);
  const age = 1 + (observer.ageYears / 62.5) ** 4;
  const p = observer.pigmentation;

  return (
    10 / theta ** 3 + (5 / theta ** 2 + (0.1 * p) / theta) * age + 0.0025 * p
  );
};

/**
 * How much of the light the eye scatters beyond 0.1°: the equation over the
 * sphere's band from 0.1° to 100°.
 * @param observer The eye
 * @returns A share of the light, 0 to 1
 */
export const glare_scattered = (observer: Observer): number => {
  // Evenly in ln θ, where the equation is smooth
  const steps = 2048;
  const low = Math.log(GLARE_MIN_DEG);
  const high = Math.log(GLARE_MAX_DEG);
  let sum = 0;

  for (let step = 0; step < steps; step++) {
    const theta_deg = Math.exp(low + ((step + 0.5) * (high - low)) / steps);
    const theta = (theta_deg * Math.PI) / 180;

    // dΩ = 2π sin θ dθ, and dθ = θ d(ln θ)
    sum +=
      glare_psf(theta_deg, observer) *
      2 *
      Math.PI *
      Math.sin(theta) *
      theta *
      ((high - low) / steps);
  }

  return Math.min(sum, 1);
};

/**
 * The luminance of the light's own disc, per lux at the eye: what is not
 * scattered, spread over a disc of 0.1°, or over the pixel if that is wider.
 * @param observer The eye
 * @param radius_deg The disc's angular radius: 0.1°, or a pixel's
 * @returns cd/m² per lx
 */
export const glare_core = (observer: Observer, radius_deg = GLARE_MIN_DEG) => {
  const radius = (Math.max(radius_deg, GLARE_MIN_DEG) * Math.PI) / 180;
  const solid_angle = 2 * Math.PI * (1 - Math.cos(radius));

  return (1 - glare_scattered(observer)) / solid_angle;
};

/**
 * How far from a light its glare is worth drawing: where the veil it adds
 * falls below a luminance.
 * @param illuminance_lx The light at the eye, lux
 * @param floor The faintest luminance worth drawing, cd/m²
 * @param observer The eye
 * @returns Degrees, 0.1 to 100
 */
export const glare_radius = (
  illuminance_lx: number,
  floor: number,
  observer: Observer,
): number => {
  if (illuminance_lx <= 0) return GLARE_MIN_DEG;

  const target = floor / illuminance_lx;

  if (glare_psf(GLARE_MAX_DEG, observer) >= target) return GLARE_MAX_DEG;
  if (glare_psf(GLARE_MIN_DEG, observer) <= target) return GLARE_MIN_DEG;

  // The equation only falls with θ: bisect in ln θ
  let low = Math.log(GLARE_MIN_DEG);
  let high = Math.log(GLARE_MAX_DEG);

  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;

    if (glare_psf(Math.exp(middle), observer) > target) low = middle;
    else high = middle;
  }

  return Math.exp(high);
};
