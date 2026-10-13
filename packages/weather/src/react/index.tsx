import { check_renderer } from "@aeronautic/core";
import {
  shared_context,
  useFlightStore,
  useShallowStable,
  useVolumePass,
} from "@aeronautic/core/react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type RefObject,
} from "react";
import { Vector2, Vector3, type Object3D } from "three";
import { Bolts } from "../bolts";
import type { Climate, ClimateName } from "../climate";
import { CloudsNode, type CloudsOptions } from "../clouds-node";
import type { Flash, Thunder } from "../lightning";
import {
  front,
  patch,
  storm,
  type FrontOptions,
  type PatchOptions,
  type StormOptions,
  type WeatherPlugin as Plugin,
} from "../plugin";
import { RainStreaks } from "../rain";
import type { WeatherLook, WeatherQuality, WeatherQualityName } from "../types";
import { Weather as Core } from "../weather";

// The friendly API
//
// `<Weather>` holds the sky: its climate, its seed and how it is lit, and
// runs its clock. What it is made of past its climate are its children,
// plugins each added while mounted: `<Storm at={[x, z]}>`, `<Front
// kind="warm">`, `<Patch>`, or any plugin of your own through
// `<WeatherPlugin plugin={...}>`. `useClouds()` draws the clouds for the
// camera: composite its node with `over` where the scene is graded, as
// `volume_pass`'s `backdropNode`, and every effect drawn in that pass goes
// over the clouds and fades into the cloud round the camera. `<Rain>` and
// `<Lightning>` draw the rain's streaks round the camera and the flashes'
// channels. Inside a `<FlightProvider>`, the flight flies through the same
// weather: its air saturated in cloud, so its vapour and its contrails form
// as they would

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

  /**
   * The climate the sky is drawn from: a name, `"fair"` by default, or one of
   * your own, as `make_climate` makes it
   */
  climate?: ClimateName | Climate;

  /** How it is lit: the sun, the sky, the ground, the haze */
  look?: Partial<WeatherLook>;

  /**
   * How fast its clock runs against the frame's: the winds, the storms and
   * the lightning move with it. By default 1; 0 holds the sky still
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

  /**
   * Whether the `<FlightProvider>`'s flight flies through the weather: the
   * climate's warmth made the flight's, and its relative humidity 1 while it
   * is in cloud, where the air is saturated, its own again out of it. By
   * default true
   */
  couple?: boolean;

  /**
   * Where the aircraft is in the scene, for the flight's air: by default the
   * scene's origin, where the weather puts the flight's altitude
   */
  aircraft?: RefObject<Object3D | null>;

  children?: ReactNode;
};

const scratch_position = new Vector3();

/**
 * The weather the plugins inside it add to.
 * @param props Its climate, seed, look and clock
 * @returns Its children, inside it
 */
export const Weather: FC<WeatherProps> = ({
  seed = 1,
  climate = "fair",
  look,
  timeScale: time_scale = 1,
  origin,
  altitudeM: altitude_m = 0,
  weather: given,
  couple = true,
  aircraft,
  children,
}) => {
  const made = useMemo(() => new Core(), []);
  const weather = given ?? made;
  const flight = useFlightStore();

  // The flight's own humidity, kept while the cloud's is written over it
  const own_humidity = useRef<number | null>(null);

  // Compared by value: a climate written inline is a new object every render
  const climate_key =
    typeof climate === "string" ? climate : JSON.stringify(climate);
  const stable_climate = useMemo(() => climate, [climate_key]);
  const stable_look = useShallowStable(look);

  useLayoutEffect(() => {
    weather.set({ seed, climate: stable_climate });
  }, [weather, seed, stable_climate]);

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

    if (!flight || !couple) return;

    const at = aircraft?.current?.getWorldPosition(scratch_position);
    const air = weather.sample(at?.x ?? 0, at?.y ?? 0, at?.z ?? 0);

    if (air.inCloud) {
      own_humidity.current ??= flight.values.relativeHumidity;
    }

    const humidity = air.inCloud ? 1 : own_humidity.current;

    if (!air.inCloud) own_humidity.current = null;

    flight.set({
      temperatureOffsetK: weather.climate.temperatureOffsetK,
      relativeHumidity: humidity ?? undefined,
    });
  });

  // Its own humidity back when it stops flying through the weather
  useLayoutEffect(
    () => () => {
      if (flight && own_humidity.current !== null) {
        flight.set({ relativeHumidity: own_humidity.current });
        own_humidity.current = null;
      }
    },
    [flight, couple],
  );

  return (
    <WeatherContext.Provider value={weather}>
      {children}
    </WeatherContext.Provider>
  );
};

