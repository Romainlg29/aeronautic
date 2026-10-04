import {
  formatForDisplay,
  type RegisterableHotkey,
  useHotkeys,
  useKeyHold,
} from "@tanstack/react-hotkeys";
import { type FC, type RefObject, useEffect, useRef, useState } from "react";

// The keyboard, as War Thunder's keyboard-only controls lay it out: W and S
// push and pull the stick, A and D roll, the arrows doing the same, Q and E the pedals, Shift and Ctrl
// the throttle, past military power into reheat. G, F and H work the gear,
// the flaps and the air brake. Nothing flies: the aircraft holds still, and
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

/**
 * The keys held down, as the axes they push.
 * @returns The axes, in a ref read each frame
 */
const useKeys = (): RefObject<Keys> => {
  const keys = useRef<Keys>({ pitch: 0, roll: 0, yaw: 0, throttle: 0 });

  const w = useKeyHold("W");
  const s = useKeyHold("S");
  const a = useKeyHold("A");
  const d = useKeyHold("D");
  const q = useKeyHold("Q");
  const e = useKeyHold("E");
  const up = useKeyHold("ArrowUp");
  const down = useKeyHold("ArrowDown");
  const left = useKeyHold("ArrowLeft");
  const right = useKeyHold("ArrowRight");
  const shift = useKeyHold("Shift");
  const control = useKeyHold("Control");

  useEffect(() => {
    // S pulls the stick aft, nose up, the flight's positive pitch
    keys.current.pitch = axis(s || down, w || up);
    keys.current.roll = axis(d || right, a || left);
    keys.current.yaw = axis(e, q);
    keys.current.throttle = axis(shift, control);
  }, [w, s, a, d, q, e, up, down, left, right, shift, control]);

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
 * @returns The axes, read each frame, and the levers
 */
export const usePilot = () => {
  const keys = useKeys();
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
      ...BROWSER_CHORDS,
    ],
    { preventDefault: true, conflictBehavior: "allow" },
  );

  return { keys, levers };
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
];

/**
 * One key, lit while it is held.
 * @param props The key
 * @returns The key cap
 */
const Key: FC<{ name: string }> = ({ name }) => {
  const held = useKeyHold(name as Parameters<typeof useKeyHold>[0]);

  return (
    <kbd
      className={`inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
        held
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
