import { useFrame } from "@react-three/fiber";
import { moist_air } from "@aeronautic/core";
import { WingVapor, type WingVaporHandle } from "@aeronautic/wing-vapor/react";
import { angle_of_attack_for_load } from "@aeronautic/wing-vapor/physics";
import { type FC, type RefObject, useMemo, useRef, useState } from "react";
import {
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from "three";
import { Stage } from "./stage";

// Any aircraft, measured from its own geometry
//
// Each one here is a few primitives: a planform extruded into a wing, a
// cylinder for a body, a tail. `capture` measures it from six depth views,
// station by station, and the vapour flies that shape. Nothing about any of
// them is typed in but the geometry

const SUN: [number, number, number] = [5, 10, 5];
const AIR = { altitudeM: 300, temperatureOffsetK: 10 };

// A planform's half, as [span, aft] points round its outline, root first.
// The model flies -Z, so aft is +Z
type Planform = [number, number][];

type Design = {
  label: string;
  wing: Planform;
  thickness_m: number;
  tail?: Planform;
  canard?: Planform;
  fin?: Planform;
  body: { nose: number; length: number; radius: number };
};

const DESIGNS: Record<string, Design> = {
  double_delta: {
    label: "Double delta",
    // 72 degrees to the crank, 50 beyond it
    wing: [
      [0, -7.5],
      [2.2, -0.7],
      [5.2, 2.9],
      [5.2, 4],
      [0, 4],
    ],
    thickness_m: 0.22,
    fin: [
      [0, 1],
      [3, 3.9],
      [3, 4.6],
      [0, 4.8],
    ],
    body: { nose: -10, length: 15, radius: 0.8 },
  },
  canard_delta: {
    label: "Canard delta",
    // A 53 degree delta, and an all-moving canard well ahead of it
    wing: [
      [0, -3],
      [5.4, 4.2],
      [5.4, 4.9],
      [0, 4.9],
    ],
    thickness_m: 0.22,
    canard: [
      [0, -6.4],
      [2.6, -4.6],
      [2.6, -4],
      [0, -4.3],
    ],
    fin: [
      [0, 1.5],
      [3, 4.2],
      [3, 4.9],
      [0, 5],
    ],
    body: { nose: -10.5, length: 15.5, radius: 0.8 },
  },
  swept: {
    label: "Swept wing, with a tail",
    // 32 degrees, an aspect ratio of about 6
    wing: [
      [0, -2.6],
      [8, 2.4],
      [8, 3.7],
      [0, 2.1],
    ],
    thickness_m: 0.3,
    tail: [
      [0, 6.2],
      [3, 8],
      [3, 8.7],
      [0, 8.4],
    ],
    fin: [
      [0, 6],
      [2.8, 8.2],
      [2.8, 8.9],
      [0, 8.6],
    ],
    body: { nose: -9, length: 18.5, radius: 1 },
  },
  straight: {
    label: "Straight wing trainer",
    wing: [
      [0, -1.2],
      [5.5, -0.8],
      [5.5, 0.6],
      [0, 1.3],
    ],
    thickness_m: 0.24,
    tail: [
      [0, 4.4],
      [2.2, 4.8],
      [2.2, 5.5],
      [0, 5.6],
    ],
    fin: [
      [0, 4.2],
      [1.8, 5.2],
      [1.8, 5.7],
      [0, 5.7],
    ],
    body: { nose: -5, length: 11, radius: 0.65 },
  },
};

type DesignName = keyof typeof DESIGNS;

const SKIN = new MeshStandardMaterial({
  color: "#c9ced6",
  metalness: 0.5,
  roughness: 0.4,
});

/**
 * A flat surface from a half planform, mirrored across the centreline.
 * @param half The half outline, as [span, aft]
 * @param thickness_m How thick
 * @param vertical Stood on its edge, as a fin, rather than flat
 * @returns The mesh
 */
const surface = (
  half: Planform,
  thickness_m: number,
  vertical = false,
): Mesh => {
  const outline = vertical
    ? half
    : [...half, ...half.map(([span, aft]) => [-span, aft]).reverse()];

  const shape = new Shape();

  outline.forEach(([span, aft], index) =>
    index === 0 ? shape.moveTo(span, -aft) : shape.lineTo(span, -aft),
  );

  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness_m,
    bevelEnabled: false,
  });

  // Extruded along +Z, centred on its thickness
  geometry.translate(0, 0, -thickness_m / 2);

  // The outline's (span, -aft) and the extrusion, onto the model's axes:
  // flat, span along X and thickness along Y; or stood up as a fin, the
  // outline's span its height
  geometry.applyMatrix4(
    vertical
      ? new Matrix4().set(0, 0, -1, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1)
      : new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1),
  );

  return new Mesh(geometry, SKIN);
};

