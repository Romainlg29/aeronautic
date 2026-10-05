"use client";

import dynamic from "next/dynamic";
import type { ComponentType, FC } from "react";

const Loading = () => <div className="example example-fallback">Starting…</div>;

// Browser only: three/webgpu has nothing to render on the server
const load = (
  module: () => Promise<{ default: ComponentType }>,
): ComponentType => dynamic(module, { ssr: false, loading: Loading });

const EXAMPLES = {
  "basic-jet": load(() => import("@/examples/basic-jet")),
  "presets-gallery": load(() => import("@/examples/presets-gallery")),
  "altitude-sweep": load(() => import("@/examples/altitude-sweep")),
  "on-a-model": load(() => import("@/examples/on-a-model")),
  "nozzle-shapes": load(() => import("@/examples/nozzle-shapes")),
  "throttle-ref": load(() => import("@/examples/throttle-ref")),
  "rocket-mix": load(() => import("@/examples/rocket-mix")),
  "wing-vapor": load(() => import("@/examples/wing-vapor")),
  "any-shape": load(() => import("@/examples/any-shape")),
  "one-flight": load(() => import("@/examples/one-flight")),
  "the-controls": load(() => import("@/examples/the-controls")),
  "thrust-vectoring": load(() => import("@/examples/thrust-vectoring")),
  "atmosphere-plume": load(() => import("@/examples/atmosphere-plume")),
  "atmosphere-vapor": load(() => import("@/examples/atmosphere-vapor")),
} satisfies Record<string, ComponentType>;

export type ExampleName = keyof typeof EXAMPLES;

/**
 * One live example.
 * @param props Which example
 * @returns The example
 */
export const Live: FC<{ name: ExampleName }> = ({ name }) => {
  const Example = EXAMPLES[name];

  return <Example />;
};
