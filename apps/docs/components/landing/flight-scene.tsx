import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AfterburnerBatch,
  type AfterburnerBatchHandle,
} from "@aeronautic/afterburner/react";
import type { Flight } from "@aeronautic/core";
import { FlightProvider, useFlightStore } from "@aeronautic/core/react";
import { Contrails, type ContrailsHandle } from "@aeronautic/contrails/react";
import { ControlSurfaces } from "@aeronautic/controls/react";
import {
  Countermeasures,
  type CountermeasuresHandle,
} from "@aeronautic/countermeasures/react";
import { Lights, type LightsHandle } from "@aeronautic/lights/react";
import { WingVapor, type WingVaporHandle } from "@aeronautic/wing-vapor/react";
import {
  CloudLayer,
  useClouds,
  useWeather,
  Weather,
} from "@aeronautic/weather/react";
import { angle_of_attack_for_load } from "@aeronautic/wing-vapor/physics";
import {
  type FC,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Color,
  type DirectionalLight,
  Euler,
  type Group,
  type HemisphereLight,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { WebGPURenderer } from "three/webgpu";
import { airframe_only, Exhaust, useFighter } from "@/examples/fighter";
import {
  BLACKBODY_2000K_CD_M2,
  DAY_EXPOSURE,
  Grade,
  Reflections,
} from "@/examples/stage";
import { CAMERA_FAR_M } from "@/lib/camera";
import { NO_SHADOWS } from "@/lib/no-shadows";
import {
  AIR,
  air_at,
  CEILING_M,
  cruise_mach,
  FLOOR_M,
  HIGH_AIR,
  START_THROTTLE,
} from "./flight-plan";
import type { Keys, Levers } from "./pilot";

// The docs' fighter on a humid summer day, flown from the keyboard. It turns
// freely about its own axes but goes nowhere: the keys write a flight it only
// seems to fly, its speed following the throttle and its g and rates the
// stick, and everything on it reads that flight, the control surfaces, the
// plumes, the vapor, the contrails, the lights and the flares

// Where the sun is, for the skin and the vapor both
const SUN: [number, number, number] = [5, 10, 5];

export type Sky = "day" | "night";

// Where it is sent: low over the sea, or at the tropopause. A new one each
// time the button is pressed, so pressing it sends it there again however it
// has been flown since
export type Level = "low" | "high";
export type Jump = { level: Level };

// Where the camera goes when it climbs or descends: astern and to the right
// for the plumes down low, ahead and to the right up high, the trails
// running away behind it towards the sun
const VIEWS: Record<Level, [number, number, number]> = {
  low: [16, 5, 24],
  high: [30, 8, -45],
};

const SKIES = {
  day: {
    background: "#6f9fd8",
    hemisphere: 1.6,
    sun: 3,
    sunColor: "#ffffff",
    reflections: 0.35,
    look: {
      sunDirection: SUN,
      sunColor: [1, 0.96, 0.9],
      sunIntensity: 3,
      skyColor: [0.55, 0.68, 0.9],
      skyIntensity: 1,
    },
    // What the daylit sky leaves the camera, as in every example
    exposure: DAY_EXPOSURE,
  },
  night: {
    background: "#05070b",
    hemisphere: 0.25,
    sun: 0.5,
    sunColor: "#b8c8ff",
    reflections: 0.12,
    look: {
      sunDirection: SUN,
      sunColor: [0.7, 0.78, 1],
      sunIntensity: 0.6,
      skyColor: [0.08, 0.1, 0.18],
      skyIntensity: 0.15,
    },
    exposure: 8,
  },
} as const;

// How long the sky takes to go from day to night, in seconds
const FADE_S = 0.6;

// The clouds form in the same air the fighter flies in down low: its warmth
// and its humidity, so their base is that air's condensation level, a few
// hundred metres over the sea
const WEATHER_DAY = {
  temperatureOffsetK: AIR.temperatureOffsetK,
  surfaceHumidity: AIR.relativeHumidity,
};

// The sea under them, seen from above: water's albedo with the sun high,
// about 6 % (Payne 1972)
const SEA_ALBEDO = 0.06;
const SUN_SINE = SUN[1] / Math.hypot(...SUN);

/**
 * How far the sky is from day to night, shared by everything that fades with
 * it. Written each frame by `SkyFade`, read by whatever draws from it.
 */
type Dusk = {
  // Where it is headed, 0 for day and 1 for night
  target: number;

  // Where it is, eased, and whether that moved this frame
  night: number;
  moved: boolean;

  // How far along the fade, before easing
  linear: number;
};

const mix = (from: number, to: number, share: number) =>
  from + (to - from) * share;

const mix_rgb = (
  from: readonly number[],
  to: readonly number[],
  share: number,
): [number, number, number] => [
  mix(from[0], to[0], share),
  mix(from[1], to[1], share),
  mix(from[2], to[2], share),
];

const DAY_BACKGROUND = new Color(SKIES.day.background);
const NIGHT_BACKGROUND = new Color(SKIES.night.background);
const DAY_SUN = new Color(SKIES.day.sunColor);
const NIGHT_SUN = new Color(SKIES.night.sunColor);

/**
 * Fades the canvas's own sky: its background, its lights and what the metal
 * reflects. Nothing rebuilds, so the switch is as cheap as any other frame.
 * @param props The shared fade, and the lights it dims
 * @returns Nothing
 */
const SkyFade: FC<{
  dusk: Dusk;
  hemisphere: RefObject<HemisphereLight | null>;
  sun: RefObject<DirectionalLight | null>;
}> = ({ dusk, hemisphere, sun }) => {
  const scene = useThree((three) => three.scene);
  const background = useMemo(() => new Color(), []);
  const first = useRef(true);

  // Ahead of everything that reads it
  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1) / FADE_S;
    const linear =
      dusk.target > dusk.linear
        ? Math.min(dusk.linear + step, dusk.target)
        : Math.max(dusk.linear - step, dusk.target);

    dusk.moved = first.current || linear !== dusk.linear;
    dusk.linear = linear;
    dusk.night = linear * linear * (3 - 2 * linear);
    first.current = false;

    if (!dusk.moved) return;

    const night = dusk.night;

    scene.background = background.lerpColors(
      DAY_BACKGROUND,
      NIGHT_BACKGROUND,
      night,
    );
    scene.environmentIntensity = mix(
      SKIES.day.reflections,
      SKIES.night.reflections,
      night,
    );

    if (hemisphere.current) {
      hemisphere.current.intensity = mix(
        SKIES.day.hemisphere,
        SKIES.night.hemisphere,
        night,
      );
    }

    if (sun.current) {
      sun.current.intensity = mix(SKIES.day.sun, SKIES.night.sun, night);
      sun.current.color.lerpColors(DAY_SUN, NIGHT_SUN, night);
    }
  }, -1);

  return null;
};

