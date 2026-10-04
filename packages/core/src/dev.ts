import { REVISION } from "three";

// Development warnings
//
// Said once each, and only outside a production build: bundlers replace
// `process.env.NODE_ENV`, and where nothing does, the check is skipped

/** The three.js release the libraries are built against */
export const THREE_REVISION = "186";

const said = new Set<string>();

/**
 * Whether this is a development build.
 * @returns Whether to warn
 */
const developing = (): boolean => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
};

declare const process: { env: { NODE_ENV?: string } };

/**
 * Warn once, in development only, about a likely mistake.
 * @param key What the warning is about; each key is said once
 * @param message What went wrong, and how to put it right
 */
export const dev_warn = (key: string, message: string) => {
  if (said.has(key) || !developing()) return;

  said.add(key);
  console.warn(`[aeronautic] ${message}`);
};

/**
 * Warn, in development, when the effects can't draw with a renderer: they
 * need three's `WebGPURenderer`, of the release they are built for.
 * @param renderer The renderer they are about to draw with
 * @param who Which effect is asking, for the message
 */
export const check_renderer = (renderer: unknown, who: string) => {
  if (!developing()) return;

  if (!(renderer as { isWebGPURenderer?: boolean } | null)?.isWebGPURenderer) {
    dev_warn(
      `renderer:${who}`,
      `${who} draws with TSL and needs three's WebGPURenderer, from "three/webgpu". ` +
        `With React Three Fiber, give the <Canvas> gl={webgpu_gl()} from "@aeronautic/core/react".`,
    );
  }

  if (REVISION !== THREE_REVISION) {
    dev_warn(
      "revision",
      `Built for three r${THREE_REVISION}, running on r${REVISION}: TSL changes between releases, so expect breakage.`,
    );
  }
};
