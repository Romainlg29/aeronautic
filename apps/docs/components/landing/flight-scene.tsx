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
import { make_climate } from "@aeronautic/weather";
import { useWeather, Weather } from "@aeronautic/weather/react";
import { angle_of_attack_for_load } from "@aeronautic/wing-vapor/physics";
import {
  type FC,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Euler, type Group, type Object3D, Quaternion, Vector3 } from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  Atmosphere,
  type AtmosphereLighting,
  LUMINANCE_SCALE,
  PLUME_EXPOSURE,
  useAtmosphereLighting,
} from "@/examples/atmosphere";
import {
  airframe_only,
  Exhaust,
  useFighter,
  useLensesUnlit,
} from "@/examples/fighter";
import { BLACKBODY_2000K_CD_M2 } from "@/examples/stage";
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

// The sun where the skin's light came from before, `SUN`: its height over
// the horizon, and its bearing round it from north, +X, towards east, +Z, as
// takram's frame has them
const DAY_SUN_DEG =
  (Math.atan2(SUN[1], Math.hypot(SUN[0], SUN[2])) * 180) / Math.PI;
const SUN_AZIMUTH_DEG = (Math.atan2(SUN[2], SUN[0]) * 180) / Math.PI;

// By night, the sun in the middle of nautical twilight, 6° to 12° under the
// horizon: takram's sky has no moon and no stars, so this is as dark as it
// draws by the sun alone with the horizon still to be seen
const NIGHT_SUN_DEG = -9;

// How long the sky takes to go from day to night, in seconds
const FADE_S = 0.6;

// The clouds form over a fair day at sea, as warm as the fighter's air. The
// mixed layer's humidity is the oceans' at the surface, 0.75 to 0.8 (Dai
// 2006), at its lower end: Sundqvist's cover is then 30 % of the sky, the
// most fair-weather cumulus cover (Neggers et al. 2003), and too dry for a
// deck. The fighter's own 0.88 is a moist patch, there for its vapour; as
// the mean of the whole sky it would cover half of it. Their base is that
// air's condensation level, half a kilometre over the sea. Here dense,
// there thin, as the air is from place to place
const LANDING_HUMIDITY = 0.75;

const WEATHER_CLIMATE = make_climate("fair", {
  temperatureOffsetK: AIR.temperatureOffsetK,
  airMass: "maritime",
  fields: { humidity: { mean: LANDING_HUMIDITY } },
});

// The sea under it all, seen from above: water's albedo with the sun high,
// about 6 % (Payne 1972)
const SEA_ALBEDO = 0.06;

// What the camera's meter reads off the flames: about half a percent of the
// frame, the two plumes as the landing frames them (an estimate), at a 2000 K
// blackbody's radiance, the plumes' unit. By day it hardly moves the camera;
// by night it holds it where the flames leave it, the sky going dark round
// them instead of the camera opening up until their glare fills the frame
const FLAME_SHARE = 0.005;
const METERED_FLAME_CD_M2 = FLAME_SHARE * BLACKBODY_2000K_CD_M2;

// The plumes, in units of a 2000 K blackbody's radiance, and the lights, in
// cd/m², each at the atmosphere's exposure
const PLUME_PROFILE = { exposure: PLUME_EXPOSURE };
const LIGHTS_LOOK = { exposure: LUMINANCE_SCALE };

/**
 * The light the vapour, the trails and the flares' smoke are lit by: the
 * atmosphere's sun as an irradiance and its sky as a radiance, both already
 * in its units.
 * @param lighting The light at the aircraft
 * @returns Their looks
 */
const effect_looks = (lighting: AtmosphereLighting) => {
  const light = {
    sunDirection: lighting.sunDirection,
    sunColor: lighting.sun,
    sunIntensity: 1,
    skyColor: lighting.sky,
    skyIntensity: 1,
  };

  return { light, flares: { ...light, ...LIGHTS_LOOK } };
};

const DEG = Math.PI / 180;

const forward = new Vector3();

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
 * @param props The pilot's keys and levers
 * @returns The model, its moving parts, its plumes and its vapor, in the
 *   atmosphere's light
 */
const Fighter: FC<Pilot> = ({ keys, levers, flares, chaff }) => {
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

  // Rendered only once the atmosphere has measured its light, by `Lit`
  const lighting = useAtmosphereLighting() as AtmosphereLighting;
  const looks = useMemo(() => effect_looks(lighting), [lighting]);

  // `<Lights>` draws the lenses' glow itself
  useLensesUnlit(scene);

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
    <AfterburnerBatch ref={batch} preset="afterburner" profile={PLUME_PROFILE}>
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
            look={looks.light}
            forward={[0, 0, -1]}
          />
          {/* Its flight and its air are the shared flight's */}
          <Contrails ref={trails} airframe={airframe} look={looks.light} />
          {/* Its gear and its altitude are the shared flight's too */}
          <Lights ref={lights} airframe={lamps} look={LIGHTS_LOOK} />
          {/* Its dispensers are the defaults, measured off this model */}
          <Countermeasures
            ref={countermeasures}
            look={looks.flares}
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
 * Takram's atmosphere round the fighter, its clouds the weather's, the sun
 * going down under the horizon for the night and up again for the day.
 * @param props Day or night, and what flies in it
 * @returns It; it takes over rendering
 */
const LandingSky: FC<{ sky: Sky; children: ReactNode }> = ({
  sky,
  children,
}) => {
  const weather = useWeather();
  const night = sky === "night" ? 1 : 0;
  const fade = useRef(night);
  const [elevation_deg, set_elevation_deg] = useState(() =>
    night ? NIGHT_SUN_DEG : DAY_SUN_DEG,
  );

  // Eased over the fade, the sky measured again as the sun goes
  useFrame((_, delta) => {
    if (fade.current === night) return;

    const step = Math.min(delta, 0.1) / FADE_S;
    const linear =
      night > fade.current
        ? Math.min(fade.current + step, night)
        : Math.max(fade.current - step, night);
    const eased = linear * linear * (3 - 2 * linear);

    fade.current = linear;
    set_elevation_deg(DAY_SUN_DEG + (NIGHT_SUN_DEG - DAY_SUN_DEG) * eased);
  });

  return (
    <Atmosphere
      sunElevationDeg={elevation_deg}
      sunAzimuthDeg={SUN_AZIMUTH_DEG}
      groundAlbedo={SEA_ALBEDO}
      meteredCdM2={METERED_FLAME_CD_M2}
      weather={weather ?? undefined}
      cloudQuality="low"
    >
      {children}
    </Atmosphere>
  );
};

/**
 * What is lit by the atmosphere, once it has measured its light.
 * @param props What it lights
 * @returns It, or nothing before
 */
const Lit: FC<{ children: ReactNode }> = ({ children }) =>
  useAtmosphereLighting() ? children : null;

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
      {/* Context doesn't cross into the canvas: the same flight again. The
          weather takes its altitude from it, but leaves its air alone */}
      <FlightProvider flight={flight}>
        <Weather climate={WEATHER_CLIMATE} couple={false}>
          <LandingSky sky={sky}>
            <Lit>
              <Suspense fallback={null}>
                <Fighter
                  keys={keys}
                  levers={levers}
                  flares={flares}
                  chaff={chaff}
                />
              </Suspense>
            </Lit>
          </LandingSky>
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
