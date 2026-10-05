import type { AfterburnerBatch } from "@aeronautic/afterburner";
import type { VaporLook, WingVapor } from "@aeronautic/wing-vapor";
import { volume_pass } from "@aeronautic/core";
import { useVolumePass, VolumePassContext } from "@aeronautic/core/react";
import { OrbitControls } from "@react-three/drei";
import { Moon, Sun } from "lucide-react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  type FC,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AgXToneMapping,
  Color,
  type DirectionalLight,
  type GridHelper,
  type HemisphereLight,
  type Object3D,
  type Scene,
  type Texture,
  type Vector3Tuple,
} from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { PMREMGenerator, RenderPipeline, WebGPURenderer } from "three/webgpu";
import { NO_SHADOWS } from "@/lib/no-shadows";

// What every live example on these pages shares: a WebGPU canvas, the tone
// map and bloom the plumes are graded for, an orbit camera, and a frame loop
// that only runs while the example is on screen, so a page of them stays cheap

/**
 * Draw the frame through bloom, then AgX.
 *
 * The plumes and the vapour inside are raymarched at half the frame's
 * resolution, in a pass of their own, and laid back over the scene: a march
 * costs per pixel, and at 1440p each effect took 10 to 12 ms of a frame at
 * full resolution
 * @param props What is drawn in it
 * @returns Its children, their volumes drawn at half resolution
 */
export const Grade: FC<{ children?: ReactNode }> = ({ children }) => {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;

  const split = useMemo(() => volume_pass(scene, camera), [scene, camera]);

  const pipeline = useMemo(() => {
    const glow = bloom(split.output, 0.3, 0.2, 1);
    const render_pipeline = new RenderPipeline(renderer);

    render_pipeline.outputNode = split.output.add(glow);

    return render_pipeline;
  }, [renderer, split]);

  useEffect(() => {
    renderer.toneMapping = AgXToneMapping;
    return () => pipeline.dispose();
  }, [renderer, pipeline]);

  useFrame(() => pipeline.render(), 1);

  return <VolumePassContext value={split}>{children}</VolumePassContext>;
};

/**
 * Set what a scene's materials reflect.
 * @param scene The scene
 * @param texture Its environment map, or null for none
 * @param intensity How strongly
 */
const reflect = (scene: Scene, texture: Texture | null, intensity: number) => {
  scene.environment = texture;
  scene.environmentIntensity = intensity;
};

/**
 * Give metal something to reflect: a lit room, dimly, the sky being night.
 * @param props How strongly
 * @returns Nothing; it sets the scene's environment
 */
