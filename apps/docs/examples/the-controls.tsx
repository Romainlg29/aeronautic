import { Flight } from "@aeronautic/core";
import { FlightProvider } from "@aeronautic/core/react";
import { type ControlRig, ControlSurfaces } from "@aeronautic/controls/react";
import { type FC, type RefObject, useRef, useState } from "react";
import { Exhaust, Slider, useFighter } from "./fighter";
import { Stage } from "./stage";

// The fighter's every moving part, from the flight the sliders write: the
// stick and the pedals move the elevons, the rudders, the drag rudders and
// the nozzles; the throttle the nozzles' petals, the lever and the plumes;
// the levers the flaps, the air brakes and the gear. The canopy is not
// something a flight knows, so it is moved by hand, through the rig

/**
 * The fighter on its wheels, every part driven.
 * @param props Where to put its rig, for the canopy
 * @returns The model and its parts
 */
const Fighter: FC<{ rig: RefObject<ControlRig | null> }> = ({ rig }) => {
  const { scene, animations } = useFighter();

  return (
    <>
      <primitive object={scene} />
      <ControlSurfaces
        ref={rig}
        object={scene}
        animations={animations}
        exhaust={<Exhaust />}
      />
    </>
  );
};

/**
 * Every control of the fighter, on sliders.
 * @returns The example
 */
export const TheControls: FC = () => {
  // On the ground, gear down, at idle
  const [flight] = useState(() => new Flight({ gear: 1, throttle: 0 }));
  const rig = useRef<ControlRig>(null);
  const [canopy, set_canopy] = useState(0);

  return (
    <FlightProvider flight={flight}>
      <Stage
        camera={[-14, 6, -12]}
        target={[0, 0, 2]}
        floor={-2.2}
        reflections
        overlay={
          <div className="example-controls">
            <Slider
              label="stick, roll"
              min={-1}
              max={1}
              step={0.01}
              start={0}
              write={(f, roll) => f.set({ roll })}
            />
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
              start={0}
              write={(f, throttle) => f.set({ throttle })}
            />
            <Slider
              label="flaps"
              min={0}
              max={1}
              step={0.01}
              start={0}
              write={(f, flaps) => f.set({ flaps })}
            />
            <Slider
              label="air brake"
              min={0}
              max={1}
              step={0.01}
              start={0}
              write={(f, airbrake) => f.set({ airbrake })}
            />
            <Slider
              label="gear"
              min={0}
              max={1}
              step={1}
              start={1}
              write={(f, gear) => f.set({ gear })}
            />
            <label>
              canopy
              <input
                type="range"
                min={0}
                max={1}
                step={1}
                value={canopy}
                onChange={(event) => {
                  const share = event.target.valueAsNumber;

                  set_canopy(share);
                  rig.current?.set_clip("ANIM_Canopy_Open", share);
                }}
              />
            </label>
          </div>
        }
      >
        <FlightProvider flight={flight}>
          <Fighter rig={rig} />
        </FlightProvider>
      </Stage>
    </FlightProvider>
  );
};

export default TheControls;
