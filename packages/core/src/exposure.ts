// How bright the scene's numbers are
//
// The lights are worked out in photometric units: candela, lux, and
// candela per square metre on the way to the eye. The scene's own units are
// whatever its renderer's are, so one dial ties them: `exposure`, the scene's
// value for one cd/m². A camera's exposure value says the same thing: at
// EV100, the luminance that just fills the sensor is 1.2 · 2^EV100 cd/m²
// (ISO 12232's saturation-based speed, 78 / (S q) at S = 100 with a lens's
// q = 0.65, as Lagarde and de Rousiers take it), which is drawn as one

/**
 * The scene's value for 1 cd/m², at a camera's exposure value.
 * @param ev100 The exposure value at ISO 100: 15 a sunny day, 2 to 3 a
 *   floodlit night
 * @returns Scene units per cd/m²
 */
export const exposure_ev100 = (ev100: number): number => 1 / (1.2 * 2 ** ev100);
