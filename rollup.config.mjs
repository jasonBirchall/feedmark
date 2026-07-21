import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

// One bundle per extension entry point. iife output keeps everything self-
// contained (no module loading, no remote code) under the strict CSP.
const entry = (input, file) => ({
  input,
  output: {
    file,
    format: "iife",
    sourcemap: true,
  },
  plugins: [resolve({ browser: true }), commonjs(), typescript()],
});

export default [
  entry("src/background.ts", "dist/background.js"),
  entry("src/popup.ts", "dist/popup.js"),
  entry("src/options.ts", "dist/options.js"),
];
