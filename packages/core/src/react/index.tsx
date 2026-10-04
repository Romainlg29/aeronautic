import { useFrame } from "@react-three/fiber";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Context,
  type FC,
  type ReactNode,
  type RefObject,
} from "react";
import type { Object3D } from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  Flight,
  type FlightInput,
  type FlightTrackOptions,
  type FlightValues,
} from "../flight";

// The flight, for React
//
// Performance first: the flight is a mutable store, and nothing here makes
// React render per frame unless asked to. Effects read it where they draw,
// for nothing; `useFlightFrame` reads it in a frame callback, for nothing;
// `useFlight` is for the UI, and renders only when what it selects changes,
// at most `hz` times a second

/**
 * A context shared by every copy of the libraries on the page: two bundled
 * copies of one package, or of `@aeronautic/core`, still find each other's
 * providers. Keyed on the global symbol registry.
 * @param name What it holds, unique across the libraries
 * @param fallback What it reads outside a provider
 * @returns The one context of that name
 */
export const shared_context = <T,>(name: string, fallback: T): Context<T> => {
  const key = Symbol.for(`@aeronautic/context/${name}`);
  const registry = globalThis as unknown as Record<
    symbol,
    Context<T> | undefined
  >;

  return (registry[key] ??= createContext(fallback));
};

const FlightContext = shared_context<Flight | null>("flight", null);

/**
 * What an engine gives the effects inside it: where its exhaust leaves, and
 * its own throttle. `@aeronautic/controls`' `<Engine>` provides it, and an
 * `<Afterburner>` inside one sits on that exhaust and runs at that throttle.
 */
export type Thrust = {
  /** Where the exhaust leaves, moving with the nozzle. null until it's found */
  readonly anchor: Object3D | null;

  /** The engine's throttle, 0 to 1.1, read from the flight's values */
  readonly throttle: (values: Readonly<FlightValues>) => number;
};

/**
 * The nearest engine's thrust, for an effect that sits on it. Provide one
 * with `<ThrustContext value={…}>` for an engine of your own.
 */
export const ThrustContext = shared_context<Thrust | null>("thrust", null);

/**
 * The nearest engine's thrust.
 * @returns It, or null outside an engine
 */
export const useThrust = (): Thrust | null => useContext(ThrustContext);

/**
 * The flight the nearest `<FlightProvider>` holds.
 * @returns The flight, or null outside one
 */
export const useFlightStore = (): Flight | null => useContext(FlightContext);

/**
 * Props for `<FlightProvider>`.
 */
export type FlightProviderProps = FlightTrackOptions & {
  /** A flight made elsewhere, to share. Left out, the provider makes one */
  flight?: Flight;

  /** What the provider's own flight starts with */
  initial?: Partial<FlightInput>;

  /**
   * An object to track every frame: the airspeed, the angles, the load
   * factor and the rates are worked out from how it moves. Left out, the
   * flight is only what is written to it
   */
  track?: Object3D | RefObject<Object3D | null> | null;

  children?: ReactNode;
};

/**
 * Whether a value is a ref rather than an object.
 * @param value An object or a ref to one
 * @returns Whether it is a ref
 */
const is_ref = (
  value: Object3D | RefObject<Object3D | null>,
): value is RefObject<Object3D | null> => !("isObject3D" in value);

/**
 * Track an object into a flight every frame, before anything reads it.
 * @param props The flight, what to track and how
 * @returns Nothing
 */
const FlightTracker: FC<{
  store: Flight;
  track: Object3D | RefObject<Object3D | null>;
  options: RefObject<FlightTrackOptions>;
}> = ({ store, track, options }) => {
  // Before anything else in the frame, so whatever reads it reads this one
  useFrame((_, delta) => {
    const object = is_ref(track) ? track.current : track;

    if (object) {
      store.track(object, delta, options.current);
    }
  }, -1);

  useLayoutEffect(() => () => store.resetTracking(), [store]);

  return null;
};

/**
 * One aircraft's flight, for everything inside it: the afterburner, the
 * vapour and the control surfaces read it each frame without rendering.
 *
 * Without `track` it can sit outside the `<Canvas>`, round a HUD as well as
 * the scene. With `track` it must be inside the `<Canvas>`.
 * @param props The flight, or what to start one with, and what to track
 * @returns Its children
 */
export const FlightProvider: FC<FlightProviderProps> = ({
  flight,
  initial,
  track,
  forward,
  up,
  seaLevelY: sea_level_y,
  wind,
  worldUp: world_up,
  children,
}) => {
  const [own] = useState(() => new Flight(initial));
  const store = flight ?? own;

  // Read in the frame, so options written inline don't resubscribe it
  const options = useRef<FlightTrackOptions>({});

  options.current = {
    forward,
    up,
    seaLevelY: sea_level_y,
    wind,
    worldUp: world_up,
  };

  return (
    <FlightContext value={store}>
      {track && <FlightTracker store={store} track={track} options={options} />}
      {children}
    </FlightContext>
  );
};

