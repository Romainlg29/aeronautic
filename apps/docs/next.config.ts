import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// GitHub Pages serves a project site under /<repo>/, and the workflow says
// which. Locally it is the root
const base_path = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");

const config: NextConfig = {
  output: "export",
  basePath: base_path,
  // Every page is a folder with an index.html, which any static host serves
  trailingSlash: true,
  images: { unoptimized: true },
  // A second mount would make a second WebGPU device for every example
  reactStrictMode: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: base_path,
    NEXT_PUBLIC_REPOSITORY_URL:
      process.env.REPOSITORY_URL ?? "https://github.com/Romainlg29/afterburner",
  },
  turbopack: {
    // The workspace, so the library's source is in reach
    root: fileURLToPath(new URL("../..", import.meta.url)),
    // Served from the library's source rather than its build, so the live
    // examples are always the code in the tree
    resolveAlias: {
      "r3f-afterburner/tsl": "../../packages/afterburner/src/tsl/index.ts",
      "r3f-afterburner": "../../packages/afterburner/src/index.ts",
      "r3f-wing-vapor/tsl": "../../packages/wing-vapor/src/tsl/index.ts",
      "r3f-wing-vapor": "../../packages/wing-vapor/src/index.ts",
    },
  },
};

export default createMDX()(config);