const DEG = Math.PI / 180;

const haze = new Color();

/**
 * The clouds' light, as the vapor's: the sun and the sky the scene's lights
 * fade between, the sea lit by both under them, and the background as the
 * air's own colour far off.
 * @param night How far the sky is to night, 0 to 1
 * @returns The weather's look
 */
const cloud_look = (night: number) => {
  const day = SKIES.day.look;
  const dark = SKIES.night.look;
  const sun = mix_rgb(day.sunColor, dark.sunColor, night).map(
    (value) => value * mix(day.sunIntensity, dark.sunIntensity, night),
  ) as [number, number, number];
  const sky = mix_rgb(day.skyColor, dark.skyColor, night).map(
    (value) => value * mix(day.skyIntensity, dark.skyIntensity, night),
  ) as [number, number, number];

  haze.lerpColors(DAY_BACKGROUND, NIGHT_BACKGROUND, night);

  return {
    sunDirection: SUN,
    sun,
    sky,
    // A Lambertian sea's radiance, under the sun and the whole dome
    ground: sun.map(
      (value, i) =>
        (SEA_ALBEDO * (value * SUN_SINE + Math.PI * sky[i])) / Math.PI,
    ) as [number, number, number],
    haze: haze.toArray() as [number, number, number],
  };
};

const DAY_CLOUDS = cloud_look(0);

const forward = new Vector3();

// Where the plumes and the vapor start; `SkyFade` takes them on from there
const DAY_PROFILE = { exposure: SKIES.day.exposure };

// The plumes' exposure is per 2000 K blackbody's radiance, the lights' per
// cd/m²: the same camera, in the lights' units
const lights_exposure = (plume_exposure: number) =>
  plume_exposure / BLACKBODY_2000K_CD_M2;
const DAY_LIGHTS_LOOK = { exposure: lights_exposure(SKIES.day.exposure) };
// The flares' smoke lit by the sun and the sky the trails are
const DAY_FLARES_LOOK = { ...DAY_LIGHTS_LOOK, ...SKIES.day.look };

