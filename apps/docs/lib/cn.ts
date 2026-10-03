/**
 * Join class names, skipping the falsy ones.
 * @param classes Class names, or nothing
 * @returns One class string
 */
export const cn = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");