/**
 * Add a plugin to the nearest weather while mounted.
 * @param plugin The plugin, or null for none
 */
export const usePlugin = (plugin: Plugin | null): void => {
  const weather = useWeather();

  useLayoutEffect(
    () => (weather && plugin ? weather.use(plugin) : undefined),
    [weather, plugin],
  );
};

/**
 * A plugin made from options, again whenever they change by value.
 * @param make What makes it
 * @param options Its options
 */
const useMadePlugin = <T,>(make: (options: T) => Plugin, options: T): void => {
  const key = JSON.stringify(options);
  const plugin = useMemo(() => make(options), [make, key]);

  usePlugin(plugin);
};

/**
 * Props for `<WeatherPlugin>`.
 */
export type WeatherPluginProps = {
  /** The plugin: keep it the same object, or it is added again */
  plugin: Plugin;
};

/**
 * Any plugin, in the nearest `<Weather>` while mounted.
 * @param props The plugin
 * @returns Nothing drawn: the weather's clouds are
 */
export const WeatherPlugin: FC<WeatherPluginProps> = ({ plugin }) => {
  usePlugin(plugin);

  return null;
};

/** Props for `<Storm>`: where it stands, and how large */
export type StormProps = StormOptions;

/**
 * A cumulonimbus where it is told: its tower to the tropopause, its anvil
 * spread downwind, its rain under it, its lightning.
 * @param props Where, and how large
 * @returns Nothing drawn: the weather's clouds are
 */
export const Storm: FC<StormProps> = (props) => {
  useMadePlugin(storm, props);

  return null;
};

/** Props for `<Front>`: which, where and how fast */
export type FrontProps = FrontOptions;

/**
 * A front, moving through the weather.
 * @param props Which, where and how fast
 * @returns Nothing drawn: the weather's clouds are
 */
export const Front: FC<FrontProps> = (props) => {
  useMadePlugin(front, props);

  return null;
};

/** Props for `<Patch>`: where, how large, what */
export type PatchProps = PatchOptions;

/**
 * A patch of different air: moister, drier, warmer, lifted.
 * @param props Where, how large, and what
 * @returns Nothing drawn: the weather's clouds are
 */
export const Patch: FC<PatchProps> = (props) => {
  useMadePlugin(patch, props);

  return null;
};

/**
 * Where an effect's mesh goes: the volume pass's scene, or the canvas's.
 * @param object The mesh
 */
const useEffectMesh = (object: Object3D | null): void => {
  const pass = useVolumePass();
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    if (!object) return;

    const parent = pass?.scene ?? scene;

    parent.add(object);

    return () => {
      parent.remove(object);
    };
  }, [object, pass, scene]);
};

const scratch_size = new Vector2();

/**
 * The height of the target an effect is drawn into: the volume pass's, at
 * its reduced resolution, or the canvas's. A line a pixel of the canvas wide
 * is half a texel in a pass at half of it, and misses every texel's centre.
 * @returns A function of the renderer, the height in pixels
 */
const useTargetHeight = () => {
  const pass = useVolumePass();

  return (gl: { getDrawingBufferSize: (size: Vector2) => Vector2 }) =>
    gl.getDrawingBufferSize(scratch_size).y *
    (pass?.volumePass.getResolutionScale() ?? 1);
};

/**
 * Props for `<Rain>`.
 */
