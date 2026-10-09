import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  Countermeasures,
  type CountermeasuresHandle,
} from "@aeronautic/countermeasures/react";
import {
  burn_time,
  FLARE,
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
import { Stage } from "./stage";

const MODEL = `${base_path}/fighter.glb`;

// A full moon lights the ground to about 0.25 lux at most; a hemisphere light
// gives an upward face its intensity in lux. The flares light the rest
const MOON_LUX = 0.25;

// The MJU-7's flame when it lights, still and thrown at the fighter's
// speed, and how long it burns
const mju7 = FLARE.mju7;
const lit = flare_light(mju7, grain_at(mju7, 0));
const burn_s = burn_time(mju7);

// They burn a kilometre up, in the standard atmosphere there
const ALTITUDE_M = 1000;
const air = standard_atmosphere(ALTITUDE_M);
const falling_m_s = terminal_speed(
  mju7,
  air.pressurePa / (AIR_GAS_CONSTANT * air.temperatureK),
);

// A fighter low down, slower, and holding still for the flares to fall
const AIRSPEEDS = {
  250: "250 m/s",
  150: "150 m/s",
  0: "0 m/s, hovering",
} as const;

type Airspeed = keyof typeof AIRSPEEDS;

export type Settings = {
  airspeed: Airspeed;
  salvo: number;
  burst: number;
  visibility_m: number;
  ev100: number;
};

// Two flares a burst, four bursts, a clear night
export const START_SETTINGS: Settings = {
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
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ settings, fired, readout }) => {
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
  const look = useMemo(() => ({ exposure }), [exposure]);

  // As it leaves: the airspeed, and the cartridge's throw square to it
  const thrown_cd = useMemo(
    () =>
      flare_light(
        mju7,
        grain_at(mju7, 0),
        undefined,
        undefined,
        Math.hypot(settings.airspeed, mju7.ejectionMPerS),
      ).intensityCd,
    [settings.airspeed],
  );
  const program = useMemo(
    () => ({ salvo: settings.salvo, burst: settings.burst }),
    [settings.salvo, settings.burst],
  );

  useFrame(() => {
    const current = flares.current;

    if (!current || !readout.current) return;

    readout.current.textContent =
      `${current.burning} burning, ${current.pending} to come · ` +
      `each ${(lit.intensityCd / 1000).toFixed(0)} kcd still, ` +
      `${(thrown_cd / 1000).toFixed(0)} kcd at the grain as thrown, ` +
      `for ${burn_s.toFixed(1)} s · falling at ` +
      `${falling_m_s.toFixed(0)} m/s once slowed`;
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
          air={{ altitudeM: ALTITUDE_M, visibilityM: settings.visibility_m }}
          look={look}
          fire={fired}
        />
      </group>
      <hemisphereLight args={["#ffffff", "#000000", MOON_LUX * exposure]} />
    </>
  );
};

/**
 * The fire button, the program, the airspeed, the haze and the exposure.
 * @param props The settings, how to change them, and how to fire
 * @returns The controls
 */
const CountermeasuresControls: FC<{
  settings: Settings;
  change: (next: Partial<Settings>) => void;
  fire: () => void;
}> = ({ settings, change, fire }) => (
  <div className="example-controls">
    <button type="button" onClick={fire}>
      Fire
    </button>
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
 * @returns The example
 */
export const CountermeasuresExample: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const [fired, set_fired] = useState(0);
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
          />
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <FlaringFighter settings={settings} fired={fired} readout={readout} />
    </Stage>
  );
};

export default CountermeasuresExample;
