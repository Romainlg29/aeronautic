"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Afterburner,
  AFTERBURNER_PRESETS,
  type AfterburnerParamsInput,
  type AfterburnerPresetName,
} from "@aeronautic/afterburner";
import { type FC, useEffect, useState } from "react";
import { WebGPURenderer } from "three/webgpu";
import { cn } from "@/lib/cn";
import { NO_SHADOWS } from "@/lib/no-shadows";
import { Aim, Grade, Nozzle } from "@/examples/stage";

const PRESETS: { name: AfterburnerPresetName; label: string }[] = [
  { name: "afterburner", label: "Afterburner" },
  { name: "rocket_kerolox", label: "Kerolox" },
  { name: "rocket_methalox", label: "Methalox" },
  { name: "rocket_hydrolox", label: "Hydrolox" },
  { name: "solid_booster", label: "Solid booster" },
  { name: "plasma", label: "Plasma" },
];

/**
 * Let a vertical swipe over the scene scroll the page, as the orbit controls
 * would otherwise take every touch. A sideways drag still orbits.
 * @returns Nothing
 */
const TouchScroll: FC = () => {
  const { gl, controls } = useThree();

  useEffect(() => {
    // Set after the controls connect, which turn touch scrolling off
    if (controls) {
      gl.domElement.style.touchAction = "pan-y";
    }
  }, [gl, controls]);

  return null;
};

/**
 * The landing page's plume: pick a preset, drag the throttle, orbit it.
 * @returns The scene and its controls
 */
export const HeroScene: FC = () => {
  const [name, set_name] = useState<AfterburnerPresetName>("afterburner");
  const [throttle, set_throttle] = useState(1.1);
  const params: AfterburnerParamsInput = AFTERBURNER_PRESETS[name].params;
  const radius = params.nozzle_radius_m ?? 0.5;
  const reach = radius * 40;

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.5]}
        shadows={NO_SHADOWS}
        camera={{ position: [12, 3, 20], fov: 40, near: 0.1, far: 5000 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            ...(props as object),
            antialias: false,
          });

          await renderer.init();

          return renderer;
        }}
      >
        <color attach="background" args={["#05070b"]} />
        <hemisphereLight args={["#8090b0", "#101010", 0.6]} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={radius * 4}
          maxDistance={reach * 2}
        />
        <TouchScroll />
        <Aim
          camera={[reach * 0.42, reach * 0.14, reach * 0.86]}
          target={[reach * 0.38, 0, 0]}
        />
        <Nozzle radius_m={radius} />
        <Afterburner preset={name} throttle={throttle} />
        <Grade />
      </Canvas>

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-black/55 p-3 text-xs text-white/90 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => set_name(preset.name)}
              className={cn(
                "rounded-full px-2.5 py-1 transition-colors",
                preset.name === name
                  ? "bg-orange-400 text-black"
                  : "bg-white/5 hover:bg-white/15",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 font-mono">
          throttle {throttle.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1.1}
            step={0.01}
            value={throttle}
            onChange={(event) => set_throttle(Number(event.target.value))}
            className="w-28 accent-orange-400"
          />
        </label>
      </div>
    </div>
  );
};

export default HeroScene;
