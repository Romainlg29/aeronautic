import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { AfterburnerBatch } from "@aeronautic/afterburner";
import type { Flight } from "@aeronautic/core";
import { FlightProvider, useFlightStore } from "@aeronautic/core/react";
import { ControlSurfaces } from "@aeronautic/controls/react";
import {
  angle_of_attack_for_load,
  moist_air,
  WingVapor,
  type WingVaporCore,
} from "@aeronautic/wing-vapor";
import { type FC, type RefObject, Suspense, useMemo, useRef } from "react";
import { Euler, type Group, Quaternion } from "three";
import { WebGPURenderer } from "three/webgpu";
import { airframe_only, Exhaust, useFighter } from "@/examples/fighter";
import { Grade, Reflections } from "@/examples/stage";
import { NO_SHADOWS } from "@/lib/no-shadows";
import type { Keys, Levers } from "./pilot";

// The docs' fighter on a humid summer day, flown from the keyboard. It turns
// freely about its own axes but goes nowhere: the keys write a flight it only
// seems to fly, its speed following the throttle and its g and rates the
// stick, and everything on it reads that flight, the control surfaces, the
// plumes and the vapor

// A humid summer day, low over the sea
const AIR = {
  altitude_m: 300,
  temperature_offset_k: 10,
  relative_humidity: 0.88,
};
const MOIST = moist_air(
  AIR.altitude_m,
  AIR.relative_humidity,
  AIR.temperature_offset_k,
);

// Where the sun is, for the skin and the vapor both
const SUN: [number, number, number] = [5, 10, 5];

export type Sky = "day" | "night";

const SKIES = {
  day: {
    background: "#6f9fd8",
    hemisphere: 1.6,
    sun: 3,
    sun_color: "#ffffff",
    reflections: 0.35,
    look: {
      sun_direction: SUN,
      sun_color: [1, 0.96, 0.9],
      sun_intensity: 3,
      sky_color: [0.55, 0.68, 0.9],
      sky_intensity: 1,
    },
    // A plume is far dimmer than the daylit sky round it
    exposure: 6,
  },
  night: {
    background: "#05070b",
    hemisphere: 0.25,
    sun: 0.5,
    sun_color: "#b8c8ff",
    reflections: 0.12,
    look: {
      sun_direction: SUN,
      sun_color: [0.7, 0.78, 1],
      sun_intensity: 0.6,
      sky_color: [0.08, 0.1, 0.18],
      sky_intensity: 0.15,
    },
    exposure: 8,
  },
} as const;

const DEG = Math.PI / 180;

// How the fake flies. The Mach number it settles at, at idle, at military
// power and at full reheat, less what the gear, the flaps and the air brake
// cost. Reheat takes it through Mach one and on past where the vapor cone
// fades, about Mach 1.25 to 1.6
const IDLE_MACH = 0.3;
const DRY_MACH = 0.9;
const REHEAT_MACH = 1.8;
// Where it starts: lit, just through Mach one, the cone still on it
const START_THROTTLE = 1.02;
const DRAG_MACH = { gear: 0.1, flaps: 0.05, airbrake: 0.15 };
// How long it takes to get most of the way to that speed, in seconds
const SPEED_S = 4;
// The g a stick held hard over pulls, back and forward, at Mach 0.9
const PULL_G = 8;
const PUSH_G = 3;
// How fast the throttle runs with its key held, in throttle a second
const THROTTLE_RATE = 0.45;
// How long the stick takes to get most of the way over, in seconds
const STICK_S = 0.15;
// Its rates, stick and pedals hard over at Mach 0.9, in rad/s: quicker than
// the g it shows would turn it, for the feel of it
const ROLL_RATE = 4;
const PULL_RATE = 0.55;
const PUSH_RATE = 0.3;
const YAW_RATE = 0.3;

/**
 * How far to move towards a target this frame, easing in over a time.
 * @param delta The frame's length, in seconds
 * @param time_s The time to cover about two thirds of the way, in seconds
 * @returns The share of the way to go
 */
const ease = (delta: number, time_s: number) => 1 - Math.exp(-delta / time_s);

/**
 * The Mach number a throttle setting settles at, clean: idle to military
 * power, then on through the reheat.
 * @param throttle The throttle, 0 to 1.1
 * @returns The Mach number
 */
const cruise_mach = (throttle: number) =>
  throttle <= 1
    ? IDLE_MACH + (DRY_MACH - IDLE_MACH) * throttle
    : DRY_MACH + (REHEAT_MACH - DRY_MACH) * ((throttle - 1) / 0.1);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Pilot = { keys: RefObject<Keys>; levers: Levers };

/**
 * The fighter, turning in place at the keyboard's rates and pitched up by its
 * angle of attack, with the keyboard's flight written to it each frame.
 * @param props The sky, and the pilot's keys and levers
 * @returns The model, its moving parts, its plumes and its vapor
 */
