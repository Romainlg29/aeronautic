import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { moist_air } from "@aeronautic/core";
import type { ContrailLook } from "@aeronautic/contrails";
import { Contrails, type ContrailsHandle } from "@aeronautic/contrails/react";
import {
  age_at_dilution,
  humidity_over_water,
} from "@aeronautic/contrails/physics";
import {
  type FC,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Group, LoopOnce, type Object3D } from "three";
import { base_path } from "@/lib/shared";
import { Stage } from "./stage";

const MODEL = `${base_path}/fighter.glb`;

// The same sun as the stage's directional light
const SUN: [number, number, number] = [-5, 10, 5];

const G0 = 9.80665;

// Cruise, Mach 0.85 at the tropopause
const AIRSPEED_M_S = 250;

// Level flight, and a level turn: a bank tilts the lift, whose level share
// turns the aircraft at g tan φ / V, and whose vertical share must still
// hold its weight, 1 / cos φ g
const FLIGHTS = {
  cruise: { label: "Cruise: level, Mach 0.85", bank_deg: 0 },
  turn: { label: "Level turn: 60° bank, 2 g", bank_deg: 60 },
} as const;

type FlightName = keyof typeof FLIGHTS;

// The throttle, as a `Flight` and the afterburner read it: dry, the engines
// hold the flight; at the stop the burner burns six times the fuel
const ENGINES = {
  dry: { label: "Dry", throttle: 1 },
  reheat: { label: "Full reheat", throttle: 1.1 },
} as const;

type EnginesName = keyof typeof ENGINES;

const FUELS = {
  kerosene: "Kerosene",
  hydrogen: "Hydrogen",
} as const;

type FuelName = keyof typeof FUELS;

export type Settings = {
  flight: FlightName;
  engines: EnginesName;
  altitude_m: number;
  ice_humidity: number;
  fuel: FuelName;
};

// Cruise at the tropopause, in air a little supersaturated over ice
export const START_SETTINGS: Settings = {
  flight: "cruise",
  engines: "dry",
  altitude_m: 11_000,
  ice_humidity: 1.12,
  fuel: "kerosene",
};

const SUN_LOOK: Partial<ContrailLook> = { sunDirection: SUN };

/**
 * The fighter at cruise, its contrails from its two nozzles.
 * @param props The settings, where to say what the trails are doing, and
 *   the light, by default the stage's sun
 * @returns The model and its trails
 */
export const ContrailsFighter: FC<{
  settings: Settings;
  readout: RefObject<HTMLSpanElement | null>;
  look?: Partial<ContrailLook>;
}> = ({ settings, readout, look = SUN_LOOK }) => {
  const { scene, nodes, animations } = useGLTF(MODEL);
  const heading = useRef<Group>(null);
  const body = useRef<Group>(null);
  const trails = useRef<ContrailsHandle>(null);
  const { actions } = useAnimations(animations, body);

  useEffect(() => {
    // The afterburner cones and the pylons are meant hidden, flagged so in
    // their extras, which three hands over as userData
    scene.traverse((node) => {
      if (node.userData.visible_default === false) node.visible = false;
    });

    // It's modelled on its wheels: fold them away
    const retract = actions.ANIM_Gear_Retract;

    if (!retract) return;

    retract.setLoop(LoopOnce, 1);
    retract.clampWhenFinished = true;
    retract.play();
  }, [scene, actions]);

  // The model's nozzle exits: the trails start where they are, every frame
  const airframe = useMemo(
    () => ({ engines: [nodes.FX_Exhaust_L, nodes.FX_Exhaust_R] as Object3D[] }),
    [nodes],
  );

  // The humidity is asked for over ice, the one that decides a contrail;
  // the air takes it over water, at the day's temperature
  const temperature_k = moist_air(settings.altitude_m, 0, 0).temperatureK;
  const relative_humidity = humidity_over_water(
    settings.ice_humidity,
    temperature_k,
  );

  const bank = (FLIGHTS[settings.flight].bank_deg * Math.PI) / 180;
  const load = 1 / Math.cos(bank);
  const turn_rad_s = (G0 * Math.tan(bank)) / AIRSPEED_M_S;

  useFrame((_, delta) => {
    if (heading.current) heading.current.rotation.y += turn_rad_s * delta;
    if (body.current) body.current.rotation.z = bank;

    const current = trails.current;

    if (!current || !readout.current) return;

    const state = current.state;
    const behind_m = age_at_dilution(state.formation.dilution) * AIRSPEED_M_S;

    readout.current.textContent = !state.visible
      ? `${(state.air.temperatureK - 273.15).toFixed(1)} °C, warmer than the ` +
        `${(state.criterion.thresholdK - 273.15).toFixed(1)} °C a contrail needs: none forms`
      : `${(state.air.temperatureK - 273.15).toFixed(1)} °C, under the ` +
        `${(state.criterion.thresholdK - 273.15).toFixed(1)} °C threshold · ` +
        `forms ${behind_m.toFixed(0)} m behind · ` +
        `${(state.fuelPerMetreKg * 1000).toFixed(1)} g of fuel a metre · ` +
        `${(state.iceHumidity * 100).toFixed(0)} % over ice: ` +
        (state.persistent ? "it persists" : "it fades");
  });

  return (
    <group ref={heading}>
      <group ref={body}>
        <primitive object={scene} />
        {/*
          On the model's origin, which flies -Z. The air and the flight are
          the day's; the mass and span are the airframe's defaults, a heavy
          fighter's, and set the wake that carries the trails down
        */}
        <Contrails
          ref={trails}
          airframe={airframe}
          flight={{
            airspeedMPerS: AIRSPEED_M_S,
            loadFactor: load,
            throttle: ENGINES[settings.engines].throttle,
          }}
          air={{
            altitudeM: settings.altitude_m,
            relativeHumidity: relative_humidity,
          }}
          fuel={settings.fuel}
          look={look}
          lengthS={20}
        />
      </group>
    </group>
  );
};

