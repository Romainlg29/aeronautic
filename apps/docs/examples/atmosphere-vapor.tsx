import { AfterburnerBatch } from "@aeronautic/afterburner/react";
import { Flight } from "@aeronautic/core";
import { FlightProvider, useFlightFrame } from "@aeronautic/core/react";
import { ControlSurfaces } from "@aeronautic/controls/react";
import type { VaporLook } from "@aeronautic/wing-vapor";
import { WingVapor } from "@aeronautic/wing-vapor/react";
import { type FC, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import {
  AtmosphereStage,
  PLUME_EXPOSURE,
  useAtmosphereLighting,
} from "./atmosphere";
import { airframe_only, Exhaust, Slider, useFighter } from "./fighter";

// The fighter pulling through humid air under takram's sky. The vapour is
// lit by the sunlight and the skylight the atmosphere works out where the
// aircraft is, so it reddens and dims with the sun as the sky does

/**
 * The fighter, pitched up by its angle of attack so it flies level, with its
 * plumes and its vapour in the atmosphere's light.
 * @returns The model and its effects
 */
const Fighter: FC = () => {
  const { scene, animations } = useFighter();
  const body = useRef<Group>(null);
  const lighting = useAtmosphereLighting();

  useFlightFrame((flight) => {
    if (body.current) body.current.rotation.x = flight.angleOfAttackRad;
  });

  // The sun as an irradiance and the sky as a radiance, as the vapour takes
  // them, both already in the atmosphere's units
  const look = useMemo<Partial<VaporLook> | undefined>(
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

  return (
    <group ref={body}>
      <primitive object={scene} />
      <AfterburnerBatch
        preset="afterburner"
        profile={{ exposure: PLUME_EXPOSURE }}
      >
        <ControlSurfaces
          object={scene}
          animations={animations}
          exhaust={<Exhaust />}
        />
      </AfterburnerBatch>
      {/* Not drawn until there is light to draw it in */}
      {look && (
        <WingVapor
          capture={scene}
          captureFilter={airframe_only}
          look={look}
          forward={[0, 0, -1]}
        />
      )}
    </group>
  );
};

// Where it starts: low over the sea on a humid summer day, pulling hard
const ALTITUDE_M = 300;
const MACH = 0.85;
const ALPHA_DEG = 12;
const SUN_DEG = 20;

/**
 * The fighter in the atmosphere, the sun, the humidity and the altitude yours.
 * @returns The example
 */
export const AtmosphereVapor: FC = () => {
  const [flight] = useState(() => {
    const made = new Flight({
      altitudeM: ALTITUDE_M,
      temperatureOffsetK: 10,
      relativeHumidity: 0.9,
      angleOfAttackRad: (ALPHA_DEG * Math.PI) / 180,
      pitch: ALPHA_DEG / 20,
      throttle: 1.1,
    });

    return made.set({ airspeedMPerS: MACH * made.values.soundMPerS });
  });
  const [sun_deg, set_sun_deg] = useState(SUN_DEG);

  return (
    <FlightProvider flight={flight}>
      <AtmosphereStage
        sunElevationDeg={sun_deg}
        camera={[-20, 6, -14]}
        target={[0, 0, 4]}
        overlay={
          <div className="example-controls">
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
            <Slider
              label="humidity"
              min={0.5}
              max={1}
              step={0.01}
              start={0.9}
              write={(f, relative_humidity) =>
                f.set({ relativeHumidity: relative_humidity })
              }
            />
            <Slider
              label="altitude"
              min={50}
              max={12000}
              step={50}
              start={ALTITUDE_M}
              write={(f, altitude_m) => {
                f.set({ altitudeM: altitude_m });
                f.set({ airspeedMPerS: MACH * f.values.soundMPerS });
              }}
            />
          </div>
        }
      >
        {/* Context doesn't cross into the canvas: the same flight again */}
        <FlightProvider flight={flight}>
          <Fighter />
        </FlightProvider>
      </AtmosphereStage>
    </FlightProvider>
  );
};

export default AtmosphereVapor;
