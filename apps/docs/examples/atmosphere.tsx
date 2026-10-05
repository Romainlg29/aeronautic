import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { volume_pass } from "@aeronautic/core";
import { useFlightStore, VolumePassContext } from "@aeronautic/core/react";
import {
  aerialPerspective,
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  AtmosphereParameters,
  getSplitScalarIlluminance,
  skyEnvironment,
} from "@takram/three-atmosphere/webgpu";
import { Ellipsoid, Geodetic, radians } from "@takram/three-geospatial";
import {
  createContext,
  type FC,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgXToneMapping, Vector3, type Vector3Tuple } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { context, Fn, instancedArray, uniform, vec4 } from "three/tsl";
import { type Node, RenderPipeline, WebGPURenderer } from "three/webgpu";
import { NO_SHADOWS } from "@/lib/no-shadows";
import { useOnScreen } from "./stage";

// Takram's atmosphere under the aeronautic effects: its sky, its aerial
// perspective and its sunlight, with the plumes and the vapour in the same
// light, at the same exposure, as everything else in the frame
//
// The atmosphere draws in the units of its own luminance scale: one unit on
// screen is 1 / luminanceScale candelas per square metre, about 75 700. The
// effects are put in those units below, so the sky, the skin, the flame and
// the vapour all come out of one camera at one exposure

// Takram's defaults, the same as an AtmosphereContext makes for itself
const PARAMETERS = new AtmosphereParameters();

// A plume's radiance is in units of a blackbody's at 2000 K, about
// 4.8e5 cd/m², so in the atmosphere's units it is drawn at this exposure,
// about 6.3, whatever the preset was photographed at
const BLACKBODY_2000K_CD_M2 = 4.8e5;
export const PLUME_EXPOSURE = BLACKBODY_2000K_CD_M2 * PARAMETERS.luminanceScale;

// An incident light meter's calibration constant for a hemispherical
// receptor, in lux at ISO 100 (ISO 2720 gives 320 to 540), and how far over
// a metered exposure the brightest unclipped luminance sits (Lagarde and de
// Rousiers, "Moving Frostbite to PBR", 2014)
const INCIDENT_METER_C = 330;
const ISO = 100;
const SATURATION = 1.2;

// The ground's albedo as takram's model has it, lighting the vapour from below
const GROUND_ALBEDO = PARAMETERS.groundAlbedo.x;

// The camera's exposure, in EV at ISO 100, before the meter has read the sky:
// sunny sixteen
const START_EV100 = 15;

/**
 * The camera's exposure for a metered EV, in the atmosphere's units.
 * @param ev100 The exposure value at ISO 100
 * @returns What to multiply the frame by before the tone curve
 */
const exposure_at = (ev100: number) =>
  1 / (SATURATION * 2 ** ev100 * PARAMETERS.luminanceScale);

/**
 * The light at the aircraft, as the atmosphere works it out for the frame.
 * Linear RGB in the atmosphere's units.
 */
export type AtmosphereLighting = {
  /** Towards the sun, in world space */
  sunDirection: Vector3Tuple;

  /** The sun's illuminance on a surface facing it, through the air above */
  sun: Vector3Tuple;

  /**
   * The sky's mean radiance over the whole sphere round the aircraft: the
   * dome above, and the sunlit ground below
   */
  sky: Vector3Tuple;

  /** What an incident light meter there reads, in EV at ISO 100 */
  ev100: number;
};

const LightingContext = createContext<AtmosphereLighting | null>(null);

/**
 * The light at the aircraft, once the atmosphere has measured it. Renders
 * only when the sun or the altitude move.
 * @returns It, or null before the first measurement
 */
export const useAtmosphereLighting = (): AtmosphereLighting | null =>
  useContext(LightingContext);

/**
 * The sunlight and the skylight at a point, read back from the atmosphere's
 * own tables on the GPU, so the vapour is lit by the very light the sky is
 * drawn with.
 * @param renderer The renderer, its context holding the atmosphere
 * @returns Where to ask, and how
 */
const make_light_probe = (renderer: WebGPURenderer) => {
  // In the atmosphere's internal units: kilometres from the earth's centre
  const point = uniform(new Vector3());
  const toward_sun = uniform(new Vector3());
  const result = instancedArray(2, "vec4");

  const kernel = Fn(() => {
    const split = getSplitScalarIlluminance(point, toward_sun).toConst() as {
      get: (name: string) => Node<"vec3">;
    };

    result.element(0).assign(vec4(split.get("direct"), 0));
    result.element(1).assign(vec4(split.get("indirect"), 0));
  })().compute(1);

  return {
    point: point.value,
    towardSun: toward_sun.value,

    /**
     * Run it.
     * @returns The direct illuminance, and the indirect as takram's
     *   split illuminance gives it: the horizontal irradiance times 2π
     */
    read: async () => {
      renderer.compute(kernel);

      const data = new Float32Array(
        await renderer.getArrayBufferAsync(result.value),
      );

      return {
        direct: [data[0], data[1], data[2]] as Vector3Tuple,
        indirect: [data[4], data[5], data[6]] as Vector3Tuple,
      };
    },
    dispose: () => {
      kernel.dispose();
      result.dispose();
    },
  };
};

