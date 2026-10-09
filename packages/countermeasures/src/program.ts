// A dispenser program: what one press of the button lets go
//
// A countermeasures dispenser set (the ALE-47's, say) fires to a program the
// crew or the threat picks: a burst of so many flares, so far apart, and a
// salvo of so many bursts, so far apart. The dispensers take turns, so the
// flares leave from both sides and the pattern is as wide as the aircraft

/**
 * A dispenser program.
 */
export type Program = {
  /** Flares in each burst */
  burst: number;

  /** Between the flares of a burst, seconds */
  burstIntervalS: number;

  /** Bursts in the salvo */
  salvo: number;

  /** Between the starts of two bursts, seconds */
  salvoIntervalS: number;

  /** Whether the dispensers take turns, or each flare leaves from the first */
  alternate: boolean;
};

/**
 * Two flares a quarter of a second apart, four times a second apart: a
 * self-protection program's shape.
 * @returns A fresh program
 */
export const default_program = (): Program => ({
  burst: 2,
  burstIntervalS: 0.25,
  salvo: 4,
  salvoIntervalS: 1,
  alternate: true,
});

/**
 * One flare of a program: when, and from which dispenser.
 */
export type Release = {
  /** Seconds after the program starts */
  timeS: number;

  /** Which dispenser, by index */
  dispenser: number;
};

/**
 * Every flare a program lets go, in order.
 * @param program The program
 * @param dispensers How many dispensers there are
 * @param first Which one fires first
 * @returns The releases, earliest first
 */
export const program_releases = (
  program: Program,
  dispensers: number,
  first = 0,
): Release[] => {
  const releases: Release[] = [];
  const count = Math.max(dispensers, 1);
  const burst = Math.max(Math.floor(program.burst), 0);
  const salvo = Math.max(Math.floor(program.salvo), 0);

  for (let round = 0; round < salvo; round++) {
    for (let flare = 0; flare < burst; flare++) {
      const index = releases.length;

      releases.push({
        timeS:
          round * Math.max(program.salvoIntervalS, 0) +
          flare * Math.max(program.burstIntervalS, 0),
        dispenser: program.alternate ? (first + index) % count : first % count,
      });
    }
  }

  return releases.sort((a, b) => a.timeS - b.timeS);
};
