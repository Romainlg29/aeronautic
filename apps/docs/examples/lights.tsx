import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { LightsSwitches } from "@aeronautic/lights";
import { Lights, type LightsHandle } from "@aeronautic/lights/react";
import { exposure_ev100 } from "@aeronautic/lights/physics";
import {
  type FC,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box3,
  Color,
  type Group,
  LinearSRGBColorSpace,
  LoopOnce,
  type Object3D,
} from "three";
import { base_path } from "@/lib/shared";
import { Stage } from "./stage";

const MODEL = `${base_path}/fighter.glb`;

// Aged asphalt reflects about 12 % of the light, fresh about 5 %: Lawrence
// Berkeley's measurements of pavement albedo
const ASPHALT_ALBEDO = 0.12;
const asphalt = new Color().setRGB(
  ASPHALT_ALBEDO,
  ASPHALT_ALBEDO,
  ASPHALT_ALBEDO,
  LinearSRGBColorSpace,
);

// An aircraft stand is floodlit to an average of at least 20 lux on the
// ground: ICAO Annex 14's apron floodlighting. The masts are many and high, so
// it comes from above; what the asphalt reflects lights the underside
const APRON_LUX = 20;
const asphalt_bounce = new Color().setRGB(
  ASPHALT_ALBEDO,
  ASPHALT_ALBEDO,
  ASPHALT_ALBEDO,
  LinearSRGBColorSpace,
);

export type Settings = {
  gear: "down" | "up";
  switches: LightsSwitches;
  visibility_m: number;
  ev100: number;
};

// On the apron at night, every light on, in a light mist
export const START_SETTINGS: Settings = {
  gear: "down",
  switches: {
    navigation: true,
    anticollision: true,
    landing: true,
    taxi: true,
  },
  visibility_m: 4000,
  ev100: 3,
};

const SWITCHES: Record<keyof LightsSwitches, string> = {
  navigation: "position",
  anticollision: "strobes",
  landing: "landing",
  taxi: "taxi",
};

/**
 * The fighter on its wheels, its lights on its own nodes.
 * @param props The settings, and where to say what the lights are doing
 * @returns The model, its lights and the ground under it
 */
const LitFighter: FC<{
  settings: Settings;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ settings, readout }) => {
  const { scene, nodes, animations } = useGLTF(MODEL);
  const body = useRef<Group>(null);
  const lights = useRef<LightsHandle>(null);
  const { actions } = useAnimations(animations, body);

  useEffect(() => {
    scene.traverse((node) => {
      if (node.userData.visible_default === false) node.visible = false;
    });
  }, [scene]);

  // The ground where the tyres are, the model being on its wheels
  const ground_y = useMemo(() => {
    scene.updateMatrixWorld(true);

    return new Box3().setFromObject(scene).min.y;
  }, [scene]);

  // Down is where the model starts; up plays the retraction, down plays it
  // back
  useEffect(() => {
    const retract = actions.ANIM_Gear_Retract;

    if (!retract) return;

    retract.setLoop(LoopOnce, 1);
    retract.clampWhenFinished = true;
    retract.paused = false;
    retract.timeScale = settings.gear === "up" ? 1 : -1;

    if (!retract.isRunning()) {
      if (settings.gear === "up" && retract.time === 0) retract.reset();
      retract.play();
    }
  }, [actions, settings.gear]);

  // The anchors the model gives each light. The landing and taxi lights sit
  // on the nose gear's leg, and point along their anchors' -Z with it down
  const airframe = useMemo(() => {
    const node = (name: string) => nodes[name] as Object3D;

    return {
      navigation: [
        { side: "left", at: node("LIGHT_Nav_L_Anchor") },
        { side: "right", at: node("LIGHT_Nav_R_Anchor") },
        { side: "aft", at: node("LIGHT_Nav_Tail_C_Anchor") },
      ],
      anticollision: [
        { at: node("LIGHT_Strobe_Top_C_Anchor"), color: "white" },
        { at: node("LIGHT_Strobe_Bottom_C_Anchor"), color: "red", phaseS: 0.5 },
      ],
      beams: [
        { at: node("LIGHT_Landing_C_Anchor"), lamp: "landing", onGear: true },
        { at: node("LIGHT_Taxi_C_Anchor"), lamp: "taxi", onGear: true },
      ],
    } as const;
  }, [nodes]);

  const exposure = exposure_ev100(settings.ev100);
  const look = useMemo(() => ({ exposure }), [exposure]);

  useFrame(() => {
    const current = lights.current;
    const retract = actions.ANIM_Gear_Retract;

    if (!current) return;

    // How far down the gear is, from the retraction's clip
    const gear = retract ? 1 - retract.time / retract.getClip().duration : 1;

    current.setGear(gear);

    if (!readout.current) return;

    const [red, , blue] = current.extinction.aerosol.map(
      (aerosol, channel) => aerosol + current.extinction.rayleigh[channel],
    );

    readout.current.textContent =
      `gear ${(gear * 100).toFixed(0)} % down` +
      (gear < 0.999 ? ", landing and taxi lights held off" : "") +
      ` · a light 1 km off keeps ${(Math.exp(-red * 1000) * 100).toFixed(0)} % ` +
      `of its red, ${(Math.exp(-blue * 1000) * 100).toFixed(0)} % of its blue`;
  });

  return (
    <>
      <group ref={body}>
        <primitive object={scene} />
        <Lights
          ref={lights}
          airframe={airframe}
          switches={settings.switches}
          air={{ visibilityM: settings.visibility_m }}
          look={look}
        />
      </group>
      {/* A hemisphere light gives an upward face its intensity in lux */}
      <hemisphereLight
        args={["#ffffff", asphalt_bounce, APRON_LUX * exposure]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ground_y, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color={asphalt} roughness={0.9} metalness={0} />
      </mesh>
    </>
  );
};

/**
 * The gear, the switches, the mist and the exposure.
 * @param props The settings and how to change them
 * @returns The controls
 */
const LightsControls: FC<{
  settings: Settings;
  change: (next: Partial<Settings>) => void;
}> = ({ settings, change }) => (
  <div className="example-controls">
    <label>
      gear
      <select
        value={settings.gear}
        onChange={(event) =>
          change({ gear: event.target.value as Settings["gear"] })
        }
      >
        <option value="down">Down</option>
        <option value="up">Up</option>
      </select>
    </label>
    {(Object.keys(SWITCHES) as (keyof LightsSwitches)[]).map((key) => (
      <label key={key}>
        {SWITCHES[key]}
        <input
          type="checkbox"
          checked={settings.switches[key]}
          onChange={(event) =>
            change({
              switches: { ...settings.switches, [key]: event.target.checked },
            })
          }
        />
      </label>
    ))}
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
        min={-2}
        max={8}
        step={0.1}
        value={settings.ev100}
        onChange={(event) => change({ ev100: Number(event.target.value) })}
      />
    </label>
  </div>
);

/**
 * The docs' fighter on the apron at night, every light on.
 * @returns The example
 */
export const LightsExample: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  return (
    <Stage
      camera={[-26, 12, -20]}
      target={[0, -2, 0]}
      fov={40}
      floor={null}
      sky={false}
      overlay={
        <>
          <LightsControls settings={settings} change={change} />
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <LitFighter settings={settings} readout={readout} />
    </Stage>
  );
};

export default LightsExample;
