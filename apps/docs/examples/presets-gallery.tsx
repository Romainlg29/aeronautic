import {
  AFTERBURNER_MAX_THROTTLE,
  AFTERBURNER_PRESETS,
  type AfterburnerPresetName,
  resolve_afterburner_params,
  resolve_afterburner_profile,
} from "@aeronautic/afterburner";
import { jet_state } from "@aeronautic/afterburner/physics";
import { Afterburner } from "@aeronautic/afterburner/react";
import { type FC, useState } from "react";
import { Aim, Nozzle, Stage } from "./stage";

const NAMES = Object.keys(AFTERBURNER_PRESETS) as AfterburnerPresetName[];

/**
 * Every built-in preset on one nozzle, its own size.
 * @returns The example
 */
export const PresetsGallery: FC = () => {
  const [name, set_name] = useState<AfterburnerPresetName>("rocket_methalox");
  const params = resolve_afterburner_params(undefined, name);
  const radius = params.nozzleRadiusM;

  // Far enough back to see the whole plume at full power, and the can: its
  // reach as the physics works it out, not a guess at it
  const reach =
    jet_state(
      params,
      AFTERBURNER_MAX_THROTTLE,
      resolve_afterburner_profile(undefined, name),
    ).reachM +
    radius * 4;

  return (
    <Stage
      overlay={
        <div className="example-controls">
          <label>
            preset
            <select
              value={name}
              onChange={(event) =>
                set_name(event.target.value as AfterburnerPresetName)
              }
            >
              {NAMES.map((preset) => (
                <option key={preset}>{preset}</option>
              ))}
            </select>
          </label>
        </div>
      }
    >
      <Aim
        camera={[-reach * 0.95, reach * 0.15, reach * 0.4]}
        target={[0, 0, reach * 0.4]}
      />
      <Nozzle radius_m={radius} />
      <Afterburner preset={name} />
    </Stage>
  );
};

export default PresetsGallery;
