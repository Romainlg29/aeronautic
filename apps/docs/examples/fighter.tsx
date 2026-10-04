import { useGLTF } from "@react-three/drei";
import { Afterburner } from "@aeronautic/afterburner";
import type { Flight } from "@aeronautic/core";
import { useFlightStore } from "@aeronautic/core/react";
import { type FC, useLayoutEffect, useState } from "react";
import type { Mesh, Object3D } from "three";
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
    // A little up the throat from the anchor, in the anchor's frame
    position={[0, 0, 0.18]}
    // The exhaust streams down the anchor's -Z: aft
    direction={[0, 0, -1]}
    // The exit as modelled: an oval 0.32 m wide and 0.23 m high
    params={{ nozzle_radius_m: 0.27, nozzle_aspect: 1.4 }}
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
