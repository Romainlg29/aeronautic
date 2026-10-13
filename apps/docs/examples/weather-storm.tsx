import { Weather } from "@aeronautic/weather";
import {
  Lightning,
  Rain,
  Storm,
  Weather as WeatherProvider,
} from "@aeronautic/weather/react";
import { type FC, useMemo, useState } from "react";
import { AtmosphereStage } from "./atmosphere";

// A cumulonimbus placed by hand, 25 km off, on an unsettled day: its tower to
// the tropopause, its anvil spread downwind, its rain under it, its
// lightning. Move it over the camera, and its rain falls round you

/**
 * A storm across the plain, the sun, its size and where it stands yours.
 * @returns The example
 */
export const WeatherStorm: FC = () => {
  const [sun_deg, set_sun_deg] = useState(12);
  const [diameter_km, set_diameter_km] = useState(10);
  const [distance_km, set_distance_km] = useState(25);
  const weather = useMemo(() => new Weather(), []);

  return (
    <AtmosphereStage
      sunElevationDeg={sun_deg}
      sunAzimuthDeg={250}
      weather={weather}
      camera={[0, 30, 0]}
      target={[200, 80, 40]}
      fov={60}
      overlay={
        <div className="example-controls">
          <label>
            sun {sun_deg}°
            <input
              type="range"
              min={-2}
              max={60}
              step={0.5}
              value={sun_deg}
              onChange={(event) => set_sun_deg(event.target.valueAsNumber)}
            />
          </label>
          <label>
            storm {diameter_km} km
            <input
              type="range"
              min={4}
              max={20}
              step={1}
              value={diameter_km}
              onChange={(event) => set_diameter_km(event.target.valueAsNumber)}
            />
          </label>
          <label>
            {distance_km} km off
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={distance_km}
              onChange={(event) => set_distance_km(event.target.valueAsNumber)}
            />
          </label>
        </div>
      }
    >
      <WeatherProvider weather={weather} climate="unsettled">
        <Storm
          at={[distance_km * 1000, distance_km * 200]}
          diameterM={diameter_km * 1000}
        />
        <Rain />
        <Lightning />
      </WeatherProvider>
    </AtmosphereStage>
  );
};

export default WeatherStorm;