/**
 * Build one aircraft from its design.
 * @param design The design
 * @returns The model
 */
const build = (design: Design): Group => {
  const model = new Group();

  model.add(surface(design.wing, design.thickness_m));

  if (design.tail) {
    model.add(surface(design.tail, design.thickness_m * 0.6));
  }

  if (design.canard) {
    model.add(surface(design.canard, design.thickness_m * 0.6));
  }

  if (design.fin) {
    const fin = surface(design.fin, design.thickness_m * 0.6, true);

    fin.position.y = design.body.radius * 0.6;
    model.add(fin);
  }

  const { nose, length, radius } = design.body;
  const nose_length = radius * 3;

  const body = new Mesh(
    new CylinderGeometry(radius, radius * 0.75, length - nose_length, 32),
    SKIN,
  );

  body.rotation.x = Math.PI / 2;
  body.position.z = nose + nose_length + (length - nose_length) / 2;
  model.add(body);

  const cone = new Mesh(new ConeGeometry(radius, nose_length, 32), SKIN);

  cone.rotation.x = -Math.PI / 2;
  cone.position.z = nose + nose_length / 2;
  model.add(cone);

  return model;
};

/**
 * One aircraft in a pull, pitched up by its angle of attack.
 * @param props Which design, the flight, and where to say what was measured
 * @returns The model and its vapour
 */
const Aircraft: FC<{
  design: DesignName;
  mach: number;
  g: number;
  humidity: number;
  readout: RefObject<HTMLSpanElement | null>;
}> = ({ design, mach, g, humidity, readout }) => {
  const model = useMemo(() => build(DESIGNS[design]), [design]);
  const body = useRef<Group>(null);
  const vapor = useRef<WingVaporHandle>(null);

  useFrame(() => {
    const current = vapor.current;

    if (!current || !body.current) return;

    const air = moist_air(AIR.altitudeM, humidity, AIR.temperatureOffsetK);
    const airspeed_m_s = mach * air.soundMPerS;
    const alpha = angle_of_attack_for_load(
      current.airframe,
      g,
      airspeed_m_s,
      air,
    );

    current.updateAir({ relativeHumidity: humidity });
    current.updateFlight({
      airspeedMPerS: airspeed_m_s,
      angleOfAttackRad: alpha,
    });
    body.current.rotation.x = alpha;

    if (readout.current) {
      const measured = current.airframe;

      readout.current.textContent =
        `measured: span ${measured.spanM.toFixed(1)} m · ` +
        `sweep ${((measured.leadingEdgeSweepRad * 180) / Math.PI).toFixed(0)}° · ` +
        `root chord ${measured.rootChordM.toFixed(1)} m · ` +
        `α ${((alpha * 180) / Math.PI).toFixed(1)}°`;
    }
  });

  return (
    <group ref={body}>
      <primitive object={model} />
      <WingVapor
        ref={vapor}
        capture={model}
        air={AIR}
        // A light airframe: what the load factor is pulled against
        airframe={{ massKg: 12_000 }}
        look={{ sunDirection: SUN }}
        forward={[0, 0, -1]}
      />
    </group>
  );
};

const FLIGHTS = {
  pull: { label: "Pull: 5 g at Mach 0.55", mach: 0.55, g: 5 },
  transonic: { label: "Transonic: 2 g at Mach 0.96", mach: 0.96, g: 2 },
} as const;

type FlightName = keyof typeof FLIGHTS;

/**
 * Wing vapour on aircraft measured from their own geometry.
 * @returns The example
 */
export const AnyShape: FC = () => {
  const [design, set_design] = useState<DesignName>("double_delta");
  const [flight, set_flight] = useState<FlightName>("pull");
  const [humidity, set_humidity] = useState(0.9);
  const readout = useRef<HTMLSpanElement>(null);

  return (
    <Stage
      camera={[-14, 12, 24]}
      target={[0, 0, 3]}
      floor={null}
      daylight
      overlay={
        <>
          <div className="example-controls">
            <label>
              aircraft
              <select
                value={design}
                onChange={(event) =>
                  set_design(event.target.value as DesignName)
                }
              >
                {Object.entries(DESIGNS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              flight
              <select
                value={flight}
                onChange={(event) =>
                  set_flight(event.target.value as FlightName)
                }
              >
                {Object.entries(FLIGHTS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              humidity {(humidity * 100).toFixed(0)} %
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={humidity}
                onChange={(event) => set_humidity(Number(event.target.value))}
              />
            </label>
          </div>
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <Aircraft
        design={design}
        mach={FLIGHTS[flight].mach}
        g={FLIGHTS[flight].g}
        humidity={humidity}
        readout={readout}
      />
    </Stage>
  );
};

export default AnyShape;
