import {
  CLOUD_GENERA,
  cloud_layer,
  type CloudGenus,
  Weather,
} from "@aeronautic/weather";
import { CloudLayer, Weather as WeatherProvider } from "@aeronautic/weather/react";
import { type FC, useMemo, useState } from "react";
import { AtmosphereStage } from "./atmosphere";

// The weather's clouds in takram's sky: one layer of a genus, from the seed,
// lit by the atmosphere's sun and sky. Everything about a genus is its
// presets': its base at the day's condensation level or its usual height,
// its sizes, its water

/**
 * A layer of cloud over the ground, the genus, the cover and the sun yours.
 * @returns The example
 */
export const WeatherExample: FC = () => {
  const [genus, set_genus] = useState<CloudGenus>("cumulus-mediocris");
  const [cover, set_cover] = useState(cloud_layer("cumulus-mediocris").cover);
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
            genus
            <select
              value={genus}
              onChange={(event) => {
                const next = event.target.value as CloudGenus;

                set_genus(next);
                set_cover(cloud_layer(next).cover);
              }}
            >
              {CLOUD_GENERA.map((name) => (
                <option key={name} value={name}>
                  {name.replace("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            cover {Math.round(cover * 100)} %
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cover}
              onChange={(event) => set_cover(event.target.valueAsNumber)}
            />
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
      <WeatherProvider weather={weather} seed={seed}>
        <CloudLayer genus={genus} cover={cover} />
      </WeatherProvider>
    </AtmosphereStage>
  );
};

export default WeatherExample;