const Fighter: FC<{ sky: Sky } & Pilot> = ({ sky, keys, levers }) => {
  const { scene, animations } = useFighter();
  const flight = useFlightStore();
  const attitude = useRef<Group>(null);
  const body = useRef<Group>(null);
  const vapor = useRef<WingVaporCore>(null);

  // What the fake carries from frame to frame
  const state = useMemo(
    () => ({
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: START_THROTTLE,
      mach: cruise_mach(START_THROTTLE),
      alpha: 0,
      euler: new Euler(),
      turn: new Quaternion(),
    }),
    [],
  );

  useFrame((_, frame_delta) => {
    const delta = Math.min(frame_delta, 0.1);
    const input = keys.current;

    if (!flight || !attitude.current || !body.current) return;

    // The stick and pedals sweep over and spring back, as a keyboard's do
    state.pitch += (input.pitch - state.pitch) * ease(delta, STICK_S);
    state.roll += (input.roll - state.roll) * ease(delta, STICK_S);
    state.yaw += (input.yaw - state.yaw) * ease(delta, STICK_S);
    state.throttle = clamp(
      state.throttle + input.throttle * THROTTLE_RATE * delta,
      0,
      1.1,
    );

    // The speed it settles at, from the throttle and what's hanging out
    const mach_target =
      cruise_mach(state.throttle) -
      DRAG_MACH.gear * levers.gear -
      DRAG_MACH.flaps * levers.flaps -
      DRAG_MACH.airbrake * levers.airbrake;

    state.mach += (mach_target - state.mach) * ease(delta, SPEED_S);

    const airspeed_m_s = state.mach * MOIST.sound_m_s;
    // The g a full stick gives grows with the dynamic pressure
    const authority = (state.mach / 0.9) ** 2;
    const load_factor = clamp(
      1 + state.pitch * (state.pitch > 0 ? PULL_G : PUSH_G) * authority,
      -PUSH_G,
      PULL_G + 1,
    );

    // The angle of attack it takes the wing to pull that g, at that speed
    const airframe = vapor.current?.airframe;
    const alpha = airframe
      ? angle_of_attack_for_load(airframe, load_factor, airspeed_m_s, MOIST)
      : 0;

    state.alpha = clamp(alpha, -8 * DEG, 25 * DEG);

    const roll_rate = ROLL_RATE * state.roll * Math.min(authority, 1);
    const pitch_rate =
      state.pitch *
      (state.pitch > 0 ? PULL_RATE : PUSH_RATE) *
      Math.min(authority, 1);
    const yaw_rate = YAW_RATE * state.yaw;

    flight.set({
      airspeed_m_s,
      angle_of_attack_rad: state.alpha,
      // Right pedal yaws the nose right, the air then from the left
      sideslip_rad: -3 * DEG * state.yaw,
      load_factor,
      roll_rate_rad_s: roll_rate,
      pitch_rate_rad_s: pitch_rate,
      yaw_rate_rad_s: yaw_rate,
      throttle: state.throttle,
      roll: state.roll,
      pitch: state.pitch,
      yaw: state.yaw,
      ...levers,
    });

    // It turns where it stands, about its own axes: rolling right about -Z,
    // pitching up about +X, yawing right about -Y
    state.euler.set(pitch_rate * delta, -yaw_rate * delta, -roll_rate * delta);
    state.turn.setFromEuler(state.euler);
    attitude.current.quaternion.multiply(state.turn).normalize();

    // The nose is up off the flight path by the angle of attack
    body.current.rotation.x = state.alpha;
  });

  return (
    <AfterburnerBatch
      preset="afterburner"
      profile={{ exposure: SKIES[sky].exposure }}
    >
      <group ref={attitude}>
        <group ref={body}>
          <primitive object={scene} />
          <ControlSurfaces
            object={scene}
            animations={animations}
            exhaust={<Exhaust />}
          />
          <WingVapor
            ref={vapor}
            capture={scene}
            capture_filter={airframe_only}
            look={SKIES[sky].look}
            forward={[0, 0, -1]}
          />
        </group>
      </group>
    </AfterburnerBatch>
  );
};

/**
 * The landing page's sky: the fighter, fullscreen, flown from the keyboard
 * and looked round with the mouse.
 * @param props Day or night, the flight, and the pilot's keys and levers
 * @returns The canvas
 */
const FlightScene: FC<{ sky: Sky; flight: Flight } & Pilot> = ({
  sky,
  flight,
  keys,
  levers,
}) => {
  const lights = SKIES[sky];

  return (
    <Canvas
      dpr={[1, 1.25]}
      shadows={NO_SHADOWS}
      // Astern and to the right, the plumes towards the camera
      camera={{ position: [16, 5, 24], fov: 40, near: 0.1, far: 5000 }}
      gl={async (props) => {
        const renderer = new WebGPURenderer({
          ...(props as object),
          antialias: false,
        });

        await renderer.init();

        return renderer;
      }}
    >
      <color attach="background" args={[lights.background]} />
      <hemisphereLight args={["#8090b0", "#101010", lights.hemisphere]} />
      <directionalLight
        position={SUN}
        intensity={lights.sun}
        color={lights.sun_color}
      />
      <Reflections intensity={lights.reflections} />
      {/* Context doesn't cross into the canvas: the same flight again */}
      <FlightProvider flight={flight}>
        <Suspense fallback={null}>
          <Fighter sky={sky} keys={keys} levers={levers} />
        </Suspense>
      </FlightProvider>
      <OrbitControls
        // Looking a little below it, so it sits above the page's title
        target={[0, -3, 4]}
        enablePan={false}
        enableDamping
        minDistance={10}
        maxDistance={90}
        makeDefault
      />
      <Grade />
    </Canvas>
  );
};

export default FlightScene;
