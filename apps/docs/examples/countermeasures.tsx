import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  Countermeasures,
  type CountermeasuresHandle,
} from "@aeronautic/countermeasures/react";
import {
  burn_time,
  FLARE,
  flare_at_pressure,
  flare_light,
  grain_at,
  terminal_speed,
} from "@aeronautic/countermeasures/physics";
import {
  AIR_GAS_CONSTANT,
  exposure_ev100,
  standard_atmosphere,
} from "@aeronautic/core";
import {
  type FC,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Group, LoopOnce } from "three";
import { base_path } from "@/lib/shared";
import { Aim, Stage } from "./stage";

const MODEL = `${base_path}/fighter.glb`;

// A full moon lights the ground to about 0.25 lux at most; a hemisphere light
// gives an upward face its intensity in lux. The flares light the rest. It
// lights the smoke from overhead too, as the sun would
const MOON_LUX = 0.25;
const MOON_UP = [0, 1, 0] as const;

// The MJU-7's flame when it lights, still
const mju7 = FLARE.mju7;
const lit = flare_light(mju7, grain_at(mju7, 0));

/**
 * The standard atmosphere at an altitude, and the flare in it: how long it
 * burns, slower in thinner air, and how fast it falls once slowed.
 * @param altitude_m How high
 * @returns The air's density, the burn and the fall
 */
const flare_at = (altitude_m: number) => {
  const air = standard_atmosphere(altitude_m);
  const density = air.pressurePa / (AIR_GAS_CONSTANT * air.temperatureK);

  return {
    density,
    burn_s: burn_time(flare_at_pressure(mju7, air.pressurePa)),
    falling_m_s: terminal_speed(mju7, density),
  };
};

// Close under the tail, or off to the side, far enough to see a program's
// flares fall away behind: at 250 m/s each burns out half a kilometre back
// and forty metres down
const VIEWS = {
  close: {
    label: "close, under the tail",
    camera: [-42, 4, -14],
    target: [0, -6, 28],
  },
  side: {
    label: "off the side, 650 m",
    camera: [-650, -20, 260],
    target: [0, -20, 260],
  },
} as const;

type View = keyof typeof VIEWS;

// A fighter low down, slower, and holding still for the flares to fall
const AIRSPEEDS = {
  250: "250 m/s",
  150: "150 m/s",
  0: "0 m/s, hovering",
} as const;

type Airspeed = keyof typeof AIRSPEEDS;

export type Settings = {
  view: View;
  airspeed: Airspeed;
  salvo: number;
  burst: number;
  visibility_m: number;
  ev100: number;
  altitude_m: number;
};

// Two flares a burst, four bursts, a clear night, a kilometre up
export const START_SETTINGS: Settings = {
  altitude_m: 1000,
  view: "close",
  airspeed: 250,
  salvo: 4,
  burst: 2,
  visibility_m: 23_000,
  ev100: 8,
};

/**
 * The fighter at night, its two dispensers under its tail.
 * @param props The settings, how many times it has fired, and where to say
 *   what the flares are doing
 * @returns The model and its countermeasures
 */
const FlaringFighter: FC<{
  settings: Settings;
  fired: number;
  chaffed: number;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ settings, fired, chaffed, readout }) => {
  const { scene, animations } = useGLTF(MODEL);
  const body = useRef<Group>(null);
  const flares = useRef<CountermeasuresHandle>(null);
  const { actions } = useAnimations(animations, body);

  useEffect(() => {
    // The afterburner cones and the pylons are meant hidden, flagged so in
    // their extras, which three hands over as userData
    scene.traverse((node) => {
      if (node.userData.visible_default === false) node.visible = false;
    });

    // It's modelled on its wheels: fold them away
    const retract = actions.ANIM_Gear_Retract;

    if (!retract) return;

    retract.setLoop(LoopOnce, 1);
    retract.clampWhenFinished = true;
    retract.play();
  }, [scene, actions]);

  const exposure = exposure_ev100(settings.ev100);
  const look = useMemo(
    () => ({
      exposure,
      sunDirection: MOON_UP,
      sunColor: [1, 1, 1] as const,
      sunIntensity: MOON_LUX * exposure,
    }),
    [exposure],
  );

  const { density, burn_s, falling_m_s } = useMemo(
    () => flare_at(settings.altitude_m),
    [settings.altitude_m],
  );

  // As it leaves: the airspeed, and the cartridge's throw square to it
  const thrown_cd = useMemo(
    () =>
      flare_light(
        mju7,
        grain_at(mju7, 0),
        undefined,
        undefined,
        Math.hypot(settings.airspeed, mju7.ejectionMPerS),
        density,
      ).intensityCd,
    [settings.airspeed, density],
  );
  const program = useMemo(
    () => ({ salvo: settings.salvo, burst: settings.burst }),
    [settings.salvo, settings.burst],
  );

  // The same program, of chaff: a cloud a cartridge
  const chaffed_once = useRef(chaffed);

  useEffect(() => {
    if (chaffed === chaffed_once.current) return;

    chaffed_once.current = chaffed;
    flares.current?.fire({ ...program, payload: "chaff" });
  }, [chaffed, program]);

  useFrame(() => {
    const current = flares.current;

    if (!current || !readout.current) return;

    readout.current.textContent =
      `${current.burning} burning, ${current.pending} to come · ` +
      `each ${(lit.intensityCd / 1000).toFixed(0)} kcd still, ` +
      `${(thrown_cd / 1000).toFixed(0)} kcd at the grain as thrown, ` +
      `lit after ${mju7.ignitionDelayS} s for ${burn_s.toFixed(1)} s · ` +
      `${current.smoking} smoke trails · falling at ` +
      `${falling_m_s.toFixed(0)} m/s once slowed · ` +
      `${current.chaffClouds} chaff clouds, sinking at ` +
      `${current.chaffFallMPerS.toFixed(2)} m/s`;
  });

  return (
    <>
      <group ref={body}>
        <primitive object={scene} />
        {/*
          On the model's origin, which flies -Z, the dispensers where the
          defaults put them, under the tail
        */}
        <Countermeasures
          ref={flares}
          program={program}
          flight={{ airspeedMPerS: settings.airspeed }}
          air={{
            altitudeM: settings.altitude_m,
            visibilityM: settings.visibility_m,
          }}
          look={look}
          fire={fired}
        />
      </group>
      <hemisphereLight args={["#ffffff", "#000000", MOON_LUX * exposure]} />
    </>
  );
};

