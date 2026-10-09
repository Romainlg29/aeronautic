import type { LightsSwitches } from "@aeronautic/lights";
import { Lights } from "@aeronautic/lights/react";
import { type FC, useMemo, useState } from "react";
import type { Object3D } from "three";
import { AtmosphereStage, LUMINANCE_SCALE } from "./atmosphere";
import { useFighter, useLensesUnlit } from "./fighter";

// The fighter on its approach at dusk, under takram's sky, every light on.
// The lights are in candelas, drawn at the atmosphere's luminance scale, so
// they hold their own against the sky as the camera opens up for the dusk;
// their glare and their beams are in core's volume pass, over the sky

// On the approach, some 300 m up, gear down
const ALTITUDE_M = 300;

// Civil twilight ends with the sun 6° below the horizon
const SUN_DEG = -4;

const SWITCHES: Record<keyof LightsSwitches, string> = {
  navigation: "position",
  anticollision: "strobes",
  landing: "landing",
  taxi: "taxi",
};

/**
 * The fighter, its lights on its own nodes, in the atmosphere's units.
 * @param props The switches
 * @returns The model and its lights
 */
const Fighter: FC<{ switches: LightsSwitches }> = ({ switches }) => {
  const { scene, nodes } = useFighter();

  useLensesUnlit(scene);

  // The anchors the model gives each light, as on the apron
  const airframe = useMemo(() => {
    const node = (name: string) => nodes[name] as Object3D;

    return {
      navigation: [
        { side: "left", at: node("LIGHT_Nav_L_Anchor") },
        { side: "right", at: node("LIGHT_Nav_R_Anchor") },
        { side: "aft", at: node("LIGHT_Nav_Tail_C_Anchor") },
      ],
      anticollision: [
        { at: node("LIGHT_Strobe_Top_C_Anchor"), color: "white" },
        { at: node("LIGHT_Strobe_Bottom_C_Anchor"), color: "red", phaseS: 0.5 },
      ],
      beams: [
        { at: node("LIGHT_Landing_C_Anchor"), lamp: "landing", onGear: true },
        { at: node("LIGHT_Taxi_C_Anchor"), lamp: "taxi", onGear: true },
      ],
    } as const;
  }, [nodes]);

  // One cd/m² is the atmosphere's luminance scale on screen
  const look = useMemo(() => ({ exposure: LUMINANCE_SCALE }), []);
  const air = useMemo(() => ({ altitudeM: ALTITUDE_M }), []);

  return (
    <group>
      <primitive object={scene} />
      <Lights airframe={airframe} switches={switches} air={air} look={look} />
    </group>
  );
};

/**
 * The fighter's lights in the atmosphere, the sun yours.
 * @returns The example
 */
export const AtmosphereLights: FC = () => {
  const [sun_deg, set_sun_deg] = useState(SUN_DEG);
  const [switches, set_switches] = useState<LightsSwitches>({
    navigation: true,
    anticollision: true,
    landing: true,
    taxi: true,
  });

  return (
    <AtmosphereStage
      sunElevationDeg={sun_deg}
      altitudeM={ALTITUDE_M}
      camera={[-26, 6, -20]}
      target={[0, -1, 0]}
      fov={40}
      overlay={
        <div className="example-controls">
          <label>
            sun {sun_deg}°
            <input
              type="range"
              min={-10}
              max={20}
              step={0.5}
              value={sun_deg}
              onChange={(event) => set_sun_deg(event.target.valueAsNumber)}
            />
          </label>
          {(Object.keys(SWITCHES) as (keyof LightsSwitches)[]).map((key) => (
            <label key={key}>
              {SWITCHES[key]}
              <input
                type="checkbox"
                checked={switches[key]}
                onChange={(event) =>
                  set_switches((previous) => ({
                    ...previous,
                    [key]: event.target.checked,
                  }))
                }
              />
            </label>
          ))}
        </div>
      }
    >
      <Fighter switches={switches} />
    </AtmosphereStage>
  );
};

export default AtmosphereLights;
