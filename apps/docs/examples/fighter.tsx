import { useGLTF } from "@react-three/drei";
import { Afterburner } from "@aeronautic/afterburner/react";
import type { Flight } from "@aeronautic/core";
import { useFlightStore } from "@aeronautic/core/react";
import { type FC, useLayoutEffect, useState } from "react";
import type { Mesh, MeshStandardMaterial, Object3D } from "three";
import { base_path } from "@/lib/shared";

// What the examples built on the docs' fighter share: the model, the plume
// each of its engines carries, and a slider that writes the flight

export const MODEL = `${base_path}/fighter.glb`;

/**
 * The fighter, its afterburner cones and pylons hidden as their extras ask.
 * @returns The loaded glTF
 */
export const useFighter = () => {
  const gltf = useGLTF(MODEL);

  useLayoutEffect(() => {
    // Flagged in their extras, which three hands over as userData
    gltf.scene.traverse((node) => {
      if (node.userData.visible_default === false) node.visible = false;
    });
  }, [gltf.scene]);

  return gltf;
};

// The lenses of the lights `<Lights>` draws: its glare is each light from its
// candelas, its disc the lens itself, so the glow the model gives them is the
// light counted twice. A nav light's 40 cd ahead, 25.1391's, through the
// model's lens, 6 cm across, is some 14 000 cd/m²; the model's glow is a
// fixed 8 in the scene's units, whatever they are, under the atmosphere's
// 600 000 cd/m². A few pixels across, many times brighter than the glare, it is
// drawn or not by where it falls between the pixels, and the bloom spreads
// that into a halo blinking as the camera turns
const LENS = /^Light_(Nav_Red|Nav_Green|White)$/;

/**
 * The model's glow taken off the lenses of the lights `<Lights>` draws, while
 * it draws them.
 * @param scene The fighter
 */
export const useLensesUnlit = (scene: Object3D) => {
  useLayoutEffect(() => {
    const kept = new Map<MeshStandardMaterial, number>();

    scene.traverse((node) => {
      const material = (node as Mesh).material as
        | MeshStandardMaterial
        | undefined;

      if (material?.emissive && LENS.test(material.name) && !kept.has(material))
        kept.set(material, material.emissiveIntensity);
    });

    for (const material of kept.keys()) material.emissiveIntensity = 0;

    return () => {
      for (const [material, intensity] of kept)
        material.emissiveIntensity = intensity;
    };
  }, [scene]);
};

// Not the shape the air flies round: the gear and its doors, and the pylons
const NOT_AIRFRAME =
  /^(GEAR_|DOOR_|HINGE_Gear|CTRL_Gear|HINGE_Door|CTRL_Door|PYLON_|BAY_)/;

/**
 * Whether a mesh of the fighter is part of its airframe.
 * @param mesh The mesh
 * @returns Whether to measure it
 */
export const airframe_only = (mesh: Mesh): boolean => {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible || NOT_AIRFRAME.test(node.name)) return false;
  }

  return true;
};

/**
 * The plume on one of the fighter's engines. Inside an `<Engine>` it sits on
 * its exhaust and runs at its throttle, so it needs no more than its shape.
 * @returns The plume
 */
export const Exhaust: FC = () => (
  <Afterburner
    preset="afterburner"
    // At the petals' trailing edge, in the anchor's frame
    position={[0, 0, 0.08]}
    // The exhaust streams down the anchor's -Z: aft
    direction={[0, 0, -1]}
    // The exit as modelled, inside the petals: an oval 0.76 m wide and 0.45 m
    // high, sized as the round exit of its area
    params={{ nozzleRadiusM: 0.29, nozzleAspect: 1.67 }}
  />
);

/**
 * A slider that writes one field of the flight.
 * @param props What it shows, its range and how it writes
 * @returns The slider
 */
export const Slider: FC<{
  label: string;
  min: number;
  max: number;
  step: number;
  start: number;
  write: (flight: Flight, value: number) => void;
}> = ({ label, min, max, step, start, write }) => {
  const flight = useFlightStore();
  const [value, set_value] = useState(start);

  return (
    <label>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = event.target.valueAsNumber;

          set_value(next);
          if (flight) write(flight, next);
        }}
      />
    </label>
  );
};