const scratch_position = new Vector3();
const scratch_surface = new Vector3();
const scratch_centre = new Vector3();
const geodetic = new Geodetic();

/**
 * Where a point of the scene is to the atmosphere: on the sphere it
 * osculates the ellipsoid with there, as the atmosphere's own altitude
 * correction puts the camera, in its internal units.
 * @param world_to_ecef The scene's frame on the earth
 * @param result Where to write it
 * @returns The result
 */
const origin_in_atmosphere = (
  world_to_ecef: { elements: number[] },
  result: Vector3,
) => {
  const e = world_to_ecef.elements;
  const ecef = scratch_position.set(e[12], e[13], e[14]);
  const surface = Ellipsoid.WGS84.projectOnSurface(ecef, scratch_surface);

  if (surface) {
    ecef.sub(
      Ellipsoid.WGS84.getOsculatingSphereCenter(
        surface,
        PARAMETERS.bottomRadius,
        scratch_centre,
      ),
    );
  }

  return result.copy(ecef).multiplyScalar(PARAMETERS.worldToUnit);
};

type AtmosphereProps = {
  /** The sun's height above the horizon, in degrees */
  sunElevationDeg: number;

  /** Where the sun is round the horizon, in degrees from north towards east */
  sunAzimuthDeg?: number;

  /** Where on the earth the scene's origin is */
  latitudeDeg?: number;
  longitudeDeg?: number;

  /**
   * How high the scene's origin is, in metres. Inside a `<FlightProvider>`,
   * the flight's altitude instead, so the sky is the one the plumes and the
   * vapour are flying in
   */
  altitudeM?: number;

  children?: ReactNode;
};

/**
 * Takram's atmosphere round the scene, with the aeronautic effects drawn into
 * it: the sky and the aerial perspective drawn under the plumes and the
 * vapour, the sun lighting the scene, and the camera metering the sky.
 *
 * The scene's origin sits on the earth at the given latitude and longitude,
 * as high as the flight is, with +X north, +Y up and +Z east.
 * @param props Where the sun is, where the scene is, and the scene
 * @returns The scene, inside the atmosphere
 */
