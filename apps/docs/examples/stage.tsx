import { OrbitControls } from "@react-three/drei";
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
  type Scene,
  type Texture,
  type Vector3Tuple,
} from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { pass } from "three/tsl";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { PMREMGenerator, RenderPipeline, WebGPURenderer } from "three/webgpu";
import { NO_SHADOWS } from "@/lib/no-shadows";

// What every live example on these pages shares: a WebGPU canvas, the tone
// map and bloom the plumes are graded for, an orbit camera, and a frame loop
// that only runs while the example is on screen, so a page of them stays cheap

/**
 * Draw the frame through bloom, then AgX.
 * @returns Nothing; it takes over rendering
 */
export const Grade: FC = () => {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;

  const pipeline = useMemo(() => {
    const color = pass(scene, camera).getTextureNode("output");
    const glow = bloom(color, 0.45, 0.2, 1);
    const render_pipeline = new RenderPipeline(renderer);

    render_pipeline.outputNode = color.add(glow);

    return render_pipeline;
  }, [renderer, scene, camera]);

  useEffect(() => {
    renderer.toneMapping = AgXToneMapping;
    return () => pipeline.dispose();
  }, [renderer, pipeline]);

  useFrame(() => pipeline.render(), 1);

  return null;
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

  useEffect(() => {
    const generator = new PMREMGenerator(gl as unknown as WebGPURenderer);
    const target = generator.fromScene(new RoomEnvironment(), 0.04);

    reflect(scene, target.texture, intensity);

    return () => {
      reflect(scene, null, 0);
      target.dispose();
      generator.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
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
  // A daylit sky rather than the night the plumes are graded for
  daylight?: boolean;
};

/**
 * A live example's canvas.
 * @param props The scene, where the camera starts, and anything to lay over it
 * @returns The example
 */
export const Stage: FC<StageProps> = ({
  children,
  camera = [10, 4, 16],
  target = [8, 0, 0],
  fov = 40,
  floor = -3,
  overlay,
  reflections = false,
  daylight = false,
}) => {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, set_visible] = useState(false);

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
        <color attach="background" args={[daylight ? "#6f9fd8" : "#05070b"]} />
        <hemisphereLight args={["#8090b0", "#101010", daylight ? 1.6 : 0.6]} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={daylight ? 3 : 1.2}
        />
        {floor !== null && (
          <gridHelper
            args={[200, 100, "#1c2230", "#121620"]}
            position={[0, floor, 0]}
          />
        )}
        {reflections && <Reflections />}
        {/* A loaded model streams in, the plumes around it waiting for it */}
        <Suspense fallback={null}>{children}</Suspense>
        <OrbitControls target={target} makeDefault />
        <Grade />
      </Canvas>
      {overlay}
    </div>
  );
};

/**
 * A bare engine can, its exit at the origin, facing +X.
 * @param props Its exit radius in metres
 * @returns The mesh
 */
export const Nozzle: FC<{ radius_m?: number }> = ({ radius_m = 0.5 }) => (
  <mesh position={[-radius_m * 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
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
