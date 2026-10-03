import { useFrame } from "@react-three/fiber";
import { Afterburner, type AfterburnerHandle } from "r3f-afterburner";
import { type FC, type RefObject, useRef } from "react";
import { Nozzle, Stage } from "./stage";

/**
 * Spool up and down, writing the throttle through a ref.
 * @returns Nothing
 */
const Spool: FC<{ engine: RefObject<AfterburnerHandle | null> }> = ({
  engine,
}) => {
  useFrame(({ clock }) => {
    if (!engine.current) return;

    // Through the burner threshold and back, every few seconds
    engine.current.throttle = 0.6 + 0.4 * Math.sin(clock.elapsedTime * 0.9);

    // A wobble of the nozzle's aim, as a vectoring nozzle would
    const pitch = 0.08 * Math.sin(clock.elapsedTime * 0.6);
    engine.current.set_direction([1, pitch, 0]);
  });

  return null;
};

/**
 * Throttle and aim changed every frame without a React render.
 * @returns The example
 */
export const ThrottleRef: FC = () => {
  const engine = useRef<AfterburnerHandle>(null);

  return (
    <Stage>
      <Spool engine={engine} />
      <Nozzle />
      <Afterburner ref={engine} preset="afterburner" />
    </Stage>
  );
};

export default ThrottleRef;
