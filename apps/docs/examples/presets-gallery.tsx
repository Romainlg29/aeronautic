import {
  AFTERBURNER_PRESETS,
  type AfterburnerParamsInput,
  type AfterburnerPresetName,
} from "@aeronautic/afterburner";
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
  // Widened: some presets leave the radius to the defaults
  const params: AfterburnerParamsInput = AFTERBURNER_PRESETS[name].params;
  const radius = params.nozzleRadiusM ?? 0.5;

  // Far enough back to see the whole plume, whatever its size
  const reach = radius * 40;

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
        camera={[-reach * 0.75, reach * 0.12, reach * 0.45]}
        target={[0, 0, reach * 0.4]}
      />
      <Nozzle radius_m={radius} />
      <Afterburner preset={name} />
    </Stage>
  );
};

export default PresetsGallery;