export const Reflections: FC<{ intensity?: number }> = ({
  intensity = 0.35,
}) => {
  const { gl, scene } = useThree();

  // Built once: taking the map away and back recompiles every material that
  // reflects it, so a new strength only changes the strength
  useEffect(() => {
    const generator = new PMREMGenerator(gl as unknown as WebGPURenderer);
    const target = generator.fromScene(new RoomEnvironment(), 0.04);

    reflect(scene, target.texture, scene.environmentIntensity);

    return () => {
      reflect(scene, null, 0);
      target.dispose();
      generator.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);

  return null;
};

// The two skies an example can be under, and how long it takes to go between
const NIGHT = {
  background: "#05070b",
  grid: "#121620",
  hemisphere: 0.6,
  sun: 1.2,
  look: {
    sunColor: [0.7, 0.78, 1],
    sunIntensity: 0.6,
    skyColor: [0.08, 0.1, 0.18],
    skyIntensity: 0.15,
  },
} as const;
const DAY = {
  background: "#6f9fd8",
  grid: "#4f74a3",
  hemisphere: 1.6,
  sun: 3,
  look: {
    sunColor: [1, 0.96, 0.9],
    sunIntensity: 3,
    skyColor: [0.55, 0.68, 0.9],
    skyIntensity: 1,
  },
} as const;
const FADE_S = 0.6;

// By day the sky sets the camera, and the plume is drawn at what that leaves
// it. A plume's radiance is in units of a blackbody's at 2000 K, about
// 4.8e5 cd/m² (the old candela's platinum, at 2042 K, was 6e5). A clear sky
// away from the sun is about 6000 cd/m², and it is drawn here at the
// background's linear luminance, so one unit on screen is 6000 over that
const BLACKBODY_2000K_CD_M2 = 4.8e5;
const CLEAR_SKY_CD_M2 = 6000;
const day_sky = new Color(DAY.background);
export const DAY_EXPOSURE =
  (BLACKBODY_2000K_CD_M2 *
    (0.2126 * day_sky.r + 0.7152 * day_sky.g + 0.0722 * day_sky.b)) /
  CLEAR_SKY_CD_M2;

/**
 * A plume's exposure under the sky, from its own at night. A camera stopped
 * down further than the sky needs, for a rocket, stays there; the rest come
 * down to the sky's. Eased in stops, as an exposure is.
 * @param night Its exposure at night
 * @param shade How far to day, 0 to 1
 * @returns Its exposure now
 */
const exposure_under = (night: number, shade: number) =>
  night * (Math.min(night, DAY_EXPOSURE) / night) ** shade;

const mix_rgb = (
  from: readonly number[],
  to: readonly number[],
  share: number,
): [number, number, number] => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];

/**
 * Light the scene under a night or a daylit sky, easing from one to the other
 * rather than rebuilding anything: the sky, the lights, the grid, every
 * plume's exposure and the vapor's light.
 * @param props Whether it is day, and where the grid is
 * @returns The lights and the grid
 */
const Sky: FC<{ day: boolean; floor: number | null }> = ({ day, floor }) => {
  const { scene } = useThree();
  const volumes = useVolumePass();
  const hemisphere = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const grid = useRef<GridHelper>(null);
  const shade = useRef(day ? 1 : 0);
  const colors = useMemo(
    () => ({
      night: new Color(NIGHT.background),
      day: new Color(DAY.background),
      now: new Color(),
      night_grid: new Color(NIGHT.grid),
      day_grid: new Color(DAY.grid),
    }),
    [],
  );

  // Each plume's exposure at night, its preset's, from when it was first seen
  const nights = useMemo(() => new WeakMap<AfterburnerBatch, number>(), []);

  // The sky each vapor was last lit for: its colours compare by reference
  const lit = useMemo(() => new WeakMap<WingVapor, number>(), []);

  useEffect(() => {
    const previous = scene.background;

    scene.background = colors.now;

    return () => {
      scene.background = previous;
    };
  }, [scene, colors]);

  useFrame((_, delta) => {
    const goal = day ? 1 : 0;
    const step = Math.min(delta / FADE_S, 1);

    shade.current += Math.max(-step, Math.min(step, goal - shade.current));

    const t = shade.current;
    const mix = (a: number, b: number) => a + (b - a) * t;

    colors.now.lerpColors(colors.night, colors.day, t);

    if (hemisphere.current)
      hemisphere.current.intensity = mix(NIGHT.hemisphere, DAY.hemisphere);
    if (sun.current) sun.current.intensity = mix(NIGHT.sun, DAY.sun);
    if (grid.current) {
      const material = grid.current.material as { color: Color };

      material.color.lerpColors(colors.night_grid, colors.day_grid, t);
    }

    // Written whenever one is off, so a plume or a vapor that arrives late,
    // or has its profile set again, comes under the sky too. They are drawn
    // in the volume pass's scene, not this one
    const light = (object: Object3D) => {
      const batch = object.userData.afterburnerBatch as
        | AfterburnerBatch
        | undefined;
      const vapor = object.userData.wingVapor as WingVapor | undefined;

      if (batch) {
        let night = nights.get(batch);

        if (night === undefined) {
          night = batch.profile.exposure;
          nights.set(batch, night);
        }

        const exposure = exposure_under(night, t);

        if (Math.abs(batch.profile.exposure - exposure) > 1e-6 * night)
          batch.updateProfile({ exposure });
      }

      if (!vapor || lit.get(vapor) === t) return;

      lit.set(vapor, t);
      vapor.updateLook({
        sunColor: mix_rgb(NIGHT.look.sunColor, DAY.look.sunColor, t),
        sunIntensity: mix(NIGHT.look.sunIntensity, DAY.look.sunIntensity),
        skyColor: mix_rgb(NIGHT.look.skyColor, DAY.look.skyColor, t),
        skyIntensity: mix(NIGHT.look.skyIntensity, DAY.look.skyIntensity),
      } satisfies Partial<VaporLook>);
    };

    scene.traverse(light);
    volumes?.scene.traverse(light);
  });

  return (
    <>
      <hemisphereLight ref={hemisphere} args={["#8090b0", "#101010"]} />
      <directionalLight ref={sun} position={[-5, 10, 5]} />
      {floor !== null && (
        // White, so the material's colour is the line's, and can fade
        <gridHelper
          ref={grid}
          args={[200, 100, "#ffffff", "#ffffff"]}
          position={[0, floor, 0]}
        />
      )}
    </>
  );
};

type StageProps = {
  children: ReactNode;
  camera?: Vector3Tuple;
  target?: Vector3Tuple;
  fov?: number;
  // Where the grid is, in metres below the nozzle; null for none
  floor?: number | null;
  // Overlaid on the canvas: controls, a readout
  overlay?: ReactNode;
  // An environment map, for a loaded model's metal
  reflections?: boolean;
  // Start under a daylit sky rather than the night the plumes are graded for
  daylight?: boolean;
};

/**
 * A live example's canvas.
 * @param props The scene, where the camera starts, and anything to lay over it
 * @returns The example
 */
export const Stage: FC<StageProps> = ({
  children,
  camera = [-16, 4, 10],
  target = [0, 0, 8],
  fov = 40,
  floor = -3,
  overlay,
  reflections = false,
  daylight = false,
}) => {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, set_visible] = useState(false);
  const [day, set_day] = useState(daylight);

  useEffect(() => {
    const element = frame.current;

    if (!element) return;

    const observer = new IntersectionObserver(([entry]) =>
      set_visible(entry?.isIntersecting ?? false),
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className="example">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.5]}
        shadows={NO_SHADOWS}
        camera={{ position: camera, fov, near: 0.1, far: 5000 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            ...(props as object),
            antialias: false,
          });

          await renderer.init();

          return renderer;
        }}
      >
        <Grade>
          <Sky day={day} floor={floor} />
          {reflections && <Reflections />}
          {/* A loaded model streams in, the plumes around it waiting for it */}
          <Suspense fallback={null}>{children}</Suspense>
        </Grade>
        <OrbitControls target={target} makeDefault />
      </Canvas>
      {overlay}
      <button
        type="button"
        className="example-sky"
        onClick={() => set_day(!day)}
        aria-label={`Switch to ${day ? "night" : "day"}`}
      >
        {day ? <Moon size={14} /> : <Sun size={14} />}
        {day ? "Night" : "Day"}
      </button>
    </div>
  );
};

