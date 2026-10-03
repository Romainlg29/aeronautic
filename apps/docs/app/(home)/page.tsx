import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import {
  ArrowRight,
  Atom,
  Boxes,
  Crosshair,
  Layers,
  Mountain,
  Puzzle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { FC, ReactNode } from "react";
import { HeroCanvas } from "@/components/landing/hero-canvas";
import { Install } from "@/components/landing/install";
import { repository, tagline } from "@/lib/shared";
import { source } from "@/lib/source";
import order from "@/content/docs/examples/meta.json";

const SNIPPET = `import { Canvas } from "@react-three/fiber";
import { Afterburner } from "r3f-afterburner";
import { WebGPURenderer } from "three/webgpu";

export const Scene = () => (
  <Canvas
    gl={async (props) => {
      const renderer = new WebGPURenderer(props);
      await renderer.init();
      return renderer;
    }}
  >
    <Afterburner preset="afterburner" throttle={1} />
  </Canvas>
);`;

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Atom />,
    title: "Physically driven",
    body: "Give it a nozzle, a gas and the air. Length, width, shock spacing and colour come out of the jet, not out of art dials.",
  },
  {
    icon: <Boxes />,
    title: "One draw per batch",
    body: "Every plume in a batch is one instanced draw, with distance tiers, so hundreds of nozzles stay affordable.",
  },
  {
    icon: <Crosshair />,
    title: "Placeable anywhere",
    body: "Nest it in JSX, or sit it on any mesh, group or bone of a loaded model with target.",
  },
  {
    icon: <Mountain />,
    title: "Altitude aware",
    body: "The same engine glows orange at the ground and blue-violet up high, because the air around it changed.",
  },
  {
    icon: <Layers />,
    title: "Half-resolution pass",
    body: "Draw the plumes at half size and composite them depth-aware, for the frames that need every millisecond.",
  },
  {
    icon: <Puzzle />,
    title: "Hackable in TSL",
    body: "Hooks change the field or the pixel without forking, and every shader piece is exported.",
  },
];

// Each example's card, painted in its plume's colours: core, flame, and how
// many plumes
const THUMBNAILS: Record<string, [string, string, number]> = {
  "basic-jet": ["#fff1d0", "#f97316", 1],
  presets: ["#ffe4e6", "#a855f7", 1],
  altitude: ["#fde68a", "#6366f1", 1],
  "on-a-model": ["#fff1d0", "#fb923c", 2],
  "nozzle-shapes": ["#fff1d0", "#f97316", 4],
  "throttle-and-aim": ["#ecfeff", "#22d3ee", 1],
  "rocket-mixture": ["#fef9c3", "#ca8a04", 1],
};

/**
 * A painted plume, for an example's card.
 * @param props Its colours, and how many plumes
 * @returns The picture
 */
const Thumbnail: FC<{ colors?: [string, string, number] }> = ({
  colors: [core, flame, count] = ["#fff1d0", "#f97316", 1],
}) => (
  <div className="relative flex h-36 flex-col justify-center gap-6 overflow-hidden bg-[#05070b] px-[10%]">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="relative h-8">
        <div
          className="absolute inset-y-0 left-0 w-[85%] origin-left rounded-full blur-xl transition-transform duration-500 group-hover:scale-x-110"
          style={{
            background: `linear-gradient(90deg, ${core}, ${flame}99 45%, transparent)`,
          }}
        />
        <div
          className="absolute inset-y-2.5 left-0 w-[45%] rounded-full blur-sm"
          style={{
            background: `linear-gradient(90deg, #fff, ${core}cc, transparent)`,
          }}
        />
      </div>
    ))}
  </div>
);

/**
 * A section's heading.
 * @param props Its kicker, its title and what it's about
 * @returns The heading
 */
