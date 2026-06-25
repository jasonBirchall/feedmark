import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Service-worker / WHATWG globals used across src and tests.
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortController: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        Response: "readonly",
        Headers: "readonly",
        ReadableStream: "readonly",
        DOMException: "readonly",
      },
    },
  },
  // Keep ESLint out of Prettier's lane: disable formatting rules.
  prettier,
);
