import { Afterburner } from "r3f-afterburner";
import { type FC, useState } from "react";
import { Nozzle, Stage } from "./stage";

/**
 * One engine at a throttle you choose.
 * @returns The example
 */
export const BasicJet: FC = () => {
  const [throttle, set_throttle] = useState(1.1);

  return (
    <Stage
      overlay={
        <div className="example-controls">
          <label>
            throttle {throttle.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1.1}
              step={0.01}
              value={throttle}
              onChange={(event) => set_throttle(Number(event.target.value))}
            />
          </label>
        </div>
      }
    >
      <Nozzle />
      <Afterburner preset="afterburner" throttle={throttle} />
    </Stage>
  );
};

export default BasicJet;
