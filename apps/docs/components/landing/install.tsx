"use client";

import { Check, Copy } from "lucide-react";
import { type FC, useState } from "react";

/**
 * A shell command with a copy button.
 * @param props The command
 * @returns The command line
 */
export const Install: FC<{ command: string }> = ({ command }) => {
  const [copied, set_copied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          set_copied(true);
          setTimeout(() => set_copied(false), 1500);
        });
      }}
      className="group inline-flex max-w-full items-center gap-3 rounded-lg border bg-fd-card px-4 py-2.5 font-mono text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
    >
      <span className="text-fd-primary">$</span>
      <span className="truncate">{command}</span>
      {copied ? (
        <Check className="size-4 shrink-0 text-green-500" />
      ) : (
        <Copy className="size-4 shrink-0 opacity-60 group-hover:opacity-100" />
      )}
    </button>
  );
};
