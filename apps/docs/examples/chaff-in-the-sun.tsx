import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  Countermeasures,
  type CountermeasuresHandle,
} from "@aeronautic/countermeasures/react";
import { mirror_density } from "@aeronautic/countermeasures/physics";
import {
  type FC,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Group, LoopOnce, Vector3, type Vector3Tuple } from "three";
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

// Hovering a kilometre up: each cloud forms under the tail, where the
// dispensers let it go, and stays there, sinking at 0.19 m/s
const ALTITUDE_M = 1000;
const CLOUD: Vector3Tuple = [0, -1.5, 5];

// The views, each the same distance off at the sun's elevation: where its
// reflection is, behind the tail with the sun ahead; off to the side; and
// below, looking into it
const VIEWS = {
  reflection: "at the sun's reflection",
  side: "off to the side",
  into: "below, into the sun",
} as const;

type View = keyof typeof VIEWS;

const DISTANCE_M = 70;

/**
 * Where the camera is for a view.
 * @param view Which
 * @param elevation_rad The sun's elevation
 * @returns The camera's position
 */
const camera_for = (view: View, elevation_rad: number): Vector3Tuple => {
  const up = Math.sin(elevation_rad) * DISTANCE_M;
  const along = Math.cos(elevation_rad) * DISTANCE_M;
  const [x, y, z] = CLOUD;

  if (view === "reflection") return [x, y + up, z + along];
  if (view === "side") return [x + along, y + up, z];

  return [x, y - up, z + along];
};

export type Settings = {
  view: View;
  elevation_deg: number;
  burst: number;
};

export const START_SETTINGS: Settings = {
  view: "reflection",
  elevation_deg: 40,
  burst: 2,
};

const scratch_sun = new Vector3();
const scratch_eye = new Vector3();
const cloud = new Vector3(...CLOUD);

/**
 * The fighter hovering in the sun, letting chaff go.
 * @param props The settings, how many times it has fired, and where to say
 *   how bright the cloud is from here
 * @returns The model, its chaff and the daylight
 */
const ChaffingFighter: FC<{
  settings: Settings;
  chaffed: number;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ settings, chaffed, readout }) => {
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

  // The sun ahead, -Z, at its elevation
  const elevation = (settings.elevation_deg * Math.PI) / 180;
  const sun: Vector3Tuple = useMemo(
    () => [0, Math.sin(elevation), -Math.cos(elevation)],
    [elevation],
  );
  const lux = sun_lux(elevation);

  // The sky's light from above and the ground's from below, each half of
  // every way: the ground lit by the sun and the sky
  const ground_cd_m2 =
    (GROUND_ALBEDO * (lux * Math.sin(elevation) + Math.PI * SKY_CD_M2)) /
    Math.PI;
  const exposure = LIGHTS_DAY_EXPOSURE;
  const look = useMemo(
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
  const program = useMemo(
    () => ({ salvo: 1, burst: settings.burst, payload: "chaff" as const }),
    [settings.burst],
  );

  useEffect(() => {
    if (chaffed > 0) chaff.current?.fire(program);
  }, [chaffed, program]);

  // Seen from here: how bright the level cloud is, against turned every way
  useFrame(({ camera }) => {
    const current = chaff.current;

    if (!current || !readout.current) return;

    scratch_sun.fromArray(sun);
    scratch_eye.copy(camera.position).sub(cloud).normalize();
    scratch_sun.add(scratch_eye);

    const half = scratch_sun.length();
    const tilt = current.chaffTiltRad;
    const bright =
      half > 1e-6 ? 2 * mirror_density(1, tilt, scratch_sun.y / half) : 1;

    readout.current.textContent =
      `${current.chaffClouds} clouds, sinking at ` +
      `${current.chaffFallMPerS.toFixed(2)} m/s · fibres within ` +
      `${((tilt * 180) / Math.PI).toFixed(1)}° of level · the sun ` +
      `${(lux / 1000).toFixed(0)} klux · from here ` +
      (half > 1e-6
        ? `${bright.toFixed(1)}× as bright as turned every way`
        : "every fibre glints");
  });

  return (
    <>
      <group ref={body}>
        <primitive object={scene} />
        <Countermeasures
          ref={chaff}
          flight={{ airspeedMPerS: 0 }}
          air={{ altitudeM: ALTITUDE_M }}
          look={look}
        />
      </group>
      <hemisphereLight
        args={["#8cacdc", "#5a5a50", Math.PI * SKY_CD_M2 * exposure]}
      />
      <directionalLight
        position={[sun[0] * 100, sun[1] * 100, sun[2] * 100]}
        intensity={lux * exposure}
      />
    </>
  );
};

/**
 * The chaff button, the view and the sun's elevation.
 * @param props The settings, how to change them, and how to fire
 * @returns The controls
 */
const ChaffControls: FC<{
  settings: Settings;
  change: (next: Partial<Settings>) => void;
  chaff: () => void;
}> = ({ settings, change, chaff }) => (
  <div className="example-controls">
    <button type="button" onClick={chaff}>
      Chaff
    </button>
    <label>
      view
      <select
        value={settings.view}
        onChange={(event) => change({ view: event.target.value as View })}
      >
        {Object.entries(VIEWS).map(([value, label]) => (
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
        min={10}
        max={80}
        step={1}
        value={settings.elevation_deg}
        onChange={(event) =>
          change({ elevation_deg: Number(event.target.value) })
        }
      />
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
  </div>
);

/**
 * The docs' fighter letting chaff go in the sun.
 * @returns The example
 */
export const ChaffInTheSunExample: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const [chaffed, set_chaffed] = useState(0);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  const elevation = (settings.elevation_deg * Math.PI) / 180;
  const camera = camera_for(settings.view, elevation);

  return (
    <Stage
      camera={camera}
      target={CLOUD}
      fov={30}
      floor={null}
      sky={false}
      daylight
      overlay={
        <>
          <ChaffControls
            settings={settings}
            change={change}
            chaff={() => set_chaffed((count) => count + 1)}
          />
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Aim camera={camera} target={CLOUD} />
      <ChaffingFighter
        settings={settings}
        chaffed={chaffed}
        readout={readout}
      />
    </Stage>
  );
};

export default ChaffInTheSunExample;
