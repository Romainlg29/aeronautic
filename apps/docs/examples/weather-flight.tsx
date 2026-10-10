import { Flight } from "@aeronautic/core";
import { FlightProvider } from "@aeronautic/core/react";
import { Weather } from "@aeronautic/weather";
import {
  CloudLayer,
  Weather as WeatherProvider,
} from "@aeronautic/weather/react";
import { type FC, useMemo, useState } from "react";
import { AtmosphereStage } from "./atmosphere";
import { Fighter } from "./atmosphere-vapor";
import { Slider } from "./fighter";

// The fighter flown into a deck of stratocumulus. The weather and the flight
// are one air: in the cloud the flight's is saturated, so the wings pull
// vapour as they would, and the plumes and the vapour fade into the cloud
// round the camera with how far they are

// The deck: from 1500 m, 800 m thick, the whole sky
const BASE_M = 1500;
const DEPTH_M = 800;

// Where it starts: inside, the top a few hundred metres over
const ALTITUDE_M = 1900;
const MACH = 0.85;
const ALPHA_DEG = 10;

/**
 * The fighter in the deck, the altitude and the sun yours.
 * @returns The example
 */
export const WeatherFlight: FC = () => {
  const [flight] = useState(() => {
    const made = new Flight({
      altitudeM: ALTITUDE_M,
      relativeHumidity: 0.6,
      angleOfAttackRad: (ALPHA_DEG * Math.PI) / 180,
      pitch: ALPHA_DEG / 20,
      throttle: 1.1,
    });

    return made.set({ airspeedMPerS: MACH * made.values.soundMPerS });
  });
  const [sun_deg, set_sun_deg] = useState(30);
  const weather = useMemo(() => new Weather(), []);

  return (
    <FlightProvider flight={flight}>
      <AtmosphereStage
        sunElevationDeg={sun_deg}
        sunAzimuthDeg={200}
        weather={weather}
        camera={[-20, 6, -14]}
        target={[0, 0, 4]}
        overlay={
          <div className="example-controls">
            <Slider
              label="altitude"
              min={800}
              max={3000}
              step={10}
              start={ALTITUDE_M}
              write={(f, altitude_m) => {
                f.set({ altitudeM: altitude_m });
                f.set({ airspeedMPerS: MACH * f.values.soundMPerS });
              }}
            />
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
          </div>
        }
      >
        {/* Context doesn't cross into the canvas: the same flight again */}
        <FlightProvider flight={flight}>
          <WeatherProvider weather={weather}>
            <CloudLayer
              genus="stratocumulus"
              baseM={BASE_M}
              depthM={DEPTH_M}
              cover={1}
            />
            <Fighter />
          </WeatherProvider>
        </FlightProvider>
      </AtmosphereStage>
    </FlightProvider>
  );
};

export default WeatherFlight;
