import { check_renderer } from "@aeronautic/core";
import {
  shared_context,
  useFlightStore,
  useShallowStable,
} from "@aeronautic/core/react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { CloudsNode, type CloudsOptions } from "../clouds-node";
import { cloud_layer, type CloudGenus } from "../genera";
import type {
  CloudCell,
  CloudLayer as Layer,
  WeatherDay,
  WeatherLook,
  WeatherQuality,
  WeatherQualityName,
} from "../types";
import { Weather as Core } from "../weather";

// The friendly API
//
// `<Weather>` holds the sky: its seed, its day and how it is lit, and runs its
// clock. Its layers are its children, `<CloudLayer genus="cumulus-mediocris">`
// and `<Storm at={[x, z]}>`, each added while it is mounted. `useClouds()`
// draws them for the camera: composite its node with `over` where the scene
// is graded, as `volume_pass`'s `backdropNode`, and every effect drawn in
// that pass goes over the clouds

const WeatherContext = shared_context<Core | null>("weather", null);

/**
 * The nearest `<Weather>`'s weather.
 * @returns It, or null outside one
 */
export const useWeather = (): Core | null => useContext(WeatherContext);

/**
 * Props for `<Weather>`.
 */
export type WeatherProps = {
  /** Every cloud's seed: the same seed, the same sky. By default 1 */
  seed?: number;

  /** The day the clouds form in: its warmth, its humidity, the ground */
  day?: Partial<WeatherDay>;

  /** How they are lit: the sun, the sky, the ground, the haze */
  look?: Partial<WeatherLook>;

  /**
   * How fast its clock runs against the frame's: the winds and the updrafts
   * move with it. By default 1; 0 holds the sky still
   */
  timeScale?: number;

  /**
   * Where the scene's origin is in the weather, x and z in metres. Inside a
   * `<FlightProvider>`, its altitude is the flight's
   */
  origin?: readonly [number, number];

  /** The scene's origin's altitude, metres, outside a `<FlightProvider>` */
  altitudeM?: number;

  /** The weather itself, to share one made elsewhere */
  weather?: Core;

  children?: ReactNode;
};

/**
 * The weather the clouds inside it are layers of.
 * @param props Its seed, day, look and clock
 * @returns Its children, inside it
 */
export const Weather: FC<WeatherProps> = ({
  seed = 1,
  day,
  look,
  timeScale: time_scale = 1,
  origin,
  altitudeM: altitude_m = 0,
  weather: given,
  children,
}) => {
  const made = useMemo(() => new Core(), []);
  const weather = given ?? made;
  const flight = useFlightStore();

  const stable_day = useShallowStable(day);
  const stable_look = useShallowStable(look);

  useLayoutEffect(() => {
    weather.set({ seed });
  }, [weather, seed]);

  useLayoutEffect(() => {
    if (stable_day) weather.set({ day: stable_day });
  }, [weather, stable_day]);

  useLayoutEffect(() => {
    if (stable_look) weather.set({ look: stable_look });
  }, [weather, stable_look]);

  useLayoutEffect(() => {
    if (origin) {
      weather.origin[0] = origin[0];
      weather.origin[2] = origin[1];
    }
  }, [weather, origin?.[0], origin?.[1]]);

  useFrame((_, delta) => {
    weather.origin[1] = flight?.values.altitudeM ?? altitude_m;
    weather.advance(Math.min(delta, 0.1) * time_scale);
  });

  return (
    <WeatherContext.Provider value={weather}>
      {children}
    </WeatherContext.Provider>
  );
};

/**
 * Add a layer to the nearest weather while mounted, again whenever it changes.
 * @param layer The layer
 */
const useLayer = (layer: Layer): void => {
  const weather = useWeather();

  // Compared by value: a layer written inline is a new object every render
  const key = JSON.stringify(layer);
  const held = useMemo(() => layer, [key]);

  useLayoutEffect(() => weather?.add(held), [weather, held]);
};

/**
 * Props for `<CloudLayer>`: a genus, and any field of a layer over its.
 */
export type CloudLayerProps = Partial<Layer> & {
  /** The genus it starts from. By default cumulus mediocris */
  genus?: CloudGenus;
};

/**
 * A layer of cloud in the nearest `<Weather>`: a genus, and any of its
 * fields changed.
 * @param props Its genus, and its fields
 * @returns Nothing drawn: the weather's clouds are
 */
export const CloudLayer: FC<CloudLayerProps> = ({
  genus = "cumulus-mediocris",
  ...overrides
}) => {
  useLayer(cloud_layer(genus, overrides));

  return null;
};

/**
 * Props for `<Storm>`: where it stands, and any field of its layer.
 */
export type StormProps = Partial<Layer> &
  Omit<CloudCell, "at"> & {
    /** Where it stands in the weather, x and z in metres */
    at: readonly [number, number];
  };

/**
 * A cumulonimbus where it is told: its tower to the tropopause, its anvil
 * spread downwind, its rain under it.
 * @param props Where, how wide, and any field of its layer
 * @returns Nothing drawn: the weather's clouds are
 */
export const Storm: FC<StormProps> = ({
  at,
  diameterM: diameter_m = 8000,
  topM: top_m,
  anvilDiameterM: anvil_diameter_m,
  rainMmPerH: rain,
  ...overrides
}) => {
  useLayer(
    cloud_layer("cumulonimbus", {
      cover: 0,
      ...overrides,
      cells: [
        {
          at: [at[0], at[1]],
          diameterM: diameter_m,
          topM: top_m,
          anvilDiameterM: anvil_diameter_m,
          rainMmPerH: rain,
        },
      ],
    }),
  );

  return null;
};

/**
 * Options for `useClouds`.
 */
export type UseCloudsOptions = CloudsOptions & {
  /** The weather to draw. By default the nearest `<Weather>`'s */
  weather?: Core | null;

  /** How finely: by default `"medium"` */
  quality?: WeatherQualityName | Partial<WeatherQuality>;
};

/**
 * The weather's clouds for the scene's camera: a node to composite with
 * `over(color, depth)`, as `volume_pass`'s `backdropNode` or anywhere a
 * scene's colour and depth are at hand. Made again when the camera or the
 * quality change, and disposed of after.
 * @param options The weather, and how finely
 * @returns The node, or null outside a weather
 */
export const useClouds = (
  options: UseCloudsOptions = {},
): CloudsNode | null => {
  const provided = useWeather();
  const weather = options.weather === undefined ? provided : options.weather;
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const quality = useShallowStable(options.quality);

  useLayoutEffect(() => check_renderer(gl, "useClouds"), [gl]);

  const [node, set_node] = useState<CloudsNode | null>(null);

  useLayoutEffect(() => {
    if (!weather) {
      set_node(null);

      return;
    }

    const made = new CloudsNode(weather, camera, { quality });

    set_node(made);

    return () => made.dispose();
  }, [weather, camera, quality]);

  return node;
};

export type { CloudsNode };
