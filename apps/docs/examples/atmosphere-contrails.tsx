import type { ContrailLook } from "@aeronautic/contrails";
import { type FC, type RefObject, useMemo, useRef, useState } from "react";
import { AtmosphereStage, useAtmosphereLighting } from "./atmosphere";
import {
  ContrailsControls,
  ContrailsFighter,
  type Settings,
  START_SETTINGS,
} from "./contrails";

// The fighter's contrails under takram's sky. The ice is lit by the sunlight
// and the skylight the atmosphere works out at the aircraft's altitude, so
// the trails redden and dim with the sun as the sky does

// Low enough to colour the light, high enough to light the trails: the sun
// round the horizon where the stage's own sun is, ahead of the camera and to
// its left, so the crystals scatter it forwards
const SUN_DEG = 20;
const SUN_AZIMUTH_DEG = 135;

/**
 * The fighter and its trails, in the atmosphere's light.
 * @param props The settings, and where to say what the trails are doing
 * @returns The model and its trails, once there is light to draw them in
 */
const Fighter: FC<{
  settings: Settings;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ settings, readout }) => {
  const lighting = useAtmosphereLighting();

  // The sun as an irradiance and the sky as a radiance, as the trails take
  // them, both already in the atmosphere's units
  const look = useMemo<Partial<ContrailLook> | undefined>(
    () =>
      lighting
        ? {
            sunDirection: lighting.sunDirection,
            sunColor: lighting.sun,
            sunIntensity: 1,
            skyColor: lighting.sky,
            skyIntensity: 1,
          }
        : undefined,
    [lighting],
  );

  if (!look) return null;

  return <ContrailsFighter settings={settings} readout={readout} look={look} />;
};

/**
 * The fighter's contrails in the atmosphere, the sun and the day yours.
 * @returns The example
 */
export const AtmosphereContrails: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const [sun_deg, set_sun_deg] = useState(SUN_DEG);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  return (
    <AtmosphereStage
      sunElevationDeg={sun_deg}
      sunAzimuthDeg={SUN_AZIMUTH_DEG}
      // The sky is the one at the altitude the trails are flown at
      altitudeM={settings.altitude_m}
      camera={[44, 6, -76]}
      target={[0, -2, 34]}
      fov={16}
      overlay={
        <>
          <ContrailsControls settings={settings} change={change}>
            <label>
              sun {sun_deg}°
              <input
                type="range"
                min={-2}
                max={90}
                step={0.5}
                value={sun_deg}
                onChange={(event) => set_sun_deg(event.target.valueAsNumber)}
              />
            </label>
          </ContrailsControls>
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Fighter settings={settings} readout={readout} />
    </AtmosphereStage>
  );
};

export default AtmosphereContrails;
