import { useFrame } from "@react-three/fiber";
import {
  Afterburner,
  AfterburnerBatch,
  type AfterburnerBatchCore,
} from "@aeronautic/afterburner";
import { type FC, type RefObject, useRef, useState } from "react";
import { Nozzle, Stage } from "./stage";

const CEILING_M = 11000;
const CRUISE_M_S = 250;
const PERIOD_S = 30;

/**
 * Climb and descend, writing the batch's profile every frame.
 * @param props The batch to write to, and where to say how high it is
 * @returns Nothing
 */
const Climb: FC<{
  batch: RefObject<AfterburnerBatchCore | null>;
  readout: RefObject<HTMLSpanElement | null>;
  paused: boolean;
}> = ({ batch, readout, paused }) => {
  const phase = useRef(0);

  useFrame((_, delta) => {
    if (!paused) phase.current += delta / PERIOD_S;

    // Up and down again, lingering at the ground and at the top
    const height = 0.5 - 0.5 * Math.cos(phase.current * Math.PI * 2);
    const altitude_m = height * CEILING_M;
    const airspeed_m_s = Math.sqrt(height) * CRUISE_M_S;

    batch.current?.update_profile({ altitude_m, airspeed_m_s });

    if (readout.current) {
      readout.current.textContent = `${(altitude_m / 1000).toFixed(1)} km at ${airspeed_m_s.toFixed(0)} m/s`;
    }
  });

  return null;
};

/**
 * One engine at full reheat, flown from the ground to the tropopause.
 * @returns The example
 */
export const AltitudeSweep: FC = () => {
  const batch = useRef<AfterburnerBatchCore>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const [paused, set_paused] = useState(false);

  return (
    <Stage
      overlay={
        <>
          <div className="example-controls">
            <label>
              pause
              <input
                type="checkbox"
                checked={paused}
                onChange={(event) => set_paused(event.target.checked)}
              />
            </label>
          </div>
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Climb batch={batch} readout={readout} paused={paused} />
      <Nozzle />
      <AfterburnerBatch ref={batch} preset="afterburner">
        <Afterburner />
      </AfterburnerBatch>
    </Stage>
  );
};

export default AltitudeSweep;