/**
 * Read the flight every frame, without rendering: for anything that moves
 * with it, a camera's shake or a sound's pitch.
 * @param callback Given the flight's values and the frame's length
 * @param priority The frame callback's priority, as `useFrame`'s
 */
export const useFlightFrame = (
  callback: (values: Readonly<FlightValues>, delta_s: number) => void,
  priority = 0,
) => {
  const store = useFlightStore();
  const held = useRef(callback);

  held.current = callback;

  useFrame((_, delta) => {
    if (store) {
      held.current(store.values, delta);
    }
  }, priority);
};

/**
 * How `useFlight` renders.
 */
export type UseFlightOptions<T> = {
  /**
   * At most this many renders a second; the last change in a gap is never
   * dropped. Left out, it renders on every change of what is selected:
   * for a value that moves every frame, give it one
   */
  hz?: number;

  /** Whether two selections are the same, so no render. `Object.is` by default */
  equal?: (a: T, b: T) => boolean;
};

/**
 * Select from the flight for the UI: renders when the selection changes, at
 * most `hz` times a second.
 *
 * Select a number or a string, or give an `equal` for an object: a selector
 * that builds a new object every time renders on every write.
 * @param selector What to read, from the flight's values
 * @param options How often to render, and what counts as a change
 * @returns The selection, or the selector's on the default flight outside a
 *   provider
 */
export const useFlight = <T,>(
  selector: (values: Readonly<FlightValues>) => T,
  options: UseFlightOptions<T> = {},
): T => {
  const store = useFlightStore();
  const [fallback] = useState(() => new Flight());
  const flight = store ?? fallback;

  const { hz, equal = Object.is } = options;

  // The selector and the comparison change every render when written
  // inline; the last selection is kept so an equal one is the same value
  const latest = useRef({ selector, equal });

  latest.current = { selector, equal };

  // What was selected, at which write, by which selector
  const selected = useRef<{
    version: number;
    selector: unknown;
    value: T;
  } | null>(null);

  const subscribe = useCallback(
    (changed: () => void) => {
      if (!hz) {
        return flight.subscribe(changed);
      }

      const gap_ms = 1000 / hz;

      let last = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const fire = () => {
        timer = undefined;
        last = performance.now();
        changed();
      };

      const stop = flight.subscribe(() => {
        if (timer !== undefined) return;

        const wait = last + gap_ms - performance.now();

        if (wait <= 0) {
          fire();
        } else {
          timer = setTimeout(fire, wait);
        }
      });

      return () => {
        stop();

        if (timer !== undefined) clearTimeout(timer);
      };
    },
    [flight, hz],
  );

  const snapshot = () => {
    const held = selected.current;
    const { selector: select, equal: same } = latest.current;

    if (held && held.version === flight.version && held.selector === select) {
      return held.value;
    }

    const value = select(flight.values);

    if (held && same(held.value, value)) {
      held.version = flight.version;
      held.selector = select;

      return held.value;
    }

    selected.current = { version: flight.version, selector: select, value };

    return value;
  };

  return useSyncExternalStore(subscribe, snapshot, snapshot);
};

/**
 * Whether two flat objects hold the same values.
 * @param a One
 * @param b The other
 * @returns Whether every key matches
 */
export const shallow_equal = (
  a: object | undefined,
  b: object | undefined,
): boolean => {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;

  const a_keys = Object.keys(a);

  if (a_keys.length !== Object.keys(b).length) return false;

  return a_keys.every(
    (key) =>
      (a as Record<string, unknown>)[key] ===
      (b as Record<string, unknown>)[key],
  );
};

/**
 * Hold on to a value until one arrives that differs field by field, so an
 * object written inline does not count as a change every render.
 * @param value The value as given this render
 * @returns The same object for as long as its fields hold
 */
export const useShallowStable = <T extends object | string | undefined>(
  value: T,
): T => {
  const held = useRef(value);

  const same =
    held.current === value ||
    (typeof value === "object" &&
      typeof held.current === "object" &&
      shallow_equal(held.current, value));

  if (!same) {
    held.current = value;
  }

  return held.current;
};

/**
 * Options for `webgpu_gl`: any `WebGPURenderer` option.
 */
export type WebGPUGLOptions = ConstructorParameters<typeof WebGPURenderer>[0];

/**
 * A `<Canvas gl>` that draws with WebGPU, as the effects need:
 * `<Canvas gl={webgpu_gl()}>`. Antialiasing is off by default, the plumes
 * and the vapour being soft already; pass `{ antialias: true }` for hard
 * edges elsewhere. Falls back to WebGL 2 where WebGPU is missing, as three's
 * renderer does.
 * @param options The renderer's options, over the canvas's own
 * @returns The `gl` factory
 */
export const webgpu_gl =
  (options: WebGPUGLOptions = {}) =>
  async (props: object): Promise<WebGPURenderer> => {
    const renderer = new WebGPURenderer({
      ...(props as WebGPUGLOptions),
      antialias: false,
      ...options,
    });

    await renderer.init();

    return renderer;
  };

export { Flight, type FlightInput, type FlightValues };
