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
      process.env.REPOSITORY_URL ?? "https://github.com/Romainlg29/aeronautic",
  },
  turbopack: {
    // The workspace, so the library's source is in reach
    root: fileURLToPath(new URL("../..", import.meta.url)),
    // Served from the library's source rather than its build, so the live
    // examples are always the code in the tree
    resolveAlias: {
      "@aeronautic/core/react": "../../packages/core/src/react/index.tsx",
      "@aeronautic/core": "../../packages/core/src/index.ts",
      "@aeronautic/controls/react":
        "../../packages/controls/src/react/index.tsx",
      "@aeronautic/controls": "../../packages/controls/src/index.ts",
      "@aeronautic/afterburner/tsl":
        "../../packages/afterburner/src/tsl/index.ts",
      "@aeronautic/afterburner/react":
        "../../packages/afterburner/src/react/index.tsx",
      "@aeronautic/afterburner/physics":
        "../../packages/afterburner/src/physics.ts",
      "@aeronautic/afterburner": "../../packages/afterburner/src/index.ts",
      "@aeronautic/wing-vapor/tsl":
        "../../packages/wing-vapor/src/tsl/index.ts",
      "@aeronautic/wing-vapor/react":
        "../../packages/wing-vapor/src/react/index.tsx",
      "@aeronautic/wing-vapor/physics":
        "../../packages/wing-vapor/src/physics.ts",
      "@aeronautic/wing-vapor": "../../packages/wing-vapor/src/index.ts",
      "@aeronautic/contrails/react":
        "../../packages/contrails/src/react/index.tsx",
      "@aeronautic/contrails/physics":
        "../../packages/contrails/src/physics.ts",
      "@aeronautic/contrails": "../../packages/contrails/src/index.ts",
      "@aeronautic/lights/react": "../../packages/lights/src/react/index.tsx",
      "@aeronautic/lights/physics": "../../packages/lights/src/physics.ts",
      "@aeronautic/lights": "../../packages/lights/src/index.ts",
    },
  },
};

export default createMDX()(config);
