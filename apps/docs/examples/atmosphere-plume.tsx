import { Afterburner, AfterburnerBatch } from "@aeronautic/afterburner/react";
import { Flight } from "@aeronautic/core";
import { FlightProvider } from "@aeronautic/core/react";
import { type FC, useState } from "react";
import { AtmosphereStage, PLUME_EXPOSURE } from "./atmosphere";
import { Slider } from "./fighter";
import { Nozzle } from "./stage";

// One engine under takram's sky: the same plume, in the same light units as
// the sky, the sun and the camera's meter, from noon to the sun on the horizon

const ALTITUDE_M = 3000;
const SUN_DEG = 30;

/**
 * A nozzle at full reheat in the atmosphere, the sun and the altitude yours.
 * @returns The example
 */
export const AtmospherePlume: FC = () => {
  const [flight] = useState(
    () =>
      new Flight({
        altitudeM: ALTITUDE_M,
        airspeedMPerS: 0,
        throttle: 1.1,
      }),
  );
  const [sun_deg, set_sun_deg] = useState(SUN_DEG);

  return (
    <FlightProvider flight={flight}>
      <AtmosphereStage
        sunElevationDeg={sun_deg}
        camera={[-14, 3, 2]}
        target={[0, 0, 6]}
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
              label="altitude"
              min={50}
              max={15000}
              step={50}
              start={ALTITUDE_M}
              write={(f, altitude_m) => f.set({ altitudeM: altitude_m })}
            />
            <Slider
              label="throttle"
              min={0}
              max={1.1}
              step={0.01}
              start={1.1}
              write={(f, throttle) => f.set({ throttle })}
            />
          </div>
        }
      >
        {/* Context doesn't cross into the canvas: the same flight again */}
        <FlightProvider flight={flight}>
          <Nozzle />
          {/* The plume in the atmosphere's units: a 2000 K blackbody's */}
          <AfterburnerBatch
            preset="afterburner"
            profile={{ exposure: PLUME_EXPOSURE }}
          >
            <Afterburner />
          </AfterburnerBatch>
        </FlightProvider>
      </AtmosphereStage>
    </FlightProvider>
  );
};

export default AtmospherePlume;
