import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts", tsl: "src/tsl/index.ts" },
  format: "esm",
  platform: "browser",
  dts: true,
  clean: true,
  // Not minified, so no source maps: the published code reads as it is
  sourcemap: false,
});
