import { type FC, type RefObject, useMemo, useRef, useState } from "react";
import {
  AtmosphereStage,
  LUMINANCE_SCALE,
  useAtmosphereLighting,
} from "./atmosphere";
import {
  ChaffControls,
  ChaffingFighter,
  type Daylight,
  type Settings,
  START_SETTINGS,
  VIEWS,
} from "./chaff-in-the-sun";
import { Aim } from "./stage";

// The fighter's flares and chaff under takram's sky. The flames are drawn in
// the atmosphere's units, the smoke and the chaff lit by the sunlight and
// skylight it works out at the aircraft, and all of it in core's volume
// pass, so the sky is drawn behind it and the airframe in front

// Three kilometres up, as the daylight example
const ALTITUDE_M = 3000;

/**
 * The fighter, in the atmosphere's light.
 * @param props The settings, the chaff held, the flares fired, and where to
 *   say what it is doing
 * @returns The model and its countermeasures, once there is light to draw
 *   them in
 */
const Fighter: FC<{
  settings: Settings;
  held: boolean;
  flares: number;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ settings, held, flares, readout }) => {
  const lighting = useAtmosphereLighting();

  // One cd/m² is the atmosphere's luminance scale on screen; the sun as an
  // irradiance and the sky as a radiance are already in its units
  const daylight = useMemo<Daylight | undefined>(() => {
    if (!lighting) return undefined;

    const [r, g, b] = lighting.sun;

    return {
      look: {
        exposure: LUMINANCE_SCALE,
        sunDirection: lighting.sunDirection,
        sunColor: lighting.sun,
        sunIntensity: 1,
        skyColor: lighting.sky,
        skyIntensity: 1,
      },
      lux: (0.2126 * r + 0.7152 * g + 0.0722 * b) / LUMINANCE_SCALE,
    };
  }, [lighting]);

  if (!daylight) return null;

  return (
    <ChaffingFighter
      settings={settings}
      held={held}
      flares={flares}
      readout={readout}
      daylight={daylight}
    />
  );
};

/**
 * The fighter's flares and chaff in the atmosphere, the sun yours.
 * @returns The example
 */
export const AtmosphereCountermeasures: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const [held, set_held] = useState(false);
  const [flares, set_flares] = useState(0);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  const { camera, target } = VIEWS[settings.view];

  // The fighter flies west, -Z, with north +X: its bearing from the nose,
  // round to the left, as an azimuth from north towards east
  const bearing = (settings.bearing_deg * Math.PI) / 180;
  const azimuth_deg =
    (Math.atan2(-Math.cos(bearing), -Math.sin(bearing)) * 180) / Math.PI;

  return (
    <AtmosphereStage
      sunElevationDeg={settings.elevation_deg}
      sunAzimuthDeg={azimuth_deg}
      altitudeM={ALTITUDE_M}
      camera={[...camera]}
      target={[...target]}
      fov={45}
      overlay={
        <>
          <ChaffControls
            settings={settings}
            change={change}
            hold={set_held}
            lowest_deg={-4}
          >
            <button
              type="button"
              onClick={() => set_flares((count) => count + 1)}
            >
              Flares
            </button>
          </ChaffControls>
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Aim camera={[...camera]} target={[...target]} />
      <Fighter
        settings={settings}
        held={held}
        flares={flares}
        readout={readout}
      />
    </AtmosphereStage>
  );
};

export default AtmosphereCountermeasures;
