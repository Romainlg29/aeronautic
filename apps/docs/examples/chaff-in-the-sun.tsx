import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { CountermeasuresLook } from "@aeronautic/countermeasures";
import {
  Countermeasures,
  type CountermeasuresHandle,
} from "@aeronautic/countermeasures/react";
import {
  type FC,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Group, LoopOnce, type Vector3Tuple } from "three";
import { base_path } from "@/lib/shared";
import { Aim, LIGHTS_DAY_EXPOSURE, Stage } from "./stage";

const MODEL = `${base_path}/fighter.glb`;

// Above the atmosphere the sun lights a surface square to it to about
// 128,000 lux. Through the air, Meinel and Meinel's fit, 0.7 to the air
// mass to the 0.678 (1976), with Kasten and Young's air mass (1989): about
// 90,000 lux overhead
const SUN_LUX_OUT = 128_000;

const air_mass = (elevation_rad: number) =>
  1 /
  (Math.sin(elevation_rad) +
    0.50572 * ((elevation_rad * 180) / Math.PI + 6.07995) ** -1.6364);

const sun_lux = (elevation_rad: number) =>
  SUN_LUX_OUT * 0.7 ** (air_mass(elevation_rad) ** 0.678);

// A clear sky away from the sun, about 6000 cd/m², as the stage draws it.
// The ground below gives back a fifth of what falls on it, a field's
const SKY_CD_M2 = 6000;
const GROUND_ALBEDO = 0.2;

// Three kilometres up
const ALTITUDE_M = 3000;

// Ahead, off to the side and above, looking back down the trail; behind,
// chasing; and high behind it, looking down the trail at the fighter
export const VIEWS = {
  alongside: {
    label: "alongside, looking back",
    camera: [34, 26, -32],
    target: [0, -3, 22],
  },
  chase: {
    label: "chasing, behind",
    camera: [-5, 7, 34],
    target: [0, -1, -4],
  },
  above: {
    label: "above, behind the trail",
    camera: [12, 40, 120],
    target: [0, -3, 10],
  },
} as const satisfies Record<
  string,
  { label: string; camera: Vector3Tuple; target: Vector3Tuple }
>;

type View = keyof typeof VIEWS;

const AIRSPEEDS = {
  250: "250 m/s",
  150: "150 m/s",
  0: "0 m/s, hovering",
} as const;

type Airspeed = keyof typeof AIRSPEEDS;

export type Settings = {
  view: View;
  airspeed: Airspeed;
  elevation_deg: number;
  bearing_deg: number;
};

// The sun behind the trail, as high as the first view sees it from there:
// the trail at the sun's reflection
export const START_SETTINGS: Settings = {
  view: "alongside",
  airspeed: 250,
  elevation_deg: 20,
  bearing_deg: 160,
};

// Held down, the dispensers take turns, a cartridge every twentieth of a
// second, an estimate of a fast program: at 250 m/s, a cloud every 12.5 m,
// about its own length
const HELD = {
  burst: 4,
  burstIntervalS: 0.05,
  salvo: 1,
  salvoIntervalS: 0.2,
  payload: "chaff" as const,
};
const HELD_EVERY_MS = 200;

// Two flares a burst, two bursts, as the night example's program
const FLARES = {
  burst: 2,
  burstIntervalS: 0.1,
  salvo: 2,
  salvoIntervalS: 0.5,
  payload: "flare" as const,
};

/**
 * The light the fighter flies in, from elsewhere: an atmosphere's. Its own
 * sun and sky are then left out.
 */
export type Daylight = {
  /** The look, in the scene's light units */
  look: Partial<CountermeasuresLook>;

  /** The sun's illuminance there, lux */
  lux: number;
};

/**
 * The fighter flying in the sun, letting chaff go.
 * @param props The settings, whether chaff is held down, where to say what
 *   it is doing, the flares fired so far, and the light if it is given
 * @returns The model, its chaff and the daylight
 */