/**
 * The flare and chaff buttons, the view, the program, the airspeed, the haze and the
 * exposure, and the altitude if asked for.
 * @param props The settings, how to change them, how to fire, and whether
 *   the altitude is shown
 * @returns The controls
 */
const CountermeasuresControls: FC<{
  settings: Settings;
  change: (next: Partial<Settings>) => void;
  fire: () => void;
  chaff: () => void;
  altitude: boolean;
}> = ({ settings, change, fire, chaff, altitude }) => (
  <div className="example-controls">
    <button type="button" onClick={fire}>
      Flares
    </button>
    <button type="button" onClick={chaff}>
      Chaff
    </button>
    <label>
      view
      <select
        value={settings.view}
        onChange={(event) => change({ view: event.target.value as View })}
      >
        {Object.entries(VIEWS).map(([value, { label }]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
    <label>
      airspeed
      <select
        value={settings.airspeed}
        onChange={(event) =>
          change({ airspeed: Number(event.target.value) as Airspeed })
        }
      >
        {Object.entries(AIRSPEEDS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
    {altitude && (
      <label>
        altitude {(settings.altitude_m / 1000).toFixed(1)} km
        <input
          type="range"
          min={0}
          max={15_000}
          step={500}
          value={settings.altitude_m}
          onChange={(event) =>
            change({ altitude_m: Number(event.target.value) })
          }
        />
      </label>
    )}
    <label>
      burst {settings.burst}
      <input
        type="range"
        min={1}
        max={4}
        step={1}
        value={settings.burst}
        onChange={(event) => change({ burst: Number(event.target.value) })}
      />
    </label>
    <label>
      salvo {settings.salvo}
      <input
        type="range"
        min={1}
        max={8}
        step={1}
        value={settings.salvo}
        onChange={(event) => change({ salvo: Number(event.target.value) })}
      />
    </label>
    <label>
      visibility {(settings.visibility_m / 1000).toFixed(1)} km
      <input
        type="range"
        min={Math.log(500)}
        max={Math.log(50_000)}
        step={0.01}
        value={Math.log(settings.visibility_m)}
        onChange={(event) =>
          change({
            visibility_m: Math.round(Math.exp(Number(event.target.value))),
          })
        }
      />
    </label>
    <label>
      exposure EV {settings.ev100.toFixed(1)}
      <input
        type="range"
        min={2}
        max={14}
        step={0.1}
        value={settings.ev100}
        onChange={(event) => change({ ev100: Number(event.target.value) })}
      />
    </label>
  </div>
);

/**
 * The docs' fighter letting flares go at night.
 * @param props Where to start from, and whether the altitude can change
 * @returns The example
 */
export const CountermeasuresExample: FC<{
  start?: Partial<Settings>;
  altitude?: boolean;
}> = ({ start, altitude = false }) => {
  const [settings, set_settings] = useState<Settings>({
    ...START_SETTINGS,
    ...start,
  });
  const [fired, set_fired] = useState(0);
  const [chaffed, set_chaffed] = useState(0);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  return (
    <Stage
      camera={[-42, 4, -14]}
      target={[0, -6, 28]}
      fov={45}
      floor={null}
      sky={false}
      overlay={
        <>
          <CountermeasuresControls
            settings={settings}
            change={change}
            fire={() => set_fired((count) => count + 1)}
            chaff={() => set_chaffed((count) => count + 1)}
            altitude={altitude}
          />
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Aim
        camera={[...VIEWS[settings.view].camera]}
        target={[...VIEWS[settings.view].target]}
      />
      <FlaringFighter
        settings={settings}
        fired={fired}
        chaffed={chaffed}
        readout={readout}
      />
    </Stage>
  );
};

export default CountermeasuresExample;
