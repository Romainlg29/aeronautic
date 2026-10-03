import { Afterburner } from "r3f-afterburner";
import { type FC, useState } from "react";
import { Stage } from "./stage";

// On its side, as on a test stand: the plume streams along +X, which a wide
// frame shows whole. A cylinder is along Y; a quarter turn about Z lays it
// along X with its top towards -X
const ALONG_X: [number, number, number] = [0, 0, Math.PI / 2];

/**
 * A kerolox engine whose mixture ratio you choose.
 * @returns The example
 */
export const RocketMix: FC = () => {
  const [mixture_ratio, set_mixture_ratio] = useState(2.36);

  return (
    <Stage
      camera={[14, 5, 34]}
      target={[12, 0, 0]}
      overlay={
        <div className="example-controls">
          <label>
            O/F {mixture_ratio.toFixed(2)}
            <input
              type="range"
              min={1.6}
              max={3.4}
              step={0.02}
              value={mixture_ratio}
              onChange={(event) =>
                set_mixture_ratio(Number(event.target.value))
              }
            />
          </label>
        </div>
      }
    >
      <mesh position={[-4, 0, 0]} rotation={ALONG_X}>
        <cylinderGeometry args={[1.2, 1.2, 6, 32]} />
        <meshStandardMaterial color="#d9dce2" roughness={0.6} />
      </mesh>
      <mesh position={[-0.5, 0, 0]} rotation={ALONG_X}>
        <cylinderGeometry args={[0.25, 0.46, 1, 24, 1, true]} />
        <meshStandardMaterial
          color="#3a3330"
          metalness={0.5}
          roughness={0.5}
          side={2}
        />
      </mesh>
      <Afterburner
        preset="rocket_kerolox"
        params={{ propellant: { fuel: "kerosene", mixture_ratio } }}
      />
    </Stage>
  );
};

export default RocketMix;