const Heading: FC<{ kicker: string; title: string; children?: ReactNode }> = ({
  kicker,
  title,
  children,
}) => (
  <div className="mx-auto mb-10 max-w-2xl text-center">
    <p className="mb-2 text-sm font-medium text-fd-primary">{kicker}</p>
    <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
      {title}
    </h2>
    {children && <p className="mt-4 text-fd-muted-foreground">{children}</p>}
  </div>
);

/**
 * The landing page.
 * @returns The page
 */
const HomePage = () => {
  // In the sidebar's order
  const examples = order.pages.flatMap((slug) => {
    const page = source.getPage(["examples", slug]);

    return page ? [page] : [];
  });

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(251_146_60/0.18),transparent_55%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 md:px-6 lg:grid-cols-[1fr_1.15fr] lg:py-24">
          <div className="flex flex-col items-start">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground">
              <Sparkles className="size-3.5 text-fd-primary" />
              React Three Fiber · TSL · WebGPU
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Jet and rocket exhaust,{" "}
              <span className="bg-gradient-to-r from-amber-300 via-orange-500 to-rose-500 bg-clip-text text-transparent">
                raymarched.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-fd-muted-foreground text-pretty">
              Shock diamonds, eddies, soot and heat haze, driven by the engine
              and the air around it. Every plume in a batch is one instanced
              draw.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs/start/introduction/"
                className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
              >
                Get started <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/docs/examples/basic-jet/"
                className="inline-flex items-center gap-2 rounded-lg border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
              >
                Browse examples
              </Link>
            </div>
            <div className="mt-8 w-full">
              <Install command="pnpm add r3f-afterburner" />
            </div>
          </div>

          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-[#05070b] shadow-2xl shadow-orange-950/40 sm:aspect-video lg:aspect-[4/3]">
            <HeroCanvas />
          </div>
        </div>
      </section>

      {/* Code */}
      <section className="border-b">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-20 md:px-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-fd-primary">
              Quick start
            </p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              One component, one plume.
            </h2>
            <p className="mt-4 text-fd-muted-foreground">
              <code>{"<Afterburner>"}</code> is a group with a nozzle at its
              origin. The exhaust streams along its local +X and follows it
              every frame. Pick a preset, or describe your own engine in SI
              units.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Seven presets, from a fighter's reheat to a methalox booster",
                "A throttle that lights and drops the burner on its own",
                "Refs to drive it every frame without a React render",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/docs/start/quick-start/"
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-fd-primary hover:underline"
            >
              Read the quick start <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="min-w-0">
            <ServerCodeBlock
              code={SNIPPET}
              lang="tsx"
              codeblock={{ title: "scene.tsx", className: "my-0 shadow-xl" }}
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 md:px-6">
          <Heading kicker="Why it" title="Plumes that come out of the physics">
            You don't paint the look. You describe the engine and the air, and
            the plume follows.
          </Heading>
          <div className="grid gap-px overflow-hidden rounded-2xl border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon, title, body }) => (
              <div key={title} className="bg-fd-background p-6">
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg border bg-fd-card text-fd-primary [&_svg]:size-5">
                  {icon}
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-fd-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="border-b">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 md:px-6">
          <Heading kicker="Examples" title="Live, with the code beside them">
            Every example runs on the page and shows its own source.
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((page) => (
              <Link
                key={page.url}
                href={page.url}
                className="group overflow-hidden rounded-xl border bg-fd-card transition-colors hover:border-fd-primary/50"
              >
                <Thumbnail colors={THUMBNAILS[page.slugs[1] ?? ""]} />
                <div className="p-4">
                  <h3 className="flex items-center justify-between font-medium">
                    {page.data.title}
                    <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </h3>
                  <p className="mt-1 text-sm text-fd-muted-foreground">
                    {page.data.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgb(251_146_60/0.15),transparent_60%)]" />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Light it up.
          </h2>
          <p className="mt-4 text-fd-muted-foreground">{tagline}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/docs/tutorial/first-jet/"
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              Start the tutorial <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs/how-it-works/the-plume/"
              className="inline-flex items-center gap-2 rounded-lg border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              How it works
            </Link>
            <a
              href={repository}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
