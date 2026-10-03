"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Afterburner,
  AFTERBURNER_PRESETS,
  type AfterburnerParamsInput,
  type AfterburnerPresetName,
} from "r3f-afterburner";
import { type FC, useState } from "react";
import { WebGPURenderer } from "three/webgpu";
import { cn } from "@/lib/cn";
import { Grade, Nozzle } from "@/examples/stage";

const PRESETS: { name: AfterburnerPresetName; label: string }[] = [
  { name: "afterburner", label: "Afterburner" },
  { name: "rocket_kerolox", label: "Kerolox" },
  { name: "rocket_methalox", label: "Methalox" },
  { name: "rocket_hydrolox", label: "Hydrolox" },
  { name: "solid_booster", label: "Solid booster" },
  { name: "plasma", label: "Plasma" },
];

/**
 * A camera that drifts slowly round the plume, framed for its size.
 * @param props How far back the plume needs the camera
 * @returns Nothing
 */
const Drift: FC<{ reach: number }> = ({ reach }) => {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime * 0.12;

    camera.position.set(
      reach * (0.42 + Math.sin(t) * 0.12),
      reach * (0.14 + Math.sin(t * 0.7) * 0.05),
      reach * (0.78 + Math.cos(t) * 0.08),
    );
    camera.lookAt(reach * 0.38, 0, 0);
  });

  return null;
};

/**
 * The landing page's plume: pick a preset, drag the throttle.
 * @returns The scene and its controls
 */
export const HeroScene: FC = () => {
  const [name, set_name] = useState<AfterburnerPresetName>("afterburner");
  const [throttle, set_throttle] = useState(1);
  const params: AfterburnerParamsInput = AFTERBURNER_PRESETS[name].params;
  const radius = params.nozzle_radius_m ?? 0.5;

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.5]}
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
        <Drift reach={radius * 40} />
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
            max={1}
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
