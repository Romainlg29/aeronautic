import {
  type AfterburnerHooks,
  type AfterburnerParamsInput,
} from "@aeronautic/afterburner";
import { Afterburner, AfterburnerBatch } from "@aeronautic/afterburner/react";
import { nozzle_outline_fit } from "@aeronautic/afterburner/physics";
import { type FC, useMemo, useState } from "react";
import { DoubleSide, Path, Shape } from "three";
import { atan, cos, float } from "three/tsl";
import { Stage } from "./stage";

// The same engine four times over, each through a different exit: round, an
// oval, a flat rectangle, and a lobed outline of its own, drawn by a hook

const RADIUS_M = 0.4;

// Eight lobes, 15% deep: r(θ) = 1 + 0.15 cos 8θ, in nozzle radii
const LOBES = 8;
const LOBE_DEPTH = 0.15;

// Any outline, as its radius in every direction. A hook is TSL, so this is
// the same formula as `lobed` below, in nodes
const LOBED: AfterburnerHooks = {
  outline: {
    radius: (direction) =>
      cos(atan(direction.y, direction.x).mul(LOBES))
        .mul(LOBE_DEPTH)
        .add(float(1)),
    // The furthest it ever reaches, which the plume's bounds are widened to
    reach: 1 + LOBE_DEPTH,
  },
};

/**
 * The lobed outline's radius, on the CPU, for its can.
 * @param angle Round the axis, from the width
 * @returns The radius, in nozzle radii
 */
const lobed = (angle: number) => 1 + LOBE_DEPTH * Math.cos(LOBES * angle);

/**
 * A superellipse's radius, for a can that fits its plume.
 * @param aspect Width over height
 * @param squareness The exponent
 * @returns The radius in every direction, in nozzle radii
 */
const superellipse = (aspect: number, squareness: number) => {
  const { areaScale: area_scale } = nozzle_outline_fit(aspect, squareness);
  const width = area_scale * Math.sqrt(aspect);
  const height = area_scale / Math.sqrt(aspect);

  return (angle: number) =>
    1 /
    ((Math.abs(Math.cos(angle)) / width) ** squareness +
      (Math.abs(Math.sin(angle)) / height) ** squareness) **
      (1 / squareness);
};

/**
 * Trace an outline as a closed path.
 * @param path What to draw into
 * @param radius The outline, in metres, round the axis
 * @returns The path
 */
const trace = <T extends Path>(path: T, radius: (angle: number) => number) => {
  for (let step = 0; step <= 128; step += 1) {
    const angle = (step / 128) * Math.PI * 2;
    const r = radius(angle);
    const [x, y] = [r * Math.cos(angle), r * Math.sin(angle)];

    if (step === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }

  return path;
};

/**
 * An engine can with any exit, its exit at the origin, facing +Z.
 * @param props Its outline in nozzle radii, and how far it is rolled
 * @returns The mesh
 */
const Can: FC<{ outline: (angle: number) => number; roll: number }> = ({
  outline,
  roll,
}) => {
  const shape = useMemo(() => {
    const wall = trace(new Shape(), (angle) => outline(angle) * RADIUS_M * 1.1);

    wall.holes.push(trace(new Path(), (angle) => outline(angle) * RADIUS_M));

    return wall;
  }, [outline]);

  // The shape's x is the width and it extrudes along its own z: a half turn
  // about Y sends that up the plume, upstream, and the width along -X
  return (
    <group rotation={[0, 0, roll]}>
      <mesh rotation={[0, Math.PI, 0]}>
        <extrudeGeometry
          args={[shape, { depth: RADIUS_M * 4, bevelEnabled: false }]}
        />
        <meshStandardMaterial
          color="#3d424c"
          metalness={0.6}
          roughness={0.45}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
};

type Exit = {
  name: string;
  params: AfterburnerParamsInput;
  outline: (angle: number) => number;
};

const EXITS: Exit[] = [
  { name: "round", params: {}, outline: () => 1 },
  {
    name: "oval",
    params: { nozzleAspect: 1.6 },
    outline: superellipse(1.6, 2),
  },
  {
    name: "flat",
    params: { nozzleAspect: 3, nozzleSquareness: 6 },
    outline: superellipse(3, 6),
  },
];

const SPACING_M = 2.4;

/**
 * Four exits on one engine, with the outline's roll and how long it lasts.
 * @returns The example
 */
export const NozzleShapes: FC = () => {
  const [roll, set_roll] = useState(0);
  const [length, set_length] = useState(1);

  const shared: AfterburnerParamsInput = {
    nozzleRadiusM: RADIUS_M,
    nozzleRoll: roll,
    nozzleOutlineLength: length,
  };

  // Their lane across the stage, the lobed one last
  const lane = (index: number) => (index - 1.5) * SPACING_M;

  return (
    <Stage
      camera={[-7, 7, -9]}
      target={[0, 0, 4]}
      floor={-2}
      overlay={
        <div className="example-controls">
          <label>
            roll {roll.toFixed(2)} rad
            <input
              type="range"
              min={-Math.PI / 2}
              max={Math.PI / 2}
              step={0.01}
              value={roll}
              onChange={(event) => set_roll(Number(event.target.value))}
            />
          </label>
          <label>
            shape lasts {length.toFixed(2)} cores
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={length}
              onChange={(event) => set_length(Number(event.target.value))}
            />
          </label>
        </div>
      }
    >
      {EXITS.map(({ name, params, outline }, index) => (
        <group key={name} position={[-lane(index), 0, 0]}>
          <Can outline={outline} roll={roll} />
          <Afterburner preset="afterburner" params={{ ...shared, ...params }} />
        </group>
      ))}

      {/* A hook is the batch's, so the lobed exit gets a batch of its own */}
      <AfterburnerBatch hooks={LOBED}>
        <group position={[-lane(3), 0, 0]}>
          <Can outline={lobed} roll={roll} />
          <Afterburner preset="afterburner" params={shared} />
        </group>
      </AfterburnerBatch>
    </Stage>
  );
};

export default NozzleShapes;
