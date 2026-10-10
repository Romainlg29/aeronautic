import { Weather } from "@aeronautic/weather";
import {
  CloudLayer,
  Storm,
  Weather as WeatherProvider,
} from "@aeronautic/weather/react";
import { type FC, useMemo, useState } from "react";
import { AtmosphereStage } from "./atmosphere";

// A cumulonimbus placed by hand, 25 km off, among fair-weather cumulus: its
// tower to the tropopause, its anvil spread downwind, its rain under it. The
// day is a warm, humid one, the kind storms grow in

/**
 * A storm across the plain, the sun and its size yours.
 * @returns The example
 */
export const WeatherStorm: FC = () => {
  const [sun_deg, set_sun_deg] = useState(12);
  const [diameter_km, set_diameter_km] = useState(10);
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
        </div>
      }
    >
      <WeatherProvider
        weather={weather}
        day={{ temperatureOffsetK: 12, surfaceHumidity: 0.75 }}
      >
        <CloudLayer genus="cumulus-humilis" cover={0.25} />
        <Storm at={[25_000, 5000]} diameterM={diameter_km * 1000} />
      </WeatherProvider>
    </AtmosphereStage>
  );
};

export default WeatherStorm;
