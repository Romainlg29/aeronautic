import { Flight } from "@aeronautic/core";
import {
  FlightProvider,
  useFlight,
  useFlightFrame,
} from "@aeronautic/core/react";
import { ControlSurfaces } from "@aeronautic/controls/react";
import { WingVapor } from "@aeronautic/wing-vapor/react";
import { type FC, useRef, useState } from "react";
import type { Group } from "three";
import { airframe_only, Exhaust, Slider, useFighter } from "./fighter";
import { Stage } from "./stage";

// One flight, written by the sliders outside the canvas, read by everything
// inside it: the control surfaces, the nozzles, the plumes and the vapour,
// and by the readout under it

const SUN: [number, number, number] = [5, 10, 5];

/**
 * The fighter, held still and pitched up by its angle of attack so it flies
 * level, with everything that reads the flight on it.
 * @returns The model and its effects
 */
const Fighter: FC = () => {
  const { scene, animations } = useFighter();
  const body = useRef<Group>(null);

  useFlightFrame((flight) => {
    if (body.current) body.current.rotation.x = flight.angleOfAttackRad;
  });

  return (
    <group ref={body}>
      <primitive object={scene} />
      <ControlSurfaces
        object={scene}
        animations={animations}
        exhaust={<Exhaust />}
      />
      <WingVapor
        capture={scene}
        captureFilter={airframe_only}
        look={{ sunDirection: SUN }}
        forward={[0, 0, -1]}
      />
    </group>
  );
};

/**
 * What a HUD would show, rendered ten times a second at most.
 * @returns The readout
 */
const Readout: FC = () => {
  const mach = useFlight((f) => f.mach.toFixed(2), { hz: 10 });
  const knots = useFlight((f) => Math.round(f.airspeedMPerS * 1.944), {
    hz: 10,
  });
  const air = useFlight((f) => Math.round(f.temperatureK - 273.15));
  const spread = useFlight((f) => (f.temperatureK - f.dewPointK).toFixed(1));
  const density = useFlight((f) => Math.round(f.densityRatio * 100));

  return (
    <span className="example-note">
      Mach {mach} · {knots} kt · {air} °C, dew point {spread} K below · density{" "}
      {density} % of sea level&apos;s
    </span>
  );
};

// Where it starts: low over the sea on a humid summer day, pulling
const ALTITUDE_M = 300;
const MACH = 0.55;
const ALPHA_DEG = 12;

/**
 * The airspeed of a Mach number, in the air the flight is in now.
 * @param flight The flight
 * @param mach The Mach number
 * @returns In metres per second
 */
const at_mach = (flight: Flight, mach: number) =>
  mach * flight.values.soundMPerS;

/**
 * One flight for the whole example, held outside the canvas so the sliders
 * and the readout share it with the scene.
 * @returns The example
 */
export const OneFlight: FC = () => {
  const [flight] = useState(() => {
    const made = new Flight({
      altitudeM: ALTITUDE_M,
      temperatureOffsetK: 10,
      relativeHumidity: 0.9,
      angleOfAttackRad: (ALPHA_DEG * Math.PI) / 180,
      pitch: ALPHA_DEG / 20,
      throttle: 1.1,
    });

    return made.set({ airspeedMPerS: at_mach(made, MACH) });
  });

  // The Mach number the slider asks for, kept as the altitude changes the
  // speed of sound
  const mach = useRef(MACH);

  return (
    <FlightProvider flight={flight}>
      <Stage
        camera={[-20, 9, -14]}
        target={[0, 0, 4]}
        floor={null}
        reflections
        daylight
        overlay={
          <>
            <div className="example-controls">
              <Slider
                label="Mach"
                min={0.3}
                max={0.95}
                step={0.01}
                start={MACH}
                write={(f, value) => {
                  mach.current = value;
                  f.set({ airspeedMPerS: at_mach(f, value) });
                }}
              />
              <Slider
                label="angle of attack"
                min={0}
                max={20}
                step={0.5}
                start={ALPHA_DEG}
                write={(f, degrees) =>
                  f.set({
                    angleOfAttackRad: (degrees * Math.PI) / 180,
                    // The stick held back for it, so the elevons show it
                    pitch: degrees / 20,
                  })
                }
              />
              <Slider
                label="throttle"
                min={0}
                max={1.1}
                step={0.01}
                start={1.1}
                write={(f, throttle) => f.set({ throttle })}
              />
              <Slider
                label="altitude"
                min={0}
                max={12000}
                step={100}
                start={ALTITUDE_M}
                write={(f, altitude_m) => {
                  f.set({ altitudeM: altitude_m });
                  f.set({ airspeedMPerS: at_mach(f, mach.current) });
                }}
              />
            </div>
            <Readout />
          </>
        }
      >
        {/* Context doesn't cross into the canvas: the same flight again */}
        <FlightProvider flight={flight}>
          <Fighter />
        </FlightProvider>
      </Stage>
    </FlightProvider>
  );
};

export default OneFlight;
