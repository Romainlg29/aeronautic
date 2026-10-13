import { CLIMATES, type ClimateName, Weather } from "@aeronautic/weather";
import { Weather as WeatherProvider } from "@aeronautic/weather/react";
import { type FC, useMemo, useState } from "react";
import { AtmosphereStage } from "./atmosphere";

// The weather's clouds in takram's sky: a day of a climate, from the seed,
// lit by the atmosphere's sun and sky. Every cloud follows from the air it
// forms in, and the air is different everywhere: a field of cumulus here,
// clear air there, a deck further off

const NAMES = Object.keys(CLIMATES) as ClimateName[];

/**
 * A day's sky, the climate, the seed and the sun yours.
 * @returns The example
 */
export const WeatherExample: FC = () => {
  const [climate, set_climate] = useState<ClimateName>("fair");
  const [sun_deg, set_sun_deg] = useState(35);
  const [seed, set_seed] = useState(1);

  const weather = useMemo(() => new Weather(), []);

  return (
    <AtmosphereStage
      sunElevationDeg={sun_deg}
      sunAzimuthDeg={200}
      weather={weather}
      camera={[0, 30, 0]}
      target={[200, 60, 40]}
      fov={60}
      overlay={
        <div className="example-controls">
          <label>
            climate
            <select
              value={climate}
              onChange={(event) =>
                set_climate(event.target.value as ClimateName)
              }
            >
              {NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
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
          <button type="button" onClick={() => set_seed((s) => s + 1)}>
            Seed {seed}
          </button>
        </div>
      }
    >
      <WeatherProvider weather={weather} climate={climate} seed={seed} />
    </AtmosphereStage>
  );
};

export default WeatherExample;
