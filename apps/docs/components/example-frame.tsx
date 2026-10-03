"use client";

import { Code2, Play } from "lucide-react";
import { type FC, type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { type ExampleName, Live } from "./live";

type Tab = "preview" | "code";

/**
 * A live example with its source a tab away. The canvas stays mounted while
 * the code shows, so switching back does not restart WebGPU.
 * @param props Which example, its file name, and its highlighted source
 * @returns The frame
 */
export const ExampleFrame: FC<{
  name: ExampleName;
  file: string;
  code: ReactNode;
}> = ({ name, file, code }) => {
  const [tab, set_tab] = useState<Tab>("preview");

  const button = (value: Tab, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => set_tab(value)}
      aria-pressed={tab === value}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        tab === value
          ? "bg-fd-background text-fd-foreground shadow-sm"
          : "text-fd-muted-foreground hover:text-fd-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex gap-1 rounded-lg bg-fd-muted p-0.5">
          {button("preview", "Preview", <Play className="size-3.5" />)}
          {button("code", "Code", <Code2 className="size-3.5" />)}
        </div>
        <span className="truncate font-mono text-xs text-fd-muted-foreground">
          {file}
        </span>
      </div>
      <div className={cn(tab !== "preview" && "hidden")}>
        <Live name={name} />
      </div>
      <div
        className={cn(
          "example-code max-h-[32rem] overflow-auto",
          tab !== "code" && "hidden",
        )}
      >
        {code}
      </div>
    </figure>
  );
};
