import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

// One bundle per extension entry point. iife output keeps everything self-
// contained (no module loading, no remote code) under the strict CSP.
export default {
  input: "src/background.ts",
  output: {
    file: "dist/background.js",
    format: "iife",
    sourcemap: true,
  },
  plugins: [resolve({ browser: true }), commonjs(), typescript()],
};