/**
 * The flight, the engines, the fuel, the altitude and the humidity over ice.
 * @param props The settings, how to change them, and any controls to add
 * @returns The controls
 */
export const ContrailsControls: FC<{
  settings: Settings;
  change: (next: Partial<Settings>) => void;
  children?: ReactNode;
}> = ({ settings, change, children }) => (
  <div className="example-controls">
    {children}
    <label>
      flight
      <select
        value={settings.flight}
        onChange={(event) =>
          change({ flight: event.target.value as FlightName })
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
      engines
      <select
        value={settings.engines}
        onChange={(event) =>
          change({ engines: event.target.value as EnginesName })
        }
      >
        {Object.entries(ENGINES).map(([key, value]) => (
          <option key={key} value={key}>
            {value.label}
          </option>
        ))}
      </select>
    </label>
    <label>
      fuel
      <select
        value={settings.fuel}
        onChange={(event) => change({ fuel: event.target.value as FuelName })}
      >
        {Object.entries(FUELS).map(([key, value]) => (
          <option key={key} value={key}>
            {value}
          </option>
        ))}
      </select>
    </label>
    <label>
      altitude {(settings.altitude_m / 1000).toFixed(1)} km
      <input
        type="range"
        min={6000}
        max={13_000}
        step={100}
        value={settings.altitude_m}
        onChange={(event) => change({ altitude_m: Number(event.target.value) })}
      />
    </label>
    <label>
      humidity over ice {(settings.ice_humidity * 100).toFixed(0)} %
      <input
        type="range"
        min={0.4}
        max={1.4}
        step={0.01}
        value={settings.ice_humidity}
        onChange={(event) =>
          change({ ice_humidity: Number(event.target.value) })
        }
      />
    </label>
  </div>
);

/**
 * Contrails on the docs' fighter at cruise.
 * @returns The example
 */
export const ContrailsExample: FC = () => {
  const [settings, set_settings] = useState<Settings>(START_SETTINGS);
  const readout = useRef<HTMLSpanElement>(null);

  const change = (next: Partial<Settings>) =>
    set_settings((previous) => ({ ...previous, ...next }));

  return (
    <Stage
      camera={[44, 6, -76]}
      target={[0, -2, 34]}
      fov={16}
      floor={null}
      reflections
      daylight
      overlay={
        <>
          <ContrailsControls settings={settings} change={change} />
          <span ref={readout} className="example-note" />
        </>
      }
    >
      <ContrailsFighter settings={settings} readout={readout} />
    </Stage>
  );
};

export default ContrailsExample;