// How the fake flies: what the gear, the flaps and the air brake cost off the
// Mach number its throttle settles at, from `flight-plan`
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Pilot = {
  keys: RefObject<Keys>;
  levers: Levers;
  flares: number;
  chaff: number;
};

/**
 * The fighter, turning in place at the keyboard's rates and pitched up by its
 * angle of attack, with the keyboard's flight written to it each frame.
 * @param props The sky, and the pilot's keys and levers
 * @returns The model, its moving parts, its plumes and its vapor
 */
const Fighter: FC<{ dusk: Dusk } & Pilot> = ({
  dusk,
  keys,
  levers,
  flares,
  chaff,
}) => {
  const { scene, nodes, animations } = useFighter();
  const flight = useFlightStore();
  const attitude = useRef<Group>(null);
  const body = useRef<Group>(null);
  const vapor = useRef<WingVaporHandle>(null);
  const batch = useRef<AfterburnerBatchHandle>(null);
  const trails = useRef<ContrailsHandle>(null);
  const lights = useRef<LightsHandle>(null);
  const countermeasures = useRef<CountermeasuresHandle>(null);
  const weather = useWeather();

  // Each press of V lets the program go as chaff; its first count, nothing
  const chaffed = useRef(chaff);

  useEffect(() => {
    if (chaff === chaffed.current) return;

    chaffed.current = chaff;
    countermeasures.current?.fire({ payload: "chaff" });
  }, [chaff]);

  // The model's nozzle exits: the trails start where they are
  const airframe = useMemo(
    () => ({ engines: [nodes.FX_Exhaust_L, nodes.FX_Exhaust_R] as Object3D[] }),
    [nodes],
  );

  // Its lights on the anchors the model gives them. The landing and taxi
  // lamps are on the nose leg, lit only with the gear down
  const lamps = useMemo(() => {
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

    // The plumes' exposure, and the vapor's, the trails' and the smoke's
    // light, follow the sky as it fades
    if (dusk.moved) {
      const night = dusk.night;
      const day = SKIES.day.look;
      const dark = SKIES.night.look;
      const look = {
        sunColor: mix_rgb(day.sunColor, dark.sunColor, night),
        sunIntensity: mix(day.sunIntensity, dark.sunIntensity, night),
        skyColor: mix_rgb(day.skyColor, dark.skyColor, night),
        skyIntensity: mix(day.skyIntensity, dark.skyIntensity, night),
      };

      const exposure = mix(SKIES.day.exposure, SKIES.night.exposure, night);

      batch.current?.updateProfile({ exposure });
      lights.current?.updateLook({ exposure: lights_exposure(exposure) });
      countermeasures.current?.updateLook({
        ...look,
        exposure: lights_exposure(exposure),
      });
      vapor.current?.updateLook(look);
      trails.current?.updateLook(look);
      weather?.set({ look: cloud_look(night) });
    }

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

    // In the air it is flying in, low or high
    const airspeed_m_s = state.mach * flight.values.soundMPerS;
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
      ? angle_of_attack_for_load(
          airframe,
          load_factor,
          airspeed_m_s,
          flight.air,
        )
      : 0;

    state.alpha = clamp(alpha, -8 * DEG, 25 * DEG);

    const roll_rate = ROLL_RATE * state.roll * Math.min(authority, 1);
    const pitch_rate =
      state.pitch *
      (state.pitch > 0 ? PULL_RATE : PUSH_RATE) *
      Math.min(authority, 1);
    const yaw_rate = YAW_RATE * state.yaw;

    flight.set({
      airspeedMPerS: airspeed_m_s,
      angleOfAttackRad: state.alpha,
      // Right pedal yaws the nose right, the air then from the left
      sideslipRad: -3 * DEG * state.yaw,
      loadFactor: load_factor,
      rollRateRadPerS: roll_rate,
      pitchRateRadPerS: pitch_rate,
      yawRateRadPerS: yaw_rate,
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

    // It goes nowhere, so the air goes by it instead. Its flight path is the
    // attitude's nose, the body pitched up off it by the angle of attack, so
    // it climbs at the airspeed's share along the vertical, the sine of the
    // path's angle, and the weather goes by along its heading at the rest
    attitude.current.getWorldDirection(forward).negate();

    const altitude_m = clamp(
      flight.values.altitudeM + forward.y * airspeed_m_s * delta,
      FLOOR_M,
      CEILING_M,
    );

    if (altitude_m !== flight.values.altitudeM) flight.set(air_at(altitude_m));

    if (weather) {
      weather.velocity[0] = forward.x * airspeed_m_s;
      weather.velocity[1] = forward.z * airspeed_m_s;
    }
  });

  return (
    <AfterburnerBatch ref={batch} preset="afterburner" profile={DAY_PROFILE}>
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
            captureFilter={airframe_only}
            look={SKIES.day.look}
            forward={[0, 0, -1]}
          />
          {/* Its flight and its air are the shared flight's */}
          <Contrails ref={trails} airframe={airframe} look={SKIES.day.look} />
          {/* Its gear and its altitude are the shared flight's too */}
          <Lights ref={lights} airframe={lamps} look={DAY_LIGHTS_LOOK} />
          {/* Its dispensers are the defaults, measured off this model */}
          <Countermeasures
            ref={countermeasures}
            look={DAY_FLARES_LOOK}
            fire={flares}
          />
        </group>
      </group>
    </AfterburnerBatch>
  );
};

/**
 * Moves the camera to the level's view when the button sends it there, not
 * before.
 * @param props Where it was last sent
 * @returns Nothing
 */
const Viewpoint: FC<{ jump: Jump }> = ({ jump }) => {
  const camera = useThree((three) => three.camera);
  const controls = useThree((three) => three.controls) as {
    update: () => void;
  } | null;
  const shown = useRef(jump);

  useEffect(() => {
    if (shown.current === jump) return;

    shown.current = jump;
    camera.position.set(...VIEWS[jump.level]);
    controls?.update();
  }, [camera, controls, jump]);

  return null;
};

/**
 * The frame graded with the weather's clouds in front of the sky, and the
 * fighter's effects drawn over them.
 * @param props What flies in them
 * @returns It; it takes over rendering
 */
const CloudyGrade: FC<{ children: ReactNode }> = ({ children }) => (
  <Grade clouds={useClouds({ quality: "low" })}>{children}</Grade>
);

/**
 * The landing page's sky: the fighter, fullscreen, flown from the keyboard
 * and looked round with the mouse.
 * @param props Day or night, where it was sent, the flight, and the pilot's keys
 *   and levers
 * @returns The canvas
 */
const FlightScene: FC<{ sky: Sky; jump: Jump; flight: Flight } & Pilot> = ({
  sky,
  jump,
  flight,
  keys,
  levers,
  flares,
  chaff,
}) => {
  const dusk = useMemo<Dusk>(
    () => ({ target: 0, night: 0, moved: true, linear: 0 }),
    [],
  );
  const hemisphere = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);

  // Read by the fade on its next frame
  dusk.target = sky === "night" ? 1 : 0;

  // The air it is sent to, read by everything on it from the flight; flown
  // up or down from there, the air at each altitude on the way
  useEffect(() => {
    flight.set(jump.level === "high" ? HIGH_AIR : AIR);
  }, [flight, jump]);

  return (
    <Canvas
      dpr={[1, 1.25]}
      shadows={NO_SHADOWS}
      // Astern and to the right, the plumes towards the camera
      camera={{ position: VIEWS.low, fov: 40, near: 0.1, far: CAMERA_FAR_M }}
      gl={async (props) => {
        const renderer = new WebGPURenderer({
          ...(props as object),
          antialias: false,
        });

        await renderer.init();

        return renderer;
      }}
    >
      <SkyFade dusk={dusk} hemisphere={hemisphere} sun={sun} />
      <hemisphereLight
        ref={hemisphere}
        args={["#8090b0", "#101010", SKIES.day.hemisphere]}
      />
      <directionalLight
        ref={sun}
        position={SUN}
        intensity={SKIES.day.sun}
        color={SKIES.day.sunColor}
      />
      <Reflections intensity={SKIES.day.reflections} />
      {/* Context doesn't cross into the canvas: the same flight again. The
          weather takes its altitude from it, but leaves its air alone */}
      <FlightProvider flight={flight}>
        <Weather day={WEATHER_DAY} look={DAY_CLOUDS} couple={false}>
          <CloudLayer genus="cumulus-mediocris" />
          <CloudyGrade>
            <Suspense fallback={null}>
              <Fighter
                dusk={dusk}
                keys={keys}
                levers={levers}
                flares={flares}
                chaff={chaff}
              />
            </Suspense>
          </CloudyGrade>
        </Weather>
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
      <Viewpoint jump={jump} />
    </Canvas>
  );
};

export default FlightScene;
