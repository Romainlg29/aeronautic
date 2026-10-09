import type { FC } from "react";
import { CountermeasuresExample } from "./countermeasures";

/**
 * The docs' fighter letting flares and chaff go high up, the altitude its
 * to change.
 * @returns The example
 */
export const CountermeasuresAltitudeExample: FC = () => (
  <CountermeasuresExample start={{ altitude_m: 12_000 }} altitude />
);

export default CountermeasuresAltitudeExample;