/**
 * A bare engine can, its exit at the origin, facing +Z.
 * @param props Its exit radius in metres
 * @returns The mesh
 */
export const Nozzle: FC<{ radius_m?: number }> = ({ radius_m = 0.5 }) => (
  <mesh position={[0, 0, -radius_m * 2]} rotation={[-Math.PI / 2, 0, 0]}>
    <cylinderGeometry
      args={[radius_m * 1.08, radius_m * 1.2, radius_m * 4, 32, 1, true]}
    />
    <meshStandardMaterial
      color="#3d424c"
      metalness={0.6}
      roughness={0.45}
      side={2}
    />
  </mesh>
);

/**
 * Move the camera when what it should frame changes.
 * @param props Where the camera goes, and what it looks at
 * @returns Nothing
 */
export const Aim: FC<{ camera: Vector3Tuple; target: Vector3Tuple }> = ({
  camera: [cx, cy, cz],
  target: [tx, ty, tz],
}) => {
  const { camera, controls } = useThree();

  useEffect(() => {
    camera.position.set(cx, cy, cz);

    const orbit = controls as unknown as {
      target: { set: (x: number, y: number, z: number) => void };
      update: () => void;
    } | null;

    orbit?.target.set(tx, ty, tz);
    orbit?.update();
  }, [camera, controls, cx, cy, cz, tx, ty, tz]);

  return null;
};
