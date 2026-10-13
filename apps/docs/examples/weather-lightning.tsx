import { make_climate, Weather } from "@aeronautic/weather";
import {
  Lightning,
  Rain,
  Storm,
  Weather as WeatherProvider,
} from "@aeronautic/weather/react";
import { type FC, useMemo, useState } from "react";
import { AtmosphereStage } from "./atmosphere";

// A lone supercell on a summer night over the plains, seen from 20 km in the
// clear air ahead of it. By day a storm's flashes are lost in the sun's light
// on its cloud; at night they are all there is to see
//
// The tropopause stands near 11 km at mid-latitudes and 16 km in the tropics;
// over the plains at 35° in summer, between them, near 15 km (an estimate),
// so the storm is 15 km deep, and Price and Rind (1992) give such a storm
// over land about twenty flashes a minute: 3.44e-5 × 15^4.9. The fair day
// round it keeps the air between clear, its few cumulus too shallow to rain
const PLAINS_NIGHT = make_climate("fair", {
  tropopauseM: 15_000,
  latitudeDeg: 35,
});

// Night is the sun 18° under the horizon, past the last of the twilight
const NIGHT_DEG = -18;

// A low-light video camera, as far open as it goes: f/1.4, 1/30 s, ISO
// 12 800 (an estimate of a good one), EV100 = log2(N² / t) − log2(ISO / 100),
// −1.1. A meter alone would open up past it until the empty night sky was
// grey; held there, the sky stays black, the faint stars under it, and what
// the flashes light is all there is to see
const LOWEST_EV100 = Math.log2(1.4 ** 2 * 30) - Math.log2(12_800 / 100);

/**
 * A storm at night, its lightning lighting it from within.
 * @returns The example
 */
export const WeatherLightning: FC = () => {
  const [sun_deg, set_sun_deg] = useState(NIGHT_DEG);
  const [distance_km, set_distance_km] = useState(20);
  const weather = useMemo(() => new Weather(), []);

  return (
    <AtmosphereStage
      sunElevationDeg={sun_deg}
      sunAzimuthDeg={290}
      weather={weather}
      camera={[0, 30, 0]}
      target={[200, 95, 0]}
      fov={60}
      lowestEv100={LOWEST_EV100}
      overlay={
        <div className="example-controls">
          <label>
            sun {sun_deg}°
            <input
              type="range"
              min={-20}
              max={10}
              step={0.5}
              value={sun_deg}
              onChange={(event) => set_sun_deg(event.target.valueAsNumber)}
            />
          </label>
          <label>
            {distance_km} km off
            <input
              type="range"
              min={4}
              max={40}
              step={1}
              value={distance_km}
              onChange={(event) => set_distance_km(event.target.valueAsNumber)}
            />
          </label>
        </div>
      }
    >
      <WeatherProvider weather={weather} climate={PLAINS_NIGHT}>
        <Storm at={[distance_km * 1000, 0]} />
        <Rain />
        <Lightning />
      </WeatherProvider>
    </AtmosphereStage>
  );
};

export default WeatherLightning;
