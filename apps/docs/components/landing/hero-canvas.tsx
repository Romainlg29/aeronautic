"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <Glow />,
});

/**
 * What shows while the scene loads: a painted plume.
 * @returns The stand-in
 */
const Glow: FC = () => (
  <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#05070b]">
    <div className="absolute left-[18%] top-1/2 h-24 w-[70%] -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-100 via-orange-400/70 to-transparent blur-2xl" />
    <div className="absolute left-[18%] top-1/2 h-6 w-[45%] -translate-y-1/2 rounded-full bg-gradient-to-r from-white via-amber-200/80 to-transparent blur-md" />
  </div>
);

/**
 * The live hero. WebGPURenderer falls back to WebGL 2 by itself.
 * @returns The scene
 */
export const HeroCanvas: FC = () => <HeroScene />;
