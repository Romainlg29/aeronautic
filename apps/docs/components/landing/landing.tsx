"use client";

import { BookOpen, Moon, Play, Sun } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type FC, type ReactNode, useRef, useState } from "react";
import { app_name, repository, tagline } from "@/lib/shared";
import type { Sky } from "./flight-scene";

const FlightScene = dynamic(() => import("./flight-scene"), { ssr: false });

const BUTTON =
  "inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-black/50 [&_svg]:size-4";

/**
 * GitHub's mark, which lucide no longer draws.
 * @returns The icon
 */
const GitHubMark: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
  </svg>
);

/**
 * One of the landing page's buttons: a link, or an action.
 * @param props Where it goes or what it does, and its label
 * @returns The button
 */
const Button: FC<{
  href?: string;
  external?: boolean;
  onClick?: () => void;
  label?: string;
  children: ReactNode;
}> = ({ href, external, onClick, label, children }) => {
  if (!href) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={BUTTON}
      >
        {children}
      </button>
    );
  }

  return external ? (
    <a href={href} className={BUTTON}>
      {children}
    </a>
  ) : (
    <Link href={href} className={BUTTON}>
      {children}
    </Link>
  );
};

/**
 * The landing page: the fighter flying fullscreen, with both libraries on it,
 * and the way into the docs over it.
 * @returns The page
 */
export const Landing: FC = () => {
  const [sky, set_sky] = useState<Sky>("day");
  const readout = useRef<HTMLSpanElement>(null);

  return (
    <main
      className="fixed inset-0 overflow-hidden"
      style={{ background: sky === "day" ? "#6f9fd8" : "#05070b" }}
    >
      <div className="absolute inset-0">
        <FlightScene sky={sky} readout={readout} />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-5 p-4 text-white md:p-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            {app_name}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/80 md:text-base">
            {tagline} An afterburner and the vapor a wing pulls out of humid
            air, both from the physics.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <Button href="/docs/afterburner/start/introduction/">
            <BookOpen /> Docs
          </Button>
          <Button href="/docs/afterburner/examples/basic-jet/">
            <Play /> Examples
          </Button>
          <Button href={repository} external>
            <GitHubMark /> GitHub
          </Button>
          <Button
            onClick={() => set_sky(sky === "day" ? "night" : "day")}
            label={`Switch to ${sky === "day" ? "night" : "day"}`}
          >
            {sky === "day" ? <Moon /> : <Sun />}
            {sky === "day" ? "Night" : "Day"}
          </Button>
          <span
            ref={readout}
            className="ml-auto hidden font-mono text-xs text-white/70 sm:block"
          >
            Loading the fighter…
          </span>
        </nav>
      </div>
    </main>
  );
};
