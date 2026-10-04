import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Afterburner,
  AfterburnerBatch,
  type AfterburnerBatchCore,
  type AfterburnerHandle,
} from "@aeronautic/afterburner";
import {
  angle_of_attack_for_load,
  moist_air,
  WingVapor,
  type WingVaporCore,
} from "@aeronautic/wing-vapor";
import {
  type FC,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  type Group,
  LoopOnce,
  Matrix4,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import { WebGPURenderer } from "three/webgpu";
import { Grade, Reflections } from "@/examples/stage";
import { NO_SHADOWS } from "@/lib/no-shadows";
import { base_path } from "@/lib/shared";

// The docs' fighter flying a figure of eight over the sea on a humid summer
// day: fast and straight through the crossing, for the vapor cone, and hard
// turns at the ends, for the tip trails and the vapor over the wing. Its bank
// and its g come out of the path's curvature, as a real one's would

const MODEL = `${base_path}/fighter.glb`;

const G = 9.81;

// A humid summer day, low over the sea
const AIR = { altitude_m: 300, temperature_offset_k: 10 };
const HUMIDITY = 0.88;
const SOUND_M_S = moist_air(
  AIR.altitude_m,
  HUMIDITY,
  AIR.temperature_offset_k,
).sound_m_s;

// The eight: A across, B along, rising and falling by RISE, in metres. Its
// turns are about 430 m in radius at their tightest
const A = 1200;
const B = 360;
const RISE = 80;

// Mach 0.96 through the crossing, and slowing for the turns so as never to
// pull past about 7 g
const FAST_M_S = 0.96 * SOUND_M_S;
const TURN_G = 9;

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

// Not the shape the air flies round: the gear and its doors, and the pylons
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
 * Where the eight is, and its first two derivatives, at an angle along it.
 * @param theta The angle, in radians
 * @param out Where to write the point and its derivatives
 */
const eight = (
  theta: number,
  out: { point: Vector3; d1: Vector3; d2: Vector3 },
) => {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const s2 = Math.sin(2 * theta);
  const c2 = Math.cos(2 * theta);

  out.point.set(A * s, RISE * s, B * s2);
  out.d1.set(A * c, RISE * c, 2 * B * c2);
  out.d2.set(-A * s, -RISE * s, -4 * B * s2);
};

/**
 * How fast it flies at a point along the eight: flat out where it runs
 * straight, and as fast as its g allows where it turns, blended smoothly.
 * @param at The point and its derivatives there
 * @returns The airspeed, in metres per second
 */
const airspeed_at = ({ d1, d2 }: { d1: Vector3; d2: Vector3 }) => {
  // The path's curvature, |d1 x d2| / |d1|^3
  const cx = d1.y * d2.z - d1.z * d2.y;
  const cy = d1.z * d2.x - d1.x * d2.z;
  const cz = d1.x * d2.y - d1.y * d2.x;
  const curvature = Math.hypot(cx, cy, cz) / d1.length() ** 3;

  return 1 / Math.sqrt(1 / FAST_M_S ** 2 + curvature / (TURN_G * G));
};

/**
 * How far to move towards a target this frame, easing in over a time.
 * @param delta The frame's length, in seconds
 * @param time_s The time to cover about two thirds of the way, in seconds
 * @returns The share of the way to go
 */
const ease = (delta: number, time_s: number) => 1 - Math.exp(-delta / time_s);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const DEG = Math.PI / 180;

// The model's moving parts, each a node turning about its own X, positive as
// its extras say
const SURFACES = {
  elevons_l: ["CTRL_Elevon_Inner_L", "CTRL_Elevon_Outer_L"],
  elevons_r: ["CTRL_Elevon_Inner_R", "CTRL_Elevon_Outer_R"],
  leading_edge: [
    "CTRL_LEFlap_Inner_L",
    "CTRL_LEFlap_Outer_L",
    "CTRL_LEFlap_Inner_R",
    "CTRL_LEFlap_Outer_R",
  ],
  rudders: ["CTRL_Rudder_L", "CTRL_Rudder_R"],
  nozzle_pitch: ["CTRL_Nozzle_L_Pitch", "CTRL_Nozzle_R_Pitch"],
  nozzle_yaw: ["CTRL_Nozzle_L_Yaw", "CTRL_Nozzle_R_Yaw"],
  stick_pitch: ["CTRL_Stick_Pitch"],
  stick_roll: ["CTRL_Stick_Roll"],
  throttle: ["CTRL_Throttle_C"],
} as const;

type Surface = keyof typeof SURFACES;

/**
 * Turn every node of a moving part.
 * @param parts The model's parts, found by name
 * @param surface Which one
 * @param angle The angle, in radians
 */
const deflect = (
  parts: Record<Surface, Object3D[]>,
  surface: Surface,
  angle: number,
) => {
  for (const node of parts[surface]) node.rotation.x = angle;
};

export type Readout = RefObject<HTMLSpanElement | null>;

/**
 * The fighter on the eight, burners lit and vapor on, with the camera
 * chasing it.
 * @param props The sky, and where to say what it is doing
 * @returns The model, its plumes and its vapor
 */
const Flight: FC<{ sky: Sky; readout: Readout }> = ({ sky, readout }) => {
  const { scene, nodes, animations } = useGLTF(MODEL);
  const path = useRef<Group>(null);
  const body = useRef<Group>(null);
  const vapor = useRef<WingVaporCore>(null);
  const batch = useRef<AfterburnerBatchCore>(null);
  const engines = useRef<(AfterburnerHandle | null)[]>([]);
  const { actions } = useAnimations(animations, body);
  const camera = useThree((state) => state.camera);

  const scratch = useMemo(
    () => ({
      theta: 0,
      at: { point: new Vector3(), d1: new Vector3(), d2: new Vector3() },
      tangent: new Vector3(),
      lift: new Vector3(),
      x: new Vector3(),
      z: new Vector3(),
      back: new Vector3(),
      side: new Vector3(),
      basis: new Matrix4(),
      // Where the path asks the airframe to point, and where it pointed last
      // frame, to measure its rates from
      aim: new Quaternion(),
      last: new Quaternion(),
      turn: new Quaternion(),
      // The camera's way back from the aircraft, eased round
      chase: new Vector3(0, 0, 1),
      settled: false,
      alpha: 0,
      load: 1,
      throttle: 1.05,
      // Its roll, pitch and yaw rates, in rad/s, eased
      rates: new Vector3(),
      air: moist_air(AIR.altitude_m, HUMIDITY, AIR.temperature_offset_k),
      clock: 0,
    }),
    [],
  );

  const parts = useMemo(() => {
    const found = {} as Record<Surface, Object3D[]>;

    for (const [surface, names] of Object.entries(SURFACES)) {
      found[surface as Surface] = names.flatMap((name) => {
        const node = nodes[name];

        return node ? [node] : [];
      });
    }

    return found;
  }, [nodes]);

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

  useFrame((_, frame_delta) => {
    const delta = Math.min(frame_delta, 0.1);
    const { at, tangent, lift, x, z, back, side, basis } = scratch;

    if (!path.current || !body.current) return;

    // Along the eight at the airspeed there
    eight(scratch.theta, at);

    scratch.theta += (airspeed_at(at) / at.d1.length()) * delta;
    scratch.clock += delta;
    eight(scratch.theta, at);

    const airspeed_m_s = airspeed_at(at);

    // The lift has to turn the flight path and hold the aircraft up: the
    // path's curvature times the airspeed squared, plus one g
    tangent.copy(at.d1).normalize();
    lift
      .copy(at.d2)
      .addScaledVector(tangent, -at.d2.dot(tangent))
      .multiplyScalar((airspeed_m_s * airspeed_m_s) / at.d1.lengthSq());
    lift.y += G;
    lift.addScaledVector(tangent, -lift.dot(tangent));

    const load_now = lift.length() / G;

    lift.normalize();

    // Flying along -Z, the lift up its +Y: the bank follows from it
    z.copy(tangent).negate();
    x.crossVectors(lift, z);
    basis.makeBasis(x, lift, z);
    scratch.aim.setFromRotationMatrix(basis);
    path.current.position.copy(at.point);

    if (!scratch.settled) {
      path.current.quaternion.copy(scratch.aim);
      scratch.last.copy(scratch.aim);
      scratch.settled = true;
    }

    // An airframe takes a moment to roll and pull to where the path asks
    path.current.quaternion.slerp(scratch.aim, ease(delta, 0.22));
    scratch.load += (load_now - scratch.load) * ease(delta, 0.25);

    const load = scratch.load;

    // Its rates, in its own frame, from how it turned since the last frame
    scratch.turn.copy(scratch.last).invert().multiply(path.current.quaternion);
    scratch.last.copy(path.current.quaternion);

    if (scratch.turn.w < 0) {
      scratch.turn.set(
        -scratch.turn.x,
        -scratch.turn.y,
        -scratch.turn.z,
        -scratch.turn.w,
      );
    }

    // For a small turn, the quaternion's vector part is half the angle
    const per_s = delta > 0 ? 2 / delta : 0;

    // Rolling right is about -Z, pitching up about +X, yawing right about -Y
    const rates = scratch.rates;

    rates.x += (-scratch.turn.z * per_s - rates.x) * ease(delta, 0.12);
    rates.y += (scratch.turn.x * per_s - rates.y) * ease(delta, 0.12);
    rates.z += (-scratch.turn.y * per_s - rates.z) * ease(delta, 0.12);

    const current = vapor.current;

    if (current) {
      const alpha = angle_of_attack_for_load(
        current.airframe,
        load,
        airspeed_m_s,
        scratch.air,
      );

      scratch.alpha += (alpha - scratch.alpha) * ease(delta, 0.15);
      current.update_flight({
        airspeed_m_s,
        angle_of_attack_rad: scratch.alpha,
      });
    }

    // The nose is up off the flight path by the angle of attack
    body.current.rotation.x = scratch.alpha;

    // The controls, as a pilot would hold them: the elevons up to pull and
    // split to roll, the rudders into the yaw, the leading edge drooped
    // with the angle of attack, and the nozzles vectoring with the elevons
    const roll_input = clamp(rates.x / 2.5, -1, 1);
    const pull_input = clamp((load - 1) / 6, -0.3, 1);
    const pitch = -18 * pull_input * DEG;
    const roll = 14 * roll_input * DEG;

    deflect(parts, "elevons_l", clamp(pitch + roll, -30 * DEG, 30 * DEG));
    deflect(parts, "elevons_r", clamp(pitch - roll, -30 * DEG, 30 * DEG));
    deflect(parts, "rudders", clamp(rates.z * 40, -12, 12) * DEG);
    deflect(
      parts,
      "leading_edge",
      clamp((scratch.alpha / DEG) * 1.2, -3, 25) * DEG,
    );
    deflect(parts, "nozzle_pitch", -4 * pull_input * DEG);
    deflect(parts, "nozzle_yaw", clamp(rates.z * 30, -9.5, 9.5) * DEG);
    deflect(parts, "stick_pitch", 15 * pull_input * DEG);
    deflect(parts, "stick_roll", 15 * roll_input * DEG);

    // Reheat all the way round, the throttle firewalled as the pull comes on,
    // to hold the energy through the turn
    const throttle = 1.02 + 0.08 * clamp((load - 1.5) / 3.5, 0, 1);

    scratch.throttle += (throttle - scratch.throttle) * ease(delta, 0.4);

    for (const engine of engines.current) {
      if (engine) engine.throttle = scratch.throttle;
    }

    // The lever, its reheat detent at 0.85 of its travel
    deflect(
      parts,
      "throttle",
      (0.85 + (scratch.throttle - 1) * 1.5) * 40 * DEG,
    );

    batch.current?.update_profile({ airspeed_m_s });

    // The camera chases it, level, easing round as it turns and swinging
    // slowly from astern to abeam
    back.set(-tangent.x, 0, -tangent.z).normalize();
    scratch.chase.lerp(back, ease(delta, 0.9)).normalize();
    back.copy(scratch.chase);
    side.set(back.z, 0, -back.x);

    const swing = 0.95 + 0.6 * Math.sin(scratch.clock * 0.07);
    // Further back on a narrow screen, to keep the wings in
    const aspect = (camera as PerspectiveCamera).aspect;
    const distance = 44 * Math.max(1, 1.2 / aspect);

    camera.position
      .copy(at.point)
      .addScaledVector(back, Math.cos(swing) * distance)
      .addScaledVector(side, Math.sin(swing) * distance);
    camera.position.y += 6;
    // Looking a little below it, so it flies above the page's title
    camera.lookAt(at.point.x, at.point.y - 4, at.point.z);

    if (readout.current) {
      readout.current.textContent = `Mach ${(airspeed_m_s / SOUND_M_S).toFixed(2)} · ${load.toFixed(1)} g`;
    }
  });

  const look = SKIES[sky].look;

  return (
    <AfterburnerBatch
      ref={batch}
      preset="afterburner"
      profile={{ ...AIR, exposure: SKIES[sky].exposure }}
    >
      <group ref={path}>
        <group ref={body}>
          <primitive object={scene} />
          <WingVapor
            ref={vapor}
            capture={scene}
            capture_filter={airframe_only}
            air={{ ...AIR, relative_humidity: HUMIDITY }}
            look={look}
            forward={[0, 0, -1]}
          />
        </group>
      </group>
      {[nodes.FX_Exhaust_L, nodes.FX_Exhaust_R].map((exhaust, index) => (
        <Afterburner
          key={index}
          ref={(engine) => {
            engines.current[index] = engine;
          }}
          target={exhaust}
          preset="afterburner"
          position={[0, 0, 0.18]}
          direction={[0, 0, -1]}
          params={{ nozzle_radius_m: 0.27, nozzle_aspect: 1.4 }}
        />
      ))}
    </AfterburnerBatch>
  );
};

/**
 * The landing page's sky: the fighter flying the eight, fullscreen.
 * @param props Day or night, and where to say what it is doing
 * @returns The canvas
 */
const FlightScene: FC<{ sky: Sky; readout: Readout }> = ({ sky, readout }) => {
  const lights = SKIES[sky];

  return (
    <Canvas
      dpr={[1, 1.25]}
      shadows={NO_SHADOWS}
      camera={{ position: [0, 5, 30], fov: 40, near: 0.1, far: 5000 }}
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
      <Suspense fallback={null}>
        <Flight sky={sky} readout={readout} />
      </Suspense>
      <Grade />
    </Canvas>
  );
};

export default FlightScene;