export const ChaffingFighter: FC<{
  settings: Settings;
  held: boolean;
  readout: RefObject<HTMLSpanElement | null>;
  flares?: number;
  daylight?: Daylight;
}> = ({ settings, held, readout, flares, daylight }) => {
  const { scene, animations } = useGLTF(MODEL);
  const body = useRef<Group>(null);
  const chaff = useRef<CountermeasuresHandle>(null);
  const { actions } = useAnimations(animations, body);

  useEffect(() => {
    scene.traverse((node) => {
      if (node.userData.visible_default === false) node.visible = false;
    });

    const retract = actions.ANIM_Gear_Retract;

    if (!retract) return;

    retract.setLoop(LoopOnce, 1);
    retract.clampWhenFinished = true;
    retract.play();
  }, [scene, actions]);

  // Held down, a pair at a time, for as long as it is
  useEffect(() => {
    if (!held) return;

    chaff.current?.fire(HELD);

    const timer = setInterval(() => chaff.current?.fire(HELD), HELD_EVERY_MS);

    return () => clearInterval(timer);
  }, [held]);

  // The sun at its elevation, its bearing from the nose round to the left
  const elevation = (settings.elevation_deg * Math.PI) / 180;
  const bearing = (settings.bearing_deg * Math.PI) / 180;
  const sun: Vector3Tuple = useMemo(
    () => [
      -Math.sin(bearing) * Math.cos(elevation),
      Math.sin(elevation),
      -Math.cos(bearing) * Math.cos(elevation),
    ],
    [elevation, bearing],
  );
  const lux = daylight?.lux ?? sun_lux(elevation);

  // The sky's light from above and the ground's from below, each half of
  // every way: the ground lit by the sun and the sky
  const ground_cd_m2 =
    (GROUND_ALBEDO * (lux * Math.sin(elevation) + Math.PI * SKY_CD_M2)) /
    Math.PI;
  const exposure = LIGHTS_DAY_EXPOSURE;
  const own_look = useMemo(
    () => ({
      exposure,
      sunDirection: sun,
      sunColor: [1, 0.96, 0.9] as const,
      sunIntensity: lux * exposure,
      skyColor: [0.55, 0.68, 0.9] as const,
      skyIntensity: ((SKY_CD_M2 + ground_cd_m2) / 2) * exposure,
    }),
    [exposure, sun, lux, ground_cd_m2],
  );
  const look = daylight?.look ?? own_look;

  useFrame(() => {
    const current = chaff.current;

    if (!current || !readout.current) return;

    readout.current.textContent =
      `${current.chaffClouds} clouds · each 3.7 million fibres, sinking at ` +
      `${current.chaffFallMPerS.toFixed(2)} m/s, within ` +
      `${((current.chaffTiltRad * 180) / Math.PI).toFixed(1)}° of level · ` +
      `the sun ${(lux / 1000).toFixed(0)} klux`;
  });

  return (
    <>
      <group ref={body}>
        <primitive object={scene} />
        <Countermeasures
          ref={chaff}
          flight={{ airspeedMPerS: settings.airspeed }}
          air={{ altitudeM: ALTITUDE_M }}
          look={look}
          program={FLARES}
          fire={flares}
          quality="ultra"
        />
      </group>
      {!daylight && (
        <>
          <hemisphereLight
            args={["#8cacdc", "#5a5a50", Math.PI * SKY_CD_M2 * exposure]}
          />
          <directionalLight
            position={[sun[0] * 100, sun[1] * 100, sun[2] * 100]}
            intensity={lux * exposure}
          />
        </>
      )}
    </>
  );
};

/**
 * The chaff button, held down, the view, the airspeed and the sun.
 * @param props The settings, how to change them, how to hold the chaff, how
 *   low the sun goes, and more controls first
 * @returns The controls
 */
export const ChaffControls: FC<{
  settings: Settings;
  change: (next: Partial<Settings>) => void;
  hold: (held: boolean) => void;
  lowest_deg?: number;
  children?: ReactNode;
}> = ({ settings, change, hold, lowest_deg = 5, children }) => (
  <div className="example-controls">
    {children}
    <button
      type="button"
      onPointerDown={() => hold(true)}
      onPointerUp={() => hold(false)}
      onPointerLeave={() => hold(false)}
    >
      Chaff, hold
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
    <label>
      sun {settings.elevation_deg}° up
      <input
        type="range"
        min={lowest_deg}
        max={85}
        step={1}
        value={settings.elevation_deg}
        onChange={(event) =>
          change({ elevation_deg: Number(event.target.value) })
        }
      />
    </label>
    <label>
      sun {settings.bearing_deg}° off the nose
      <input
        type="range"
        min={-180}
        max={180}
        step={5}
        value={settings.bearing_deg}
        onChange={(event) =>
          change({ bearing_deg: Number(event.target.value) })
        }
      />
    </label>
  </div>
);

/**
 * The docs' fighter letting chaff go in the sun.
 * @returns The example
 */
export const ChaffInTheSunExample: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const [held, set_held] = useState(false);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  const { camera, target } = VIEWS[settings.view];

  return (
    <Stage
      camera={[...camera]}
      target={[...target]}
      fov={45}
      floor={null}
      sky={false}
      daylight
      overlay={
        <>
          <ChaffControls settings={settings} change={change} hold={set_held} />
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Aim camera={[...camera]} target={[...target]} />
      <ChaffingFighter settings={settings} held={held} readout={readout} />
    </Stage>
  );
};

export default ChaffInTheSunExample;
