import {
  formatForDisplay,
  type RegisterableHotkey,
  useHotkeys,
} from "@tanstack/react-hotkeys";
import {
  type FC,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// The keyboard, as War Thunder's keyboard-only controls lay it out: W and S
// push and pull the stick, A and D roll, the arrows doing the same, Q and E the pedals, Shift and Ctrl
// the throttle, past military power into reheat. G, F and H work the gear,
// the flaps and the air brake, and C lets flares go. Nothing flies: the aircraft holds still, and
// what the keys change is the flight its effects read

// Where the keys put the controls, each -1 to 1 but the throttle's direction
export type Keys = {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
};

// The levers, each 0 to 1
export type Levers = {
  gear: number;
  flaps: number;
  airbrake: number;
};

// The flaps' notches: up, combat, landing
const FLAP_NOTCHES = [0, 0.5, 1];

/**
 * Which way a pair of keys pushes an axis.
 * @param plus Whether the key pushing it positive is held
 * @param minus Whether the key pushing it negative is held
 * @returns 1, 0 or -1
 */
const axis = (plus: boolean, minus: boolean) => Number(plus) - Number(minus);

// The keys held down, by the physical key, as the name each went down as.
// A key is let go on its own release alone: letting go of Shift doesn't let
// go of W, as a tracker that clears with the modifiers would. Shift held
// makes W's name "W" and its release's "w", so the physical key is what
// matches the two
const held = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

const publish = () => {
  snapshot = new Set(held.values());
  for (const listener of listeners) listener();
};

const press = (event: KeyboardEvent) => {
  const id = event.code || event.key;

  if (held.has(id)) return;

  held.set(id, event.key.toLowerCase());
  publish();
};

const release = (event: KeyboardEvent) => {
  if (held.delete(event.code || event.key)) publish();
};

// Away from the page, no release comes: everything is let go
const release_all = () => {
  if (held.size === 0) return;

  held.clear();
  publish();
};

const on_hidden = () => {
  if (document.hidden) release_all();
};

/**
 * Follow the keys held down.
 * @param listener Called whenever one goes down or up
 * @returns How to stop
 */
const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    window.addEventListener("keydown", press, true);
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", release_all);
    document.addEventListener("visibilitychange", on_hidden);
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      window.removeEventListener("keydown", press, true);
      window.removeEventListener("keyup", release, true);
      window.removeEventListener("blur", release_all);
      document.removeEventListener("visibilitychange", on_hidden);
      held.clear();
      snapshot = new Set();
    }
  };
};

const no_keys: ReadonlySet<string> = new Set();

/**
 * Whether a key is held down.
 * @param name The key's name, as KeyboardEvent.key gives it
 * @returns Whether it is held
 */
const useKeyHold = (name: string) => {
  const key = name.toLowerCase();

  return useSyncExternalStore(
    subscribe,
    () => snapshot.has(key),
    () => no_keys.has(key),
  );
};

/**
 * The keys held down, as the axes they push.
 * @returns The axes, in a ref read each frame
 */
const useKeys = (): RefObject<Keys> => {
  const keys = useRef<Keys>({ pitch: 0, roll: 0, yaw: 0, throttle: 0 });

  useEffect(() => {
    const on = (key: string) => snapshot.has(key);
    const update = () => {
      // S pulls the stick aft, nose up, the flight's positive pitch
      keys.current.pitch = axis(
        on("s") || on("arrowdown"),
        on("w") || on("arrowup"),
      );
      keys.current.roll = axis(
        on("d") || on("arrowright"),
        on("a") || on("arrowleft"),
      );
      keys.current.yaw = axis(on("e"), on("q"));
      keys.current.throttle = axis(on("shift"), on("control"));
    };

    update();

    return subscribe(update);
  }, []);

  return keys;
};

/**
 * Each of a lever's keys, with Shift held as well as without, so the gear
 * still comes up while the throttle is being pushed.
 * @param key The key
 * @param callback What it does
 * @returns Its registrations
 */
const both = (key: string, callback: () => void) =>
  [key, `Shift+${key}`].map((hotkey) => ({
    hotkey: hotkey as RegisterableHotkey,
    callback,
  }));

// What a held Ctrl and a flight key would otherwise do in the browser: save
// the page, bookmark it, search. Ctrl+W, closing the tab, can't be held back
const BROWSER_CHORDS = ["S", "D", "E", "Q", "A"].map((key) => ({
  hotkey: `Control+${key}` as RegisterableHotkey,
  callback: () => {},
}));

/**
 * The keyboard: the stick, pedals and throttle held, and the levers toggled.
 * @returns The axes, read each frame, the levers, and the flares fired
 */
export const usePilot = () => {
  const keys = useKeys();
  // Each press of C, counted: the countermeasures fire on each new count
  const [flares, set_flares] = useState(0);
  const [levers, set_levers] = useState<Levers>({
    gear: 0,
    flaps: 0,
    airbrake: 0,
  });

  useHotkeys(
    [
      ...both("G", () => set_levers((l) => ({ ...l, gear: 1 - l.gear }))),
      ...both("F", () =>
        set_levers((l) => ({
          ...l,
          flaps:
            FLAP_NOTCHES[
              (FLAP_NOTCHES.indexOf(l.flaps) + 1) % FLAP_NOTCHES.length
            ] ?? 0,
        })),
      ),
      ...both("H", () =>
        set_levers((l) => ({ ...l, airbrake: 1 - l.airbrake })),
      ),
      ...both("C", () => set_flares((count) => count + 1)),
      ...BROWSER_CHORDS,
    ],
    { preventDefault: true, conflictBehavior: "allow" },
  );

  return { keys, levers, flares };
};

// The legend's rows: the keys, and what they do
const LEGEND: [keys: string[], does: string][] = [
  [["W", "S", "ArrowUp", "ArrowDown"], "Pitch"],
  [["A", "D", "ArrowLeft", "ArrowRight"], "Roll"],
  [["Q", "E"], "Yaw"],
  [["Shift", "Control"], "Throttle"],
  [["G"], "Gear"],
  [["F"], "Flaps"],
  [["H"], "Air brake"],
  [["C"], "Flares"],
];

/**
 * One key, lit while it is held.
 * @param props The key
 * @returns The key cap
 */
const Key: FC<{ name: string }> = ({ name }) => {
  const down = useKeyHold(name);

  return (
    <kbd
      className={`inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
        down
          ? "border-orange-300 bg-orange-400/80 text-black"
          : "border-white/25 bg-black/30 text-white/85"
      }`}
    >
      {formatForDisplay(name)}
    </kbd>
  );
};

/**
 * The keys and what they do, each lit while held.
 * @returns The legend
 */
export const Legend: FC = () => (
  <dl className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 text-xs">
    {LEGEND.map(([keys, does]) => (
      <div key={does} className="contents">
        <dt className="flex gap-1">
          {keys.map((name) => (
            <Key key={name} name={name} />
          ))}
        </dt>
        <dd className="text-white/75">{does}</dd>
      </div>
    ))}
  </dl>
);