export type RainProps = {
  /** The weather whose rain it draws. By default the nearest `<Weather>`'s */
  weather?: Core | null;
};

/**
 * The rain's streaks round the camera, where it is raining there: drawn in
 * the `<VolumePassContext>`'s pass if there is one, else in the scene.
 * @param props The weather
 * @returns Nothing: its mesh is added where the effects are drawn
 */
export const Rain: FC<RainProps> = ({ weather: given }) => {
  const provided = useWeather();
  const weather = given === undefined ? provided : given;
  const [rain, set_rain] = useState<RainStreaks | null>(null);

  useLayoutEffect(() => {
    if (!weather) return;

    const made = new RainStreaks(weather);

    set_rain(made);

    return () => {
      set_rain(null);
      made.dispose();
    };
  }, [weather]);

  useEffectMesh(rain);

  const target_height = useTargetHeight();

  useFrame(({ camera, gl }, delta) => {
    rain?.update(camera, delta, target_height(gl));
  });

  return null;
};

/**
 * Props for `<Lightning>`.
 */
export type LightningProps = {
  /** The weather whose lightning it draws. By default the nearest `<Weather>`'s */
  weather?: Core | null;

  /** Called as each flash strikes */
  onFlash?: (flash: Flash) => void;

  /**
   * Called as each flash's thunder reaches the camera: its distance, how
   * long it rolls, how loud. Play a sound here
   */
  onThunder?: (thunder: Thunder) => void;
};

/**
 * The flashes' channels under the cloud, and their thunder: drawn in the
 * `<VolumePassContext>`'s pass if there is one, else in the scene. Their
 * light in the clouds is the clouds' own.
 * @param props The weather, and what to call
 * @returns Nothing: its mesh is added where the effects are drawn
 */
export const Lightning: FC<LightningProps> = ({
  weather: given,
  onFlash: on_flash,
  onThunder: on_thunder,
}) => {
  const provided = useWeather();
  const weather = given === undefined ? provided : given;
  const [bolts, set_bolts] = useState<Bolts | null>(null);
  const handlers = useRef({ on_flash, on_thunder });

  handlers.current = { on_flash, on_thunder };

  useLayoutEffect(() => {
    if (!weather) return;

    const made = new Bolts(weather);

    set_bolts(made);

    return () => {
      set_bolts(null);
      made.dispose();
    };
  }, [weather]);

  useEffect(() => {
    if (!weather) return;

    const off_flash = weather.on("flash", (flash) =>
      handlers.current.on_flash?.(flash),
    );
    const off_thunder = weather.on("thunder", (thunder) =>
      handlers.current.on_thunder?.(thunder),
    );

    return () => {
      off_flash();
      off_thunder();
    };
  }, [weather]);

  useEffectMesh(bolts);

  const target_height = useTargetHeight();

  useFrame(({ camera, gl }) => {
    bolts?.update(camera, target_height(gl));
  });

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

  /**
   * The scene the other effects are drawn in, to fade them into the cloud
   * round the camera: by default the canvas's. Null for none
   */
  scene?: Object3D | null;
};

/**
 * The weather's clouds for the scene's camera: a node to composite with
 * `over(color, depth)`, as `volume_pass`'s `backdropNode` or anywhere a
 * scene's colour and depth are at hand. Made again when the camera or the
 * quality change, and disposed of after. Inside a cloud, every effect of the
 * scene is drawn in it, as a medium.
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
  const own_scene = useThree((state) => state.scene);
  const scene = options.scene === undefined ? own_scene : options.scene;
  const quality = useShallowStable(options.quality);

  useLayoutEffect(() => check_renderer(gl, "useClouds"), [gl]);

  const [node, set_node] = useState<CloudsNode | null>(null);

  useLayoutEffect(() => {
    if (!weather) {
      set_node(null);

      return;
    }

    const made = new CloudsNode(weather, camera, { quality, scene });

    set_node(made);

    return () => made.dispose();
  }, [weather, camera, quality, scene]);

  return node;
};

export type { CloudsNode };
