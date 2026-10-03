import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  angle_of_attack_for_load,
  moist_air,
  WingVapor,
  type WingVaporCore,
} from "r3f-wing-vapor";
import { type FC, type RefObject, useEffect, useRef, useState } from "react";
import { type Group, LoopOnce, type Mesh, type Object3D } from "three";
import { base_path } from "@/lib/shared";
import { Stage } from "./stage";

const MODEL = `${base_path}/fighter.glb`;

// The same sun as the stage's directional light, so the vapour is lit as the
// skin is
const SUN: [number, number, number] = [5, 10, 5];

// Three ways to make a wing fog, each a different part of the physics
const SCENARIOS = {
  pull: {
    label: "Hard pull: 7 g at Mach 0.5",
    mach: 0.5,
    g: 7,
    humidity: 0.9,
    roll_deg_s: 0,
  },
  roll: {
    label: "Rolling pull: 5 g at Mach 0.5, rolling",
    mach: 0.5,
    g: 5,
    humidity: 0.9,
    roll_deg_s: 240,
  },
  alpha: {
    label: "High alpha: 4 g at Mach 0.4",
    mach: 0.4,
    g: 4,
    humidity: 0.9,
    roll_deg_s: 0,
  },
  transonic: {
    label: "Transonic pass: 2 g at Mach 0.97",
    mach: 0.97,
    g: 2,
    humidity: 0.8,
    roll_deg_s: 0,
  },
  shock: {
    label: "Shock on the wing: 5 g at Mach 0.93",
    mach: 0.93,
    g: 5,
    humidity: 0.6,
    roll_deg_s: 0,
  },
} as const;

type Scenario = keyof typeof SCENARIOS;

// A humid summer day, low over the sea
const AIR = { altitude_m: 300, temperature_offset_k: 10 };

type Flight = {
  mach: number;
  g: number;
  humidity: number;
  roll_deg_s: number;
};

// Not the shape the air flies round: the gear and its doors, hanging down in
// the model's rest pose, and the pylons
const NOT_AIRFRAME =
  /^(GEAR_|DOOR_|HINGE_Gear|CTRL_Gear|HINGE_Door|CTRL_Door|PYLON_|BAY_)/;

/**
 * Whether a mesh of the fighter is part of its airframe.
 * @param mesh The mesh
 * @returns Whether to measure it
 */
const airframe_only = (mesh: Mesh): boolean => {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible || NOT_AIRFRAME.test(node.name)) return false;
  }

  return true;
};

/**
 * The fighter, pitched up by its angle of attack so it flies level, with the
 * vapour on its origin.
 * @param props The flight, and where to say what it is doing
 * @returns The model and its vapour
 */
const Fighter: FC<{
  flight: Flight;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ flight, readout }) => {
  const { scene, animations } = useGLTF(MODEL);
  const body = useRef<Group>(null);
  const vapor = useRef<WingVaporCore>(null);
  const roll = useRef<Group>(null);
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

  useFrame(({ clock }, delta) => {
    const current = vapor.current;

    if (!current || !body.current) return;

    // A flight model knows the g; the vapour wants the angle of attack
    const air = moist_air(
      AIR.altitude_m,
      flight.humidity,
      AIR.temperature_offset_k,
    );
    const airspeed_m_s = flight.mach * air.sound_m_s;

    // Breathing a little round the asked-for load, as a real pull does
    const g = flight.g * (1 + 0.04 * Math.sin(clock.elapsedTime * 0.9));
    const alpha = angle_of_attack_for_load(
      current.airframe,
      g,
      airspeed_m_s,
      air,
    );

    current.update_air({ relative_humidity: flight.humidity });
    current.update_flight({ airspeed_m_s, angle_of_attack_rad: alpha });

    // The flight path is level: the nose is up by the angle of attack
    body.current.rotation.x = alpha;

    // Rolling about the flight path, which is -Z: the trails, laid in the air
    // it flew through, corkscrew behind it
    if (roll.current) {
      roll.current.rotation.z += ((flight.roll_deg_s * Math.PI) / 180) * delta;
    }

    if (readout.current) {
      const state = current.state;

      readout.current.textContent =
        `Mach ${state.flight.mach.toFixed(2)} · ${state.flight.load_factor.toFixed(1)} g · ` +
        `α ${((alpha * 180) / Math.PI).toFixed(1)}° · ` +
        `dew point ${(state.air.temperature_k - state.air.dew_point_k).toFixed(1)} K below the air`;
    }
  });

  return (
    <group ref={roll}>
      <group ref={body}>
        <primitive object={scene} />
        {/*
        The wing and body are measured off the model itself, by six depth
        views, in the frame of the model's origin, which flies -Z
      */}
        <WingVapor
          ref={vapor}
          capture={scene}
          capture_filter={airframe_only}
          air={AIR}
          look={{ sun_direction: SUN }}
          forward={[0, 0, -1]}
        />
      </group>
    </group>
  );
};

/**
 * Wing vapour on the docs' fighter, in four flight conditions.
 * @returns The example
 */
export const WingVaporExample: FC = () => {
  const [scenario, set_scenario] = useState<Scenario>("pull");
  const [humidity, set_humidity] = useState<number>(SCENARIOS.pull.humidity);
  const readout = useRef<HTMLSpanElement>(null);

  const chosen = SCENARIOS[scenario];

  return (
    <Stage
      camera={[-20, 9, -14]}
      target={[0, 0, 4]}
      floor={null}
      reflections
      daylight
      overlay={
        <>
          <div className="example-controls">
            <label>
              flight
              <select
                value={scenario}
                onChange={(event) => {
                  const next = event.target.value as Scenario;

                  set_scenario(next);
                  set_humidity(SCENARIOS[next].humidity);
                }}
              >
                {Object.entries(SCENARIOS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              humidity {(humidity * 100).toFixed(0)} %
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={humidity}
                onChange={(event) => set_humidity(Number(event.target.value))}
              />
            </label>
          </div>
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Fighter
        flight={{
          mach: chosen.mach,
          g: chosen.g,
          humidity,
          roll_deg_s: chosen.roll_deg_s,
        }}
        readout={readout}
      />
    </Stage>
  );
};

export default WingVaporExample;