export const Atmosphere: FC<AtmosphereProps> = ({
  sunElevationDeg: sun_elevation_deg,
  sunAzimuthDeg: sun_azimuth_deg = 200,
  latitudeDeg: latitude_deg = 35,
  longitudeDeg: longitude_deg = 139,
  altitudeM: altitude_prop = 0,
  children,
}) => {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as WebGPURenderer;
  const flight = useFlightStore();

  const atmosphere = useMemo(() => {
    const made = new AtmosphereContext();

    // It raymarches the air in front of the scene with a noise that wants
    // temporal antialiasing to smooth it; without, the tables are steadier
    made.raymarchScattering = false;

    return made;
  }, []);

  atmosphere.camera = camera;

  // Every node of the atmosphere finds it in the renderer's context
  useLayoutEffect(() => {
    const previous = renderer.contextNode;

    renderer.contextNode = context({
      ...(renderer.contextNode.value as object),
      getAtmosphere: () => atmosphere,
    });
    // Takram's types are written against a three of their own
    renderer.library.addLight(
      AtmosphereLightNode as unknown as Parameters<
        typeof renderer.library.addLight
      >[0],
      AtmosphereLight,
    );

    return () => {
      renderer.contextNode = previous;
      atmosphere.dispose();
    };
  }, [renderer, atmosphere]);

  // The sun, direct: the sky's light comes from the environment instead
  const sun = useMemo(() => {
    const light = new AtmosphereLight();

    light.indirect.value = false;

    return light;
  }, []);

  // What metal and paint reflect: the sky round the scene, without the sun
  useLayoutEffect(() => {
    const environment = skyEnvironment();

    scene.environmentNode = environment as unknown as Node<"vec3">;

    return () => {
      scene.environmentNode = null;
      environment.dispose();
    };
  }, [scene]);

  // The opaque scene under the atmosphere first, then the plumes and the
  // vapour over it: the sky is drawn where nothing was, so it goes behind
  // them, and they see through the air as it is in front of what is behind
  const split = useMemo(
    () =>
      volume_pass(scene, camera, {
        backdropNode: ({ color, depth }) =>
          aerialPerspective(color, depth) as unknown as Node<"vec4">,
      }),
    [scene, camera],
  );

  const pipeline = useMemo(() => {
    const render_pipeline = new RenderPipeline(renderer);

    render_pipeline.outputNode = split.output.add(
      bloom(split.output, 0.3, 0.2, 1),
    );

    return render_pipeline;
  }, [renderer, split]);

  useEffect(() => {
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = exposure_at(START_EV100);

    return () => pipeline.dispose();
  }, [renderer, pipeline]);

  const probe = useMemo(() => make_light_probe(renderer), [renderer]);

  useEffect(() => () => probe.dispose(), [probe]);

  const [lighting, set_lighting] = useState<AtmosphereLighting | null>(null);
  const measured = useRef({ key: "", busy: false });
  const sun_world = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const altitude_m = flight?.values.altitudeM ?? altitude_prop;

    // The scene's frame on the earth, as high as the aircraft flies
    Ellipsoid.WGS84.getNorthUpEastFrame(
      geodetic
        .set(radians(longitude_deg), radians(latitude_deg), altitude_m)
        .toECEF(scratch_position),
      atmosphere.matrixWorldToECEF.value,
    );

    // The sun, from its elevation and azimuth in that frame: north, up, east
    const elevation = radians(sun_elevation_deg);
    const azimuth = radians(sun_azimuth_deg);

    sun_world.set(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    );
    atmosphere.sunDirectionECEF.value
      .copy(sun_world)
      .transformDirection(atmosphere.matrixWorldToECEF.value);

    // Measured again only when the light at the aircraft can have changed
    const key = `${sun_elevation_deg},${sun_azimuth_deg},${Math.round(altitude_m)}`;
    const state = measured.current;

    if (state.busy || state.key === key) return;

    state.busy = true;
    origin_in_atmosphere(atmosphere.matrixWorldToECEF.value, probe.point);
    probe.towardSun.copy(atmosphere.sunDirectionECEF.value);

    void probe
      .read()
      .then(({ direct, indirect }) => {
        // Before the tables are built it reads nothing: try again
        if (!(indirect[1] > 0)) return;

        state.key = key;

        const sin_elevation = Math.max(Math.sin(elevation), 0);

        const sky = direct.map((sun_lux, i) => {
          // The dome's horizontal irradiance, and the sunlit ground's
          const dome = indirect[i] / (2 * Math.PI);
          const ground = GROUND_ALBEDO * (sun_lux * sin_elevation + dome);

          // Each a Lambertian radiance, E / π, over half the sphere
          return (dome / Math.PI + ground / Math.PI) / 2;
        }) as Vector3Tuple;

        // The meter's dome, pointing up: from a direction θ off its axis it
        // shows (1 + cos θ) / 2 of its full face. The sun counts below the
        // level too, as it does when the aircraft flies above the horizon's
        // dip; the sky above sums to 1.5 E_h, the ground below to half its
        // exitance
        const dome_response = (1 + Math.sin(elevation)) / 2;
        const metered = direct.map((sun_lux, i) => {
          const dome = indirect[i] / (2 * Math.PI);
          const ground = GROUND_ALBEDO * (sun_lux * sin_elevation + dome);

          return sun_lux * dome_response + 1.5 * dome + 0.5 * ground;
        });
        const lux =
          (0.2126 * metered[0] + 0.7152 * metered[1] + 0.0722 * metered[2]) /
          PARAMETERS.luminanceScale;

        // EV = log2(E S / C), at ISO 100
        const ev100 = Math.log2((lux * ISO) / INCIDENT_METER_C);

        renderer.toneMappingExposure = exposure_at(ev100);

        set_lighting({
          sunDirection: sun_world.toArray() as Vector3Tuple,
          sun: direct,
          sky,
          ev100,
        });
      })
      .finally(() => {
        state.busy = false;
      });
  });

  useFrame(() => pipeline.render(), 1);

  return (
    <>
      <primitive object={sun} />
      <VolumePassContext value={split}>
        <LightingContext value={lighting}>{children}</LightingContext>
      </VolumePassContext>
    </>
  );
};

type AtmosphereStageProps = AtmosphereProps & {
  camera?: Vector3Tuple;
  target?: Vector3Tuple;
  fov?: number;

  // Overlaid on the canvas: controls, a readout
  overlay?: ReactNode;
};

/**
 * A live example's canvas under takram's atmosphere: the docs' usual stage,
 * with the atmosphere's sky, light and grade in place of its own.
 * @param props Where the camera starts, the atmosphere, and the scene
 * @returns The example
 */
export const AtmosphereStage: FC<AtmosphereStageProps> = ({
  camera = [-16, 4, 10],
  target = [0, 0, 8],
  fov = 40,
  overlay,
  children,
  ...atmosphere
}) => {
  const [frame, visible] = useOnScreen();

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
        <Atmosphere {...atmosphere}>
          <Suspense fallback={null}>{children}</Suspense>
        </Atmosphere>
        <OrbitControls target={target} makeDefault />
      </Canvas>
      {overlay}
    </div>
  );
};
