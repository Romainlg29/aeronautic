import { Flight } from "@aeronautic/core";
import { FlightProvider } from "@aeronautic/core/react";
import { ControlSurfaces } from "@aeronautic/controls/react";
import { type FC, type RefObject, useRef, useState } from "react";
import { Exhaust, Slider, useFighter } from "./fighter";
import { Stage } from "./stage";

// The nozzles, close: each turns on the model's own gimbal, inside one round
// limit, and its plume turns with it. The petals close down to military power
// and open wide in reheat

/**
 * The fighter, seen from aft and to the side, its nozzles following the stick.
 * @param props Where to say where the exhausts point
 * @returns The model and its parts
 */
const Fighter: FC<{ readout: RefObject<HTMLSpanElement | null> }> = ({
  readout,
}) => {
  const { scene, animations } = useFighter();

  // Read in place by each engine, so a new one each render is fine
  const engine = {
    onVector: (pitch_deg: number, yaw_deg: number) => {
      if (!readout.current) return;

      readout.current.textContent =
        `exhaust ${Math.abs(pitch_deg).toFixed(1)}° ${pitch_deg >= 0 ? "up" : "down"}, ` +
        `${Math.abs(yaw_deg).toFixed(1)}° ${yaw_deg >= 0 ? "right" : "left"}`;
    },
  };

  return (
    <>
      <primitive object={scene} />
      <ControlSurfaces
        object={scene}
        animations={animations}
        engine={engine}
        exhaust={<Exhaust />}
      />
    </>
  );
};

/**
 * Thrust vectoring on the fighter's two nozzles.
 * @returns The example
 */
export const ThrustVectoring: FC = () => {
  const [flight] = useState(() => new Flight({ throttle: 1 }));
  const readout = useRef<HTMLSpanElement>(null);

  return (
    <FlightProvider flight={flight}>
      <Stage
        camera={[7, 0.6, 14]}
        target={[0, 0, 8]}
        floor={null}
        reflections
        overlay={
          <>
            <div className="example-controls">
              <Slider
                label="stick, pitch"
                min={-1}
                max={1}
                step={0.01}
                start={0}
                write={(f, pitch) => f.set({ pitch })}
              />
              <Slider
                label="pedals"
                min={-1}
                max={1}
                step={0.01}
                start={0}
                write={(f, yaw) => f.set({ yaw })}
              />
              <Slider
                label="throttle"
                min={0}
                max={1.1}
                step={0.01}
                start={1}
                write={(f, throttle) => f.set({ throttle })}
              />
            </div>
            <span ref={readout} className="example-note">
              exhaust straight aft
            </span>
          </>
        }
      >
        <FlightProvider flight={flight}>
          <Fighter readout={readout} />
        </FlightProvider>
      </Stage>
    </FlightProvider>
  );
};

export default ThrustVectoring;
